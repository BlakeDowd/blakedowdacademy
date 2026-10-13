"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, X } from "lucide-react";
import { COMBINE_LEADERBOARD_OPTIONS, type CombineLeaderboardTestId } from "@/lib/academyCombinesLeaderboard";
import {
  BENCHMARK_LEVELS,
  GAME_AREAS,
  PRACTICE_HANDICAP_BENCHMARKS,
  benchmarkLowerIsBetter,
  benchmarkOrderError,
  handicapFromScore,
  type BenchmarkAnchors,
} from "@/lib/practiceHandicapBenchmarks";
import { benchmarkAnchorsFor, benchmarkUnit, formatHandicap, type CombineAverage } from "@/lib/practiceHandicap";
import { savePracticeHandicapBenchmark, usePracticeHandicapOverrides } from "@/lib/practiceHandicapOverrides";

const levelLabel = (h: number) => (h < 0 ? `+${Math.abs(h)}` : h === 0 ? "Scratch" : String(h));

const scoreAt = (anchors: BenchmarkAnchors, level: number) => {
  const hit = anchors.find(([h]) => h === level);
  return hit ? hit[1] : Math.round(anchorsScore(anchors, level) * 10) / 10;
};

/** Score at a handicap that isn't one of the anchors (older saved sets), read off the line between them. */
function anchorsScore(anchors: BenchmarkAnchors, level: number): number {
  const pts = [...anchors].sort((a, b) => a[0] - b[0]);
  let i = 0;
  while (i < pts.length - 2 && level > pts[i + 1]![0]) i++;
  const [h0, s0] = pts[i]!;
  const [h1, s1] = pts[i + 1]!;
  return h1 === h0 ? s0 : s0 + ((level - h0) * (s1 - s0)) / (h1 - h0);
}

/**
 * Coach editor for the typical score at each handicap on every combine. Changes apply to every player's
 * practice handicap. `averages` are the open player's recent results, shown as a live preview.
 */
