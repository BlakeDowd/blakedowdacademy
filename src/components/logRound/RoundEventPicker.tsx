"use client";

import { Check, Trophy } from "lucide-react";
import { InfoBubble } from "@/components/InfoBubble";
import { EVENT_TIERS, SOCIAL_ROUND_ABOUT, scoreDifferential, type EventTier } from "@/lib/eventTiers";

export type RoundEventInput = { tier: EventTier | null; eventName: string; rating: string; slope: string };

export const EMPTY_ROUND_EVENT: RoundEventInput = { tier: null, eventName: "", rating: "", slope: "" };

const INPUT =
  "mt-1 block w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-[15px] text-stone-900 focus:border-[#014421] focus:bg-white focus:outline-none";

/** Parsed event fields for saving, or an error message when rating / slope are out of range. */
export function parseRoundEvent(input: RoundEventInput): {
  error: string | null;
  courseRating: number | null;
  slope: number | null;
} {
  const courseRating = input.rating.trim() ? Math.round(Number(input.rating) * 10) / 10 : null;
  const slope = input.slope.trim() ? Math.round(Number(input.slope)) : null;
  const badRating = courseRating != null && !(courseRating >= 50 && courseRating <= 90);
  const badSlope = slope != null && !(slope >= 55 && slope <= 155);
  const error = badRating
    ? "Course rating is usually between 60 and 80 (e.g. 71.4)."
    : badSlope
      ? "Slope is a whole number between 55 and 155 (e.g. 128)."
      : null;
  return { error, courseRating, slope };
}

const OPTIONS: { id: EventTier | null; label: string; about: string }[] = [
  { id: null, label: "Social round", about: SOCIAL_ROUND_ABOUT },
  ...EVENT_TIERS.map((t) => ({ id: t.id, label: t.label, about: t.about })),
];

/** Lets a player say what kind of event a round was, so competition rounds count toward rankings. */
export function RoundEventPicker({
  value,
  onChange,
  score,
}: {
  value: RoundEventInput;
  onChange: (next: RoundEventInput) => void;
  score: number | null;
}) {
  const { error, courseRating, slope } = parseRoundEvent(value);
  const differential =
    value.tier && score != null && courseRating != null && slope != null && !error
      ? scoreDifferential(score, courseRating, slope)
      : null;

  return (
    <section className="rounded-2xl border border-stone-200 bg-white px-4 pb-4 pt-3.5 shadow-sm">
      <div className="mb-1 flex min-h-7 items-center gap-1.5">
        <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-[#014421]">Event</h2>
        <InfoBubble
          content="Pick the type of event you played. Your coach checks this and can change it."
          buttonClassName="flex h-3.5 w-3.5 shrink-0 cursor-help items-center justify-center rounded-full border border-stone-200 bg-stone-50 text-[8px] font-bold text-stone-400"
          tooltipClassName="-left-16 bottom-full mb-2 w-56 max-w-[14rem]"
        />
      </div>
      <p className="text-xs leading-snug text-stone-500">What kind of round was this?</p>

      <div role="radiogroup" aria-label="Event type" className="mt-2 space-y-1.5">
        {OPTIONS.map((o) => {
          const on = value.tier === o.id;
          return (
            <button
              key={o.id ?? "social"}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange({ ...value, tier: o.id })}
              className={`flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                on ? "border-[#014421] bg-[#014421]/[0.05] ring-1 ring-[#014421]" : "border-stone-200 hover:border-stone-300"
              }`}
            >
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                  on ? "border-[#014421] bg-[#014421] text-white" : "border-stone-300"
                }`}
              >
                {on && <Check className="h-2.5 w-2.5" strokeWidth={3.5} aria-hidden />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-stone-900">{o.label}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-stone-500">{o.about}</span>
              </span>
            </button>
          );
        })}
      </div>

      {value.tier && (
        <div className="mt-3 space-y-3 border-t border-stone-100 pt-3">
          <label className="block text-xs font-medium text-stone-500">
            Event name (optional)
            <input
              value={value.eventName}
              onChange={(e) => onChange({ ...value, eventName: e.target.value })}
              maxLength={120}
              placeholder="e.g. Monthly medal, JNJG Round 4"
              className={INPUT}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-medium text-stone-500">
              Course rating (optional)
              <input
                inputMode="decimal"
                value={value.rating}
                onChange={(e) => onChange({ ...value, rating: e.target.value })}
                placeholder="e.g. 71.4"
                className={INPUT}
              />
            </label>
            <label className="block text-xs font-medium text-stone-500">
              Slope (optional)
              <input
                inputMode="numeric"
                value={value.slope}
                onChange={(e) => onChange({ ...value, slope: e.target.value })}
                placeholder="e.g. 128"
                className={INPUT}
              />
            </label>
          </div>
          <p className="rounded-xl bg-stone-50 px-3 py-2 text-[11px] leading-snug text-stone-500">
            <span className="font-semibold text-stone-700">Where to find these:</span> on the scorecard or the sign at the
            tee, or in the Golf Australia app under the course&apos;s tee details. Use the tees you played from. They let
            your score be compared fairly across courses.
          </p>
          {error ? (
            <p className="text-xs font-medium text-red-600">{error}</p>
          ) : differential != null ? (
            <p className="flex items-center gap-1.5 text-xs font-semibold text-[#014421]">
              <Trophy className="h-3.5 w-3.5" aria-hidden />
              Score differential {differential.toFixed(1)}
            </p>
          ) : (
            <p className="text-xs font-medium text-amber-700">
              Add both the course rating and slope if you can. If you skip them, your coach can add them later.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
