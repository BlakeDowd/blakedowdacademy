"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Trophy } from "lucide-react";
import { formatHandicap } from "@/lib/practiceHandicap";
import { EVENT_TIERS, eventTier, recencyWeight, saveRoundEvent, scoreDifferential, type EventTier } from "@/lib/eventTiers";
import { MIN_DATA, type TournamentRound } from "@/lib/talentIndex";

const INPUT =
  "mt-1 block w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 outline-none focus:border-[#014421] focus:bg-white";

const niceDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

function RoundEditor({ round, onSaved }: { round: TournamentRound; onSaved: (next: TournamentRound) => void }) {
  const [tier, setTier] = useState<EventTier | null>(round.tier);
  const [eventName, setEventName] = useState(round.eventName);
  const [rating, setRating] = useState(round.courseRating?.toString() ?? "");
  const [slope, setSlope] = useState(round.slope?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ratingNum = rating.trim() ? Number(rating) : null;
  const slopeNum = slope.trim() ? Math.round(Number(slope)) : null;
  const badRating = ratingNum != null && !(ratingNum >= 50 && ratingNum <= 90);
  const badSlope = slopeNum != null && !(slopeNum >= 55 && slopeNum <= 155);
  const preview =
    tier && round.score != null && ratingNum != null && slopeNum != null && !badRating && !badSlope && round.holes >= 18
      ? scoreDifferential(round.score, ratingNum, slopeNum)
      : null;

  const save = async () => {
    setSaving(true);
    setError(null);
    const err = await saveRoundEvent(round.id, {
      tier,
      eventName: tier ? eventName : "",
      courseRating: tier ? ratingNum : null,
      slope: tier ? slopeNum : null,
    });
    setSaving(false);
    if (err) {
      setError(err);
      return;
    }
    onSaved({
      ...round,
      tier,
      eventName: tier ? eventName.trim() : "",
      courseRating: tier ? ratingNum : null,
      slope: tier ? slopeNum : null,
      differential: tier ? preview : null,
    });
  };

  return (
    <div className="border-t border-stone-100 px-4 pb-4 pt-3">
      <p className="text-[11px] font-medium text-stone-500">Event tier</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {[{ id: null, label: "Social (not counted)" }, ...EVENT_TIERS].map((t) => (
          <button
            key={t.id ?? "social"}
            type="button"
            onClick={() => setTier(t.id as EventTier | null)}
            aria-pressed={tier === t.id}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              tier === t.id ? "bg-[#014421] text-white" : "bg-white text-stone-600 ring-1 ring-stone-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tier && (
        <>
          <label className="mt-3 block text-[11px] font-medium text-stone-500">
            Event name
            <input value={eventName} onChange={(e) => setEventName(e.target.value)} maxLength={120} placeholder="e.g. JNJG Round 4" className={INPUT} />
          </label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="block text-[11px] font-medium text-stone-500">
              Course rating
              <input inputMode="decimal" value={rating} onChange={(e) => setRating(e.target.value)} placeholder="e.g. 71.4" className={INPUT} />
            </label>
            <label className="block text-[11px] font-medium text-stone-500">
              Slope
              <input inputMode="numeric" value={slope} onChange={(e) => setSlope(e.target.value)} placeholder="e.g. 128" className={INPUT} />
            </label>
          </div>
          {(badRating || badSlope) && (
            <p className="mt-1 text-[11px] font-medium text-red-600">
              {badRating ? "Course rating is usually 60–80. " : ""}
              {badSlope ? "Slope must be 55–155." : ""}
            </p>
          )}
          <p className="mt-2 text-[11px] text-stone-500">
            {round.holes < 18
              ? "9-hole rounds are saved but don't count toward the competitive score."
              : preview != null
                ? `Differential ${formatHandicap(preview)} · counts ×${(eventTier(tier)!.weight * recencyWeight(round.atMs)).toFixed(2)} today`
                : "Add the course rating and slope from the scorecard to work out the differential."}
          </p>
        </>
      )}
      {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || badRating || badSlope}
          className="rounded-xl bg-[#014421] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

/** Coach-only: mark a player's rounds as competition rounds so they count toward the Talent Index. */
export function TournamentRoundsSheet({
  playerName,
  rounds,
  onClose,
  onChanged,
}: {
  playerName: string;
  rounds: TournamentRound[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [saved, setSaved] = useState<Map<string, TournamentRound>>(() => new Map());
  const [openId, setOpenId] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);

  const close = () => {
    if (changed) onChanged();
    onClose();
  };

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const list = rounds.slice(0, 60).map((r) => saved.get(r.id) ?? r);
  const counting = list.filter((r) => r.tier && r.differential != null && recencyWeight(r.atMs) > 0).length;

  return createPortal(
    <div className="fixed inset-0 z-[110] flex flex-col bg-[#f4f6f4]" role="dialog" aria-modal="true" aria-label="Tournament rounds">
      <header className="shrink-0 bg-[#014421] px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
        <div className="mx-auto flex max-w-md items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-white/75">{playerName}</p>
            <h2 className="truncate text-lg font-bold tracking-tight">Tournament rounds</h2>
            <p className="mt-0.5 text-[11px] text-white/70">
              {counting} counting in the last 6 months{counting < MIN_DATA ? ` · needs ${MIN_DATA} to score` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-[#014421] hover:bg-white/90"
          >
            Done
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-10 pt-3">
        <div className="mx-auto max-w-md">
          <p className="mb-2 text-xs leading-relaxed text-stone-500">
            Tap a round to mark it as a competition. Untagged rounds are social and don&apos;t count. Rounds count less as they
            age and drop off after 6 months.
          </p>
          {list.length === 0 ? (
            <p className="rounded-2xl bg-white py-8 text-center text-sm text-stone-500">No rounds logged yet.</p>
          ) : (
            <ul className="space-y-2">
              {list.map((r) => {
                const tier = eventTier(r.tier);
                const open = openId === r.id;
                return (
                  <li key={r.id} className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : r.id)}
                      aria-expanded={open}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left"
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                          tier ? "bg-[#FFA500]/15 text-[#b86e00]" : "bg-stone-100 text-stone-400"
                        }`}
                        aria-hidden
                      >
                        <Trophy className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-stone-900">
                          {r.eventName || r.course || "Round"}
                        </span>
                        <span className="block truncate text-[11px] text-stone-500">
                          {niceDate(r.date)} · {r.score ?? "–"}
                          {r.holes < 18 ? " (9 holes)" : ""}
                          {tier ? ` · ${tier.short}` : " · Social"}
                          {r.differential != null ? ` · Diff ${formatHandicap(r.differential)}` : ""}
                        </span>
                      </span>
                      <ChevronDown className={`h-4 w-4 shrink-0 text-stone-400 transition ${open ? "rotate-180" : ""}`} aria-hidden />
                    </button>
                    {open && (
                      <RoundEditor
                        round={r}
                        onSaved={(next) => {
                          setSaved((m) => new Map(m).set(next.id, next));
                          setChanged(true);
                          setOpenId(null);
                        }}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
