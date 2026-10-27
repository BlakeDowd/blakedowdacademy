"use client";

import { useEffect, useMemo, useState } from "react";
import { Gauge, Plus, Trash2, TrendingUp } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { isCoachEmail } from "@/lib/coachEmails";
import { trackToolUse } from "@/lib/appUsage";
import { TestingForSelect } from "@/components/combine/TestingForSelect";
import type { PlayerOption } from "@/lib/coachingSpaces";
import {
  SPEED_CLUBS,
  SPEED_KINDS,
  addSpeedLogEntry,
  estimateMaxCarry,
  kindLabel,
  loadCarryUnit,
  loadSpeedLog,
  removeSpeedLogEntry,
  saveCarryUnit,
  type CarryUnit,
  type SpeedClubId,
  type SpeedKind,
  type SpeedLogEntry,
} from "@/lib/speedLogging";

const PRESETS = [85, 90, 95, 100, 105, 110, 115];

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (sameDay) return time;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) + " · " + time;
}

export default function SpeedLogging({ hideHeader }: { hideHeader?: boolean }) {
  const { user } = useAuth();
  const isCoach = isCoachEmail(user?.email) || user?.role === "coach";
  const [testingFor, setTestingFor] = useState<PlayerOption | null>(null);
  const playerId = isCoach ? testingFor?.id ?? null : null;

  const [clubId, setClubId] = useState<SpeedClubId>("driver");
  const [kind, setKind] = useState<SpeedKind>("on_course");
  const [unit, setUnit] = useState<CarryUnit>("m");
  const [speedText, setSpeedText] = useState("");
  const [log, setLog] = useState<SpeedLogEntry[]>([]);

  useEffect(() => {
    setUnit(loadCarryUnit());
  }, []);

  useEffect(() => {
    setLog(loadSpeedLog(playerId));
  }, [playerId]);

  const speed = Number(speedText);
  const estimate = useMemo(
    () => (speedText.trim() ? estimateMaxCarry(speed, clubId) : null),
    [speedText, speed, clubId],
  );

  const bestByKind = useMemo(() => {
    const forClub = log.filter((e) => e.clubId === clubId);
    const pick = (k: SpeedKind) => {
      const rows = forClub.filter((e) => e.kind === k);
      if (!rows.length) return null;
      return rows.reduce((a, b) => (b.clubSpeedMph > a.clubSpeedMph ? b : a));
    };
    return { on_course: pick("on_course"), max: pick("max") };
  }, [log, clubId]);

  const carryPrimary = (e: { carryYards: number; carryMetres: number }) =>
    unit === "m" ? e.carryMetres : e.carryYards;
  const carryLabel = unit === "m" ? "m" : "yd";

  const setCarryUnit = (next: CarryUnit) => {
    setUnit(next);
    saveCarryUnit(next);
  };

  const logSwing = () => {
    if (!estimate) return;
    trackToolUse("speed-logging");
    setLog(
      addSpeedLogEntry(estimate, {
        clubId,
        kind,
        playerId,
        playerName: testingFor?.name ?? null,
      }),
    );
    setSpeedText("");
  };

  return (
    <div className="space-y-4">
      {!hideHeader && (
        <div className="flex items-center gap-2 text-[#014421]">
          <Gauge className="h-5 w-5" aria-hidden />
          <h2 className="text-lg font-bold">Speed logging</h2>
        </div>
      )}

      {isCoach && (
        <TestingForSelect
          value={testingFor}
          onChange={setTestingFor}
          promptTitle="Who are you logging for?"
          promptHint="Yourself, or search a player in your lesson"
          selectedTitle={(name) => `Logging for ${name}`}
          selectedHint="Speeds save under their name on this phone."
        />
      )}

      <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Club</p>
          <div className="flex rounded-full bg-stone-100 p-0.5" role="radiogroup" aria-label="Carry distance unit">
            {([
              { id: "m" as const, label: "Metres" },
              { id: "yd" as const, label: "Yards" },
            ]).map((u) => (
              <button
                key={u.id}
                type="button"
                role="radio"
                aria-checked={unit === u.id}
                onClick={() => setCarryUnit(u.id)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                  unit === u.id ? "bg-[#014421] text-white" : "text-stone-600 hover:text-stone-900"
                }`}
              >
                {u.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {SPEED_CLUBS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setClubId(c.id)}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                clubId === c.id ? "bg-[#014421] text-white" : "bg-stone-100 text-stone-700 hover:bg-stone-200"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-stone-500">Driver only for now — more clubs can be added later.</p>
      </section>

      <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Swing type</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {SPEED_KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setKind(k.id)}
              className={`rounded-2xl px-3 py-3 text-left transition ring-1 ${
                kind === k.id
                  ? "bg-[#014421] text-white ring-[#014421]"
                  : "bg-stone-50 text-stone-800 ring-stone-200 hover:bg-stone-100"
              }`}
            >
              <span className="block text-sm font-bold">{k.label}</span>
              <span className={`mt-0.5 block text-[11px] ${kind === k.id ? "text-white/75" : "text-stone-500"}`}>
                {k.hint}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">Club speed (mph)</span>
          <input
            type="number"
            inputMode="decimal"
            min={40}
            max={160}
            step={0.1}
            value={speedText}
            onChange={(e) => setSpeedText(e.target.value)}
            placeholder="e.g. 98"
            className="mt-2 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-2xl font-bold tabular-nums text-stone-900 placeholder:text-stone-300 focus:border-[#014421] focus:outline-none focus:ring-1 focus:ring-[#014421]/30"
          />
        </label>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setSpeedText(String(n))}
              className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-200"
            >
              {n}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-3xl bg-[#014421] p-4 text-white shadow-sm">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-[#FFA500]" aria-hidden />
          <p className="text-xs font-semibold uppercase tracking-wide text-white/75">
            Max carry if struck perfectly
          </p>
        </div>
        {estimate ? (
          <div className="mt-3 space-y-3">
            <div>
              <p className="text-4xl font-extrabold tabular-nums tracking-tight">
                {carryPrimary(estimate)}
                <span className="ml-1 text-lg font-bold text-white/80">{carryLabel}</span>
              </p>
              <p className="mt-1 text-xs text-white/65">
                {unit === "m"
                  ? `${estimate.carryYards} yards · `
                  : `${estimate.carryMetres} metres · `}
                est. ball speed {estimate.ballSpeedMph} mph · calm, sea level
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-white/80">Enter club speed to see potential carry.</p>
        )}
        <button
          type="button"
          onClick={logSwing}
          disabled={!estimate}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#FFA500] py-3 text-sm font-bold text-[#3d2600] disabled:opacity-40"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Log {kind === "max" ? "max" : "on-course"} speed
        </button>
      </section>

      {(bestByKind.on_course || bestByKind.max) && (
        <div className="grid grid-cols-2 gap-2 px-1 text-center text-xs text-stone-600">
          <p>
            Best on-course
            <span className="mt-0.5 block font-semibold text-stone-900">
              {bestByKind.on_course
                ? `${bestByKind.on_course.clubSpeedMph} mph · ${carryPrimary(bestByKind.on_course)} ${carryLabel}`
                : "—"}
            </span>
          </p>
          <p>
            Best max
            <span className="mt-0.5 block font-semibold text-stone-900">
              {bestByKind.max
                ? `${bestByKind.max.clubSpeedMph} mph · ${carryPrimary(bestByKind.max)} ${carryLabel}`
                : "—"}
            </span>
          </p>
        </div>
      )}

      <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
        <h3 className="text-sm font-bold text-stone-900">Session log</h3>
        <p className="mt-0.5 text-[11px] text-stone-500">
          {testingFor ? `Saved for ${testingFor.name} on this phone.` : "Saved on this phone. Newest first."}
        </p>
        {log.length === 0 ? (
          <p className="mt-4 text-center text-sm text-stone-500">No speeds logged yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-stone-100">
            {log.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold tabular-nums text-stone-900">
                    {e.clubSpeedMph} mph
                    <span className="font-medium text-stone-500">
                      {" "}
                      → {carryPrimary(e)} {carryLabel}
                    </span>
                  </span>
                  <span className="block text-[11px] text-stone-400">
                    {kindLabel(e.kind)} · {formatWhen(e.at)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setLog(removeSpeedLogEntry(e.id, playerId))}
                  className="rounded-full p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                  aria-label="Remove entry"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
