"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { isCoachEmail } from "@/lib/coachEmails";
import { describeScoring, scoreTypeText, type DrillScoreType, type DrillScoring } from "@/lib/drillScoring";
import { saveDrillScoring } from "@/lib/drillScoringOverrides";

const OPTIONS: { type: DrillScoreType; label: string; hint: string }[] = [
  { type: "makes", label: "Out of", hint: "e.g. 7 out of 10" },
  { type: "streak", label: "Streak", hint: "How many in a row" },
  { type: "count", label: "Count", hint: "e.g. chip ins" },
  { type: "strokes", label: "Lower is better", hint: "Putts, strokes" },
  { type: "time", label: "Fastest time", hint: "Seconds or minutes" },
  { type: "speed", label: "Top speed", hint: "Swing or ball speed" },
  { type: "completion", label: "Just done", hint: "No score" },
];

const UNIT_DEFAULTS: Partial<Record<DrillScoreType, string>> = { strokes: "strokes", time: "sec", speed: "mph" };

const UNIT_CHOICES: Partial<Record<DrillScoreType, { value: string; label: string }[]>> = {
  time: [
    { value: "sec", label: "Seconds" },
    { value: "min", label: "Minutes" },
  ],
  speed: [
    { value: "mph", label: "mph" },
    { value: "km/h", label: "km/h" },
  ],
};

const FIELD =
  "rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 placeholder:text-gray-300 focus:border-[#014421] focus:outline-none focus:ring-1 focus:ring-[#014421]/30";

export function useIsCoach(): boolean {
  const { user } = useAuth();
  return isCoachEmail(user?.email) || user?.role === "coach";
}

/** Coach-only control to choose how a drill is scored. Saves for every student straight away. */
export default function DrillScoringPicker({
  drillKey,
  scoring,
  hasOverride,
}: {
  drillKey: string;
  scoring: DrillScoring;
  /** True when a coach has chosen this drill's scoring in the app (so it can be cleared). */
  hasOverride: boolean;
}) {
  const coachSet = scoring.source === "coach";
  const isCoach = useIsCoach();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<DrillScoreType>(scoring.type);
  const [outOf, setOutOf] = useState("10");
  const [unit, setUnit] = useState("");
  const [timer, setTimer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isCoach) return null;

  const unitFor = (t: DrillScoreType) => (t === scoring.type && t !== "makes" ? scoring.unit : (UNIT_DEFAULTS[t] ?? ""));

  const startEditing = () => {
    setType(scoring.type);
    setOutOf(String(scoring.max ?? 10));
    setUnit(unitFor(scoring.type));
    setTimer(scoring.timer);
    setError(null);
    setOpen(true);
  };

  const pickType = (t: DrillScoreType) => {
    setType(t);
    setUnit(unitFor(t));
    setError(null);
  };

  const save = async (value: string | null) => {
    setSaving(true);
    const message = await saveDrillScoring(drillKey, value);
    setSaving(false);
    if (message) setError(message);
    else setOpen(false);
  };

  const submit = () => {
    let max: number | null = null;
    if (type === "makes") {
      max = Number(outOf);
      if (!Number.isInteger(max) || max < 1 || max > 200) {
        setError("Out of should be a whole number from 1 to 200.");
        return;
      }
    }
    void save(scoreTypeText({ type, unit, max, timer }));
  };

  if (!open) {
    return (
      <div
        className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-[#014421]/30 bg-white px-2.5 py-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-gray-600">
          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-[#014421]" aria-hidden />
          <span className="truncate">
            <span className="font-semibold text-gray-900">Scoring:</span> {describeScoring(scoring)}
            {scoring.timer && <span className="text-gray-900"> · timer on</span>}
            <span className={coachSet ? "text-[#014421]" : "text-[#c77c00]"}>
              {coachSet ? " · set" : " · app's guess"}
            </span>
          </span>
        </span>
        <button
          type="button"
          onClick={startEditing}
          className="shrink-0 text-[11px] font-semibold text-[#014421] underline underline-offset-2"
        >
          {coachSet ? "Change" : "Set"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 rounded-lg bg-white p-2.5 ring-1 ring-[#014421]/30" onClick={(e) => e.stopPropagation()}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">How is this drill scored? (coach only)</p>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {OPTIONS.map((o) => {
          const active = o.type === type;
          return (
            <button
              key={o.type}
              type="button"
              onClick={() => pickType(o.type)}
              aria-pressed={active}
              className={`rounded-lg px-2 py-1.5 text-left ring-1 transition-colors ${
                active ? "bg-[#014421] text-white ring-[#014421]" : "bg-white text-gray-800 ring-gray-200 hover:ring-[#014421]/40"
              }`}
            >
              <span className="block text-xs font-bold">{o.label}</span>
              <span className={`block text-[10px] leading-tight ${active ? "text-white/75" : "text-gray-500"}`}>{o.hint}</span>
            </button>
          );
        })}
      </div>

      {type === "makes" && (
        <label className="flex items-center gap-2 text-xs text-gray-700">
          <span className="shrink-0 font-semibold">Out of</span>
          <input
            type="text"
            inputMode="numeric"
            value={outOf}
            onChange={(e) => setOutOf(e.target.value.replace(/\D/g, "").slice(0, 3))}
            className={`${FIELD} w-20 text-center tabular-nums`}
            aria-label="Out of how many"
          />
        </label>
      )}
      {(type === "count" || type === "strokes") && (
        <label className="block text-xs text-gray-700">
          <span className="mb-1 block font-semibold">{type === "count" ? "What are they counting?" : "What are they counting? (fewer is better)"}</span>
          <input
            type="text"
            value={unit}
            onChange={(e) => setUnit(e.target.value.slice(0, 24))}
            placeholder={type === "count" ? "e.g. chip ins, clubs, fairways" : "e.g. putts, strokes, balls"}
            className={`${FIELD} w-full`}
          />
        </label>
      )}
      {UNIT_CHOICES[type] && (
        <div className="flex gap-1.5" role="group" aria-label="Unit">
          {UNIT_CHOICES[type]!.map((u) => (
            <button
              key={u.value}
              type="button"
              onClick={() => setUnit(u.value)}
              aria-pressed={unit === u.value}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 ${
                unit === u.value ? "bg-[#014421] text-white ring-[#014421]" : "bg-white text-gray-700 ring-gray-200"
              }`}
            >
              {u.label}
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        role="switch"
        aria-checked={timer}
        onClick={() => setTimer((t) => !t)}
        className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left ring-1 ring-gray-200 hover:ring-[#014421]/40"
      >
        <span>
          <span className="block text-xs font-bold text-gray-900">Show timer</span>
          <span className="block text-[10px] leading-tight text-gray-500">Countdown or stopwatch on this drill</span>
        </span>
        <span
          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${timer ? "bg-[#014421]" : "bg-gray-300"}`}
          aria-hidden
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${timer ? "left-[18px]" : "left-0.5"}`}
          />
        </span>
      </button>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex items-center justify-between gap-2">
        {hasOverride ? (
          <button
            type="button"
            onClick={() => void save(null)}
            disabled={saving}
            className="text-[11px] font-medium text-gray-500 underline underline-offset-2 hover:text-gray-700 disabled:opacity-50"
          >
            Clear (use app&apos;s guess)
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="rounded-lg bg-[#014421] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#013320] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
