"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Crosshair,
  Loader2,
  Mountain,
  Target,
  Wind,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { resolveAuthUserId } from "@/lib/resolveAuthUserId";
import {
  calculatePlaysLikeTarget,
  clubsToCarryList,
  clubsToStrategicBag,
  generateStrategicMenu,
  PLAYER_SHAPE_OPTIONS,
  type PlayerShape,
  type StrategicMenu,
  type TacticalShot,
  type WindDirection,
} from "@/lib/playsLikeCalculator";
import { fetchUserClubs } from "@/lib/playsLikeBag";
import type { PlaysLikeClubFormState } from "@/lib/playsLikeBag";

function parseInputNumber(value: string): number | null {
  const t = value.trim();
  if (t === "" || t === "." || t === "-") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex rounded-xl border border-gray-200 bg-gray-50 p-1">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={`flex-1 rounded-lg px-2 py-2.5 text-xs font-bold uppercase tracking-wide transition ${
            value === opt.id
              ? "bg-[#014421] text-white shadow-sm"
              : "text-gray-500 hover:text-gray-800"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function WindDirectionControl({
  value,
  onChange,
}: {
  value: WindDirection;
  onChange: (v: WindDirection) => void;
}) {
  const options: { id: WindDirection; label: string }[] = [
    { id: "head", label: "Head" },
    { id: "tail", label: "Tail" },
    { id: "none", label: "None" },
  ];
  return <SegmentedToggle options={options} value={value} onChange={onChange} />;
}

function clampSlope(value: number): number {
  return Math.max(-20, Math.min(20, value));
}

const INPUT_CLASS =
  "w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold tabular-nums text-gray-900 outline-none focus:border-[#014421]/40 focus:ring-2 focus:ring-[#014421]/15";

type OptionSetKind = "flight" | "shape" | "tempo";

const OPTION_SET_META: Record<
  OptionSetKind,
  { title: string; shortTitle: string; accent: string }
> = {
  flight: {
    title: "Option Set 1: Flight & Grip Control",
    shortTitle: "Flight & grip",
    accent: "border-sky-100 bg-sky-50/30",
  },
  shape: {
    title: "Option Set 2: Curvature & Shape Selection",
    shortTitle: "Shape",
    accent: "border-violet-100 bg-violet-50/30",
  },
  tempo: {
    title: "Option Set 3: Smooth Tempo Alternatives",
    shortTitle: "Tempo",
    accent: "border-amber-100 bg-amber-50/30",
  },
};

function buildExecutionBadges(shot: TacticalShot, kind: OptionSetKind): string[] {
  const badges: string[] = [];

  if (kind === "flight") {
    if (shot.grip !== "Full Grip") badges.push(shot.grip);
    if (shot.flight !== "STANDARD") badges.push(`${shot.flight} flight`);
    if (shot.tempo !== "100%") badges.push(shot.tempo);
  }

  if (kind === "shape") {
    if (shot.shape !== "Straight") badges.push(shot.shape);
    if (shot.flight !== "STANDARD") badges.push(`${shot.flight} flight`);
  }

  if (kind === "tempo") {
    if (shot.tempo.includes("85%")) badges.push("85% tempo");
    else if (shot.tempo.includes("75%")) badges.push("75% tempo");
    else badges.push(shot.tempo);
    badges.push("Controlled");
  }

  return badges.slice(0, 3);
}

function getPrimaryShotKind(shot: TacticalShot, kind: OptionSetKind): string {
  if (kind === "shape" && shot.shape !== "Straight") return shot.shape;
  if (kind === "tempo") {
    if (shot.tempo.includes("85%")) return "85% tempo";
    if (shot.tempo.includes("75%")) return "75% tempo";
    return shot.tempo;
  }
  if (kind === "flight") {
    if (shot.grip !== "Full Grip") return shot.grip;
    if (shot.flight !== "STANDARD") return `${shot.flight} flight`;
    if (shot.tempo !== "100%") return shot.tempo;
  }
  return buildExecutionBadges(shot, kind)[0] ?? "Standard";
}

function ShotKindBadge({ children, primary }: { children: string; primary?: boolean }) {
  if (primary) {
    return (
      <span className="inline-flex items-center rounded-md border border-[#014421]/25 bg-[#014421]/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[#014421]">
        {children}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-md border border-[#FFA500]/35 bg-[#FFA500]/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#b45309]">
      {children}
    </span>
  );
}

function formatShotCoachingNote(shot: TacticalShot, kind: OptionSetKind): string {
  const detail = shot.label.replace(/^[A-Z\s]+:\s*/i, "").trim();
  if (kind === "tempo" && detail.toLowerCase().includes("spin")) {
    return detail;
  }
  if (kind === "flight" && detail.toLowerCase().includes("stopping")) {
    return detail;
  }
  if (kind === "shape") {
    if (shot.shape === "Draw") {
      return "Draw starts right and works back — useful when the pin is tucked on the left.";
    }
    if (shot.shape === "Fade") {
      return "Fade holds its line left-to-right — ideal when the flag is cut on the right side.";
    }
  }
  return detail || shot.label;
}

function StrategicShotPick({ shot, kind }: { shot: TacticalShot; kind: OptionSetKind }) {
  const primaryKind = getPrimaryShotKind(shot, kind);
  const badges = buildExecutionBadges(shot, kind).filter((b) => b !== primaryKind);
  const note = formatShotCoachingNote(shot, kind);

  return (
    <article className="rounded-lg border border-gray-100 bg-white px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold leading-tight text-gray-900">{shot.clubName}</p>
          <p className="mt-0.5 text-sm font-bold tabular-nums text-[#014421]">{shot.distance}m carry</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <ShotKindBadge primary>{primaryKind}</ShotKindBadge>
          {badges.map((badge) => (
            <ShotKindBadge key={`${shot.clubName}-${badge}`}>{badge}</ShotKindBadge>
          ))}
        </div>
      </div>
      {note ? (
        <p className="mt-2 line-clamp-2 text-[11px] leading-snug text-stone-500">{note}</p>
      ) : null}
    </article>
  );
}

function StrategicOptionSetColumn({
  kind,
  shots,
}: {
  kind: OptionSetKind;
  shots: TacticalShot[];
}) {
  const meta = OPTION_SET_META[kind];

  return (
    <div className={`rounded-xl border p-3 ${meta.accent}`}>
      <h4 className="text-[11px] font-bold uppercase tracking-wide text-gray-700">
        {meta.shortTitle}
      </h4>

      {shots.length === 0 ? (
        <p className="mt-2 text-[11px] leading-snug text-stone-500">
          No match — adjust inputs or bag carries.
        </p>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          {shots.map((shot, i) => (
            <StrategicShotPick
              key={`${kind}-${shot.clubName}-${shot.grip}-${shot.flight}-${shot.tempo}-${i}`}
              shot={shot}
              kind={kind}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StrategicDecisionMatrix({ menu }: { menu: StrategicMenu }) {
  return (
    <div className="flex flex-col gap-3">
      <StrategicOptionSetColumn kind="flight" shots={menu.flightOptions} />
      <StrategicOptionSetColumn kind="shape" shots={menu.shapeOptions} />
      <StrategicOptionSetColumn kind="tempo" shots={menu.tempoOptions} />
    </div>
  );
}

export function PlaysLikeCalculator({
  liveBagClubs,
}: {
  liveBagClubs?: PlaysLikeClubFormState[];
} = {}) {
  const { user } = useAuth();
  const useLiveBag = liveBagClubs != null;
  const [loadingClubs, setLoadingClubs] = useState(!useLiveBag);
  const [carryClubs, setCarryClubs] = useState<
    ReturnType<typeof clubsToCarryList>
  >(() => (useLiveBag ? clubsToCarryList(liveBagClubs) : []));

  const [targetText, setTargetText] = useState("150");
  const [slopeText, setSlopeText] = useState("0");
  const [windSpeedText, setWindSpeedText] = useState("0");
  const [windDirection, setWindDirection] = useState<WindDirection>("none");
  const [playerShape, setPlayerShape] = useState<PlayerShape>("straight");

  useEffect(() => {
    if (useLiveBag) {
      setCarryClubs(clubsToCarryList(liveBagClubs));
      setLoadingClubs(false);
      return;
    }

    let cancelled = false;
    async function load() {
      if (!user?.id) {
        setLoadingClubs(false);
        return;
      }
      setLoadingClubs(true);
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const uid = await resolveAuthUserId(supabase);
        if (!uid || cancelled) return;
        const rows = await fetchUserClubs(supabase, uid);
        if (cancelled) return;
        setCarryClubs(clubsToCarryList(rows));
      } catch (err) {
        console.warn("[ShotBlueprint] load clubs:", err);
      } finally {
        if (!cancelled) setLoadingClubs(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user?.id, useLiveBag, liveBagClubs]);

  const targetDistance = parseInputNumber(targetText) ?? 0;
  const slopeMetres = clampSlope(parseInputNumber(slopeText) ?? 0);
  const windSpeed = Math.max(0, parseInputNumber(windSpeedText) ?? 0);

  const shotInputs = useMemo(
    () => ({
      targetDistanceMetres: targetDistance,
      slopeMetres,
      windSpeed,
      windDirection,
    }),
    [targetDistance, slopeMetres, windSpeed, windDirection],
  );

  const playsLikeTarget = useMemo(
    () => calculatePlaysLikeTarget(shotInputs),
    [shotInputs],
  );

  const strategicMenu = useMemo(() => {
    if (targetDistance <= 0) {
      return { flightOptions: [], shapeOptions: [], tempoOptions: [] };
    }
    return generateStrategicMenu(
      targetDistance,
      slopeMetres,
      windSpeed,
      windDirection,
      clubsToStrategicBag(carryClubs),
      { playerShape },
    );
  }, [targetDistance, slopeMetres, windSpeed, windDirection, carryClubs, playerShape]);

  const slopeClamped = slopeMetres;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 pb-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
          Shot shape
        </p>
        <SegmentedToggle
          options={PLAYER_SHAPE_OPTIONS}
          value={playerShape}
          onChange={setPlayerShape}
        />
      </section>

      <div className="space-y-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#014421]/80">
          Shot blueprint
        </p>
        <h2 className="text-lg font-bold tracking-tight text-stone-900 sm:text-xl">
          Plays Like calculator
        </h2>
        <p className="text-sm leading-relaxed text-stone-600">
          Enter pin distance, slope, and wind — get flight, shape, and tempo options from your bag.
        </p>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex items-center gap-2">
          <Crosshair className="h-4 w-4 text-[#014421]" aria-hidden />
          <h3 className="text-sm font-semibold text-gray-900">Shot inputs</h3>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="pl-target"
              className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500"
            >
              <Target className="h-3.5 w-3.5" aria-hidden />
              Target distance
            </label>
            <div className="relative">
              <input
                id="pl-target"
                type="number"
                inputMode="decimal"
                min={1}
                value={targetText}
                onChange={(e) => setTargetText(e.target.value)}
                className={`${INPUT_CLASS} pr-12`}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase text-gray-400">
                m
              </span>
            </div>
          </div>

          <div>
            <label
              htmlFor="pl-wind-speed"
              className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500"
            >
              <Wind className="h-3.5 w-3.5" aria-hidden />
              Wind speed
            </label>
            <div className="relative">
              <input
                id="pl-wind-speed"
                type="number"
                inputMode="decimal"
                min={0}
                value={windSpeedText}
                onChange={(e) => setWindSpeedText(e.target.value)}
                className={`${INPUT_CLASS} pr-14`}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase text-gray-400">
                km/h
              </span>
            </div>
          </div>

          <div className="sm:col-span-2">
            <label
              htmlFor="pl-slope"
              className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500"
            >
              <Mountain className="h-3.5 w-3.5" aria-hidden />
              Slope / elevation change
            </label>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                id="pl-slope"
                type="range"
                min={-20}
                max={20}
                step={1}
                value={slopeClamped}
                onChange={(e) => setSlopeText(e.target.value)}
                className="h-2 min-w-0 flex-1 cursor-pointer accent-[#014421]"
              />
              <div className="relative w-full sm:w-28">
                <input
                  id="pl-slope-value"
                  type="number"
                  inputMode="decimal"
                  min={-20}
                  max={20}
                  value={slopeText}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setSlopeText(raw);
                    const n = parseInputNumber(raw);
                    if (n != null && n > 20) setSlopeText("20");
                    if (n != null && n < -20) setSlopeText("-20");
                  }}
                  onBlur={() => {
                    const n = parseInputNumber(slopeText);
                    if (n == null) return;
                    setSlopeText(String(clampSlope(n)));
                  }}
                  className={`${INPUT_CLASS} pr-10`}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase text-gray-400">
                  m
                </span>
              </div>
            </div>
            <p className="mt-1.5 text-[10px] text-gray-500">
              Positive = uphill to the target (max 20m) · negative = downhill
            </p>
          </div>

          <div className="sm:col-span-2">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              Wind direction
            </p>
            <WindDirectionControl value={windDirection} onChange={setWindDirection} />
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-gradient-to-br from-[#014421]/[0.07] to-transparent px-4 py-4 text-center sm:px-5 sm:py-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">
            Plays Like target
          </p>
          {playsLikeTarget != null ? (
            <p className="mt-1.5 text-4xl font-bold tabular-nums tracking-tight text-[#014421] sm:text-5xl">
              {playsLikeTarget}
              <span className="ml-1.5 text-xl font-semibold text-gray-400 sm:text-2xl">m</span>
            </p>
          ) : (
            <p className="mt-1.5 text-xl font-semibold text-gray-400">—</p>
          )}
          {targetDistance > 0 && playsLikeTarget != null ? (
            <p className="mt-2 text-xs text-gray-500">
              From {targetDistance}m pin
              {slopeMetres !== 0 ? ` · ${slopeMetres > 0 ? "+" : ""}${slopeMetres}m slope` : ""}
              {windDirection !== "none" && windSpeed > 0
                ? ` · ${windSpeed} km/h ${windDirection}`
                : ""}
            </p>
          ) : null}
        </div>

        <div className="p-4 sm:p-5">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-gray-900">Your options</h3>
            <p className="text-[11px] text-gray-500">
              Flight &amp; grip, shape, or tempo — pick the trade-off that fits the hole.
            </p>
          </div>

          {loadingClubs ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-7 w-7 animate-spin text-[#014421]" aria-hidden />
            </div>
          ) : carryClubs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center">
              <p className="text-sm text-stone-600">
                Add carry distances in your bag profile to see club recommendations.
              </p>
              <Link
                href="/virtual-caddie/bag"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#014421] hover:underline"
              >
                Set up my bag
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          ) : (
            <StrategicDecisionMatrix menu={strategicMenu} />
          )}
        </div>
      </section>
    </div>
  );
}