export function PracticeHandicapBenchmarksSheet({
  playerName,
  averages,
  onClose,
}: {
  playerName: string;
  averages: CombineAverage[];
  onClose: () => void;
}) {
  const overrides = usePracticeHandicapOverrides();
  const [openId, setOpenId] = useState<CombineLeaderboardTestId | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const firstName = playerName.split(" ")[0] || "Player";

  return createPortal(
    <div className="fixed inset-0 z-[110] flex flex-col bg-[#f4f6f4]" role="dialog" aria-modal="true" aria-label="Practice handicap benchmarks">
      <header className="shrink-0 bg-[#014421] px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
        <div className="mx-auto flex max-w-md items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-white/75">Practice handicap</p>
            <h2 className="truncate text-lg font-bold tracking-tight">Benchmarks</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-white/10" aria-label="Close benchmarks">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-md space-y-4">
          <p className="text-xs leading-relaxed text-stone-500">
            The typical score a golfer of each handicap averages on each test. Changes apply to every player. Tests{" "}
            {firstName} has done show their average and what it plays to.
          </p>
          {!overrides.available && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Run supabase/migrations/20261013100000_practice_handicap_benchmarks.sql in Supabase to save changes.
            </p>
          )}

          {!overrides.loaded && <p className="text-xs text-stone-500">Loading…</p>}
          {overrides.loaded && GAME_AREAS.map((area) => {
            const tests = COMBINE_LEADERBOARD_OPTIONS.filter((o) => PRACTICE_HANDICAP_BENCHMARKS[o.id]?.area === area.id);
            return (
              <section key={area.id} className="rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-sm">
                <h3 className="mb-1 text-xs font-bold uppercase tracking-[0.08em] text-[#014421]">{area.label}</h3>
                <ul className="divide-y divide-stone-100">
                  {tests.map((t) => (
                    <BenchmarkRow
                      key={t.id}
                      id={t.id}
                      label={t.label}
                      edited={overrides.byId.has(t.id)}
                      anchors={benchmarkAnchorsFor(t.id, overrides.byId)!}
                      playerAverage={averages.find((a) => a.id === t.id) ?? null}
                      firstName={firstName}
                      open={openId === t.id}
                      onToggle={() => setOpenId((cur) => (cur === t.id ? null : t.id))}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function BenchmarkRow({
  id,
  label,
  edited,
  anchors,
  playerAverage,
  firstName,
  open,
  onToggle,
}: {
  id: CombineLeaderboardTestId;
  label: string;
  edited: boolean;
  anchors: BenchmarkAnchors;
  playerAverage: CombineAverage | null;
  firstName: string;
  open: boolean;
  onToggle: () => void;
}) {
  const defaults = PRACTICE_HANDICAP_BENCHMARKS[id]!.anchors;
  const lowerIsBetter = benchmarkLowerIsBetter(defaults);
  const unit = benchmarkUnit(id);
  const [draft, setDraft] = useState(() => BENCHMARK_LEVELS.map((h) => String(scoreAt(anchors, h))));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const scores = draft.map((v) => (v.trim() === "" ? NaN : Number(v)));
  const allNumbers = scores.every(Number.isFinite);
  const orderError = allNumbers ? benchmarkOrderError(scores, lowerIsBetter) : "Fill in a score for every handicap.";
  const draftAnchors: BenchmarkAnchors | null = orderError ? null : BENCHMARK_LEVELS.map((h, i) => [h, scores[i]!] as const);
  const changed = draft.some((v, i) => Number(v) !== scoreAt(anchors, BENCHMARK_LEVELS[i]!));

  const preview = playerAverage ? handicapFromScore(draftAnchors ?? anchors, playerAverage.average) : null;

  const save = async (next: BenchmarkAnchors | null) => {
    setSaving(true);
    setMessage(null);
    const err = await savePracticeHandicapBenchmark(id, next);
    setSaving(false);
    if (!err && !next) setDraft(BENCHMARK_LEVELS.map((h) => String(scoreAt(defaults, h))));
    setMessage(err ?? (next ? "Saved for every player." : "Back to the default."));
  };

  return (
    <li className="py-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-lg py-1.5 text-left hover:bg-stone-50"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium text-stone-800">{label}</span>
            {edited && (
              <span className="shrink-0 rounded-full bg-[#FFA500]/15 px-1.5 py-0.5 text-[10px] font-bold text-[#b36b00]">Edited</span>
            )}
          </span>
          <span className="block text-[11px] text-stone-500">
            {playerAverage
              ? `${firstName}: ${playerAverage.averageDisplay} plays to ${formatHandicap(handicapFromScore(anchors, playerAverage.average))}`
              : `Scratch averages ${scoreAt(anchors, 0)}${unit === "%" ? "%" : ` ${unit}`}`}
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-stone-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>

      {open && (
        <div className="mb-2 mt-1 space-y-3 rounded-xl bg-stone-50 px-3 py-3">
          <div className="grid grid-cols-5 gap-1.5">
            {BENCHMARK_LEVELS.map((h, i) => (
              <label key={h} className="min-w-0 text-center">
                <span className="block text-[10px] font-semibold text-stone-500">{levelLabel(h)}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={draft[i]}
                  onChange={(e) => {
                    const next = [...draft];
                    next[i] = e.target.value;
                    setDraft(next);
                    setMessage(null);
                  }}
                  className="mt-0.5 w-full rounded-lg border border-stone-200 bg-white px-1 py-1.5 text-center text-sm font-semibold tabular-nums text-stone-900 focus:border-[#014421] focus:outline-none"
                  aria-label={`Typical ${unit} for a ${levelLabel(h)} handicap`}
                />
              </label>
            ))}
          </div>
          <p className="text-[11px] text-stone-500">
            In {unit === "%" ? "percent" : unit}
            {lowerIsBetter ? ", lower is better." : ", higher is better."} Handicap along the top.
          </p>
          {orderError && changed && <p className="text-[11px] font-semibold text-red-600">{orderError}</p>}
          {preview != null && playerAverage && (
            <p className="rounded-lg bg-white px-2.5 py-1.5 text-xs text-stone-700">
              {firstName}&apos;s {playerAverage.averageDisplay} plays to{" "}
              <span className="font-bold text-[#014421]">{formatHandicap(preview)}</span>
              {changed && draftAnchors ? " with these numbers" : ""}
            </p>
          )}
          {message && <p className="text-[11px] font-semibold text-[#014421]">{message}</p>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!changed || !draftAnchors || saving}
              onClick={() => void save(draftAnchors)}
              className="rounded-lg bg-[#014421] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {changed && (
              <button
                type="button"
                onClick={() => {
                  setDraft(BENCHMARK_LEVELS.map((h) => String(scoreAt(anchors, h))));
                  setMessage(null);
                }}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-100"
              >
                Undo
              </button>
            )}
            {edited && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void save(null)}
                className="ml-auto rounded-lg px-3 py-1.5 text-xs font-semibold text-stone-500 hover:bg-stone-100"
              >
                Reset to default
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
