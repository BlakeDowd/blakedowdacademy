"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, SlidersHorizontal } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { isCoachEmail } from "@/lib/coachEmails";
import {
  PRACTICE_HANDICAP_RECENT_ATTEMPTS,
  formatHandicap,
  practiceHandicapVerdict,
  type HandicapVerdict,
  type PracticeHandicap,
} from "@/lib/practiceHandicap";
import { GAME_AREAS, PRACTICE_HANDICAP_MAX, PRACTICE_HANDICAP_MIN, type GameArea } from "@/lib/practiceHandicapBenchmarks";
import { usePracticeHandicap } from "@/hooks/usePracticeHandicap";
import { ReportEmpty, ReportSection } from "@/components/coach/CoachReportParts";
import { PracticeHandicapBenchmarksSheet } from "@/components/coaching/PracticeHandicapBenchmarksSheet";

const noopSubscribe = () => () => {};

const VERDICT_STYLE: Record<HandicapVerdict["kind"], string> = {
  mental: "border-amber-200 bg-amber-50 text-amber-900",
  skill: "border-[#014421]/20 bg-[#014421]/5 text-[#014421]",
  overachiever: "border-sky-200 bg-sky-50 text-sky-900",
};

/** Bar length: full for the best handicap on the scale, empty for the worst. */
const barPct = (h: number) =>
  Math.round(((PRACTICE_HANDICAP_MAX - h) / (PRACTICE_HANDICAP_MAX - PRACTICE_HANDICAP_MIN)) * 100);

/**
 * Practice handicap from combine results: a handicap per area of the game, averaged into one number and
 * compared with the playing handicap. `self` is the player's own Profile view rather than the coach report.
 */
export function PracticeHandicapCard({
  playerId,
  playerName,
  self = false,
}: {
  playerId: string;
  playerName: string;
  self?: boolean;
}) {
  const state = usePracticeHandicap(playerId);
  const [openArea, setOpenArea] = useState<GameArea | null>(null);
  const [editing, setEditing] = useState(false);
  const { user: viewer } = useAuth();
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const viewerIsCoach = hydrated && (isCoachEmail(viewer?.email) || viewer?.role === "coach");

  const averages = state.status === "ready" ? state.averages : null;
  const practice = state.status === "ready" ? state.practice : null;

  const firstName = playerName.split(" ")[0] || "Player";

  const editButton = viewerIsCoach && (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="inline-flex items-center gap-1 text-xs font-semibold text-[#014421] hover:underline"
    >
      <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
      Benchmarks
    </button>
  );

  const body = (
    <>
      {state.status === "loading" || !practice ? (
        state.status === "error" ? (
          <p className="text-xs text-stone-500">Couldn&apos;t load combine results right now.</p>
        ) : (
          <p className="text-xs text-stone-500">Loading…</p>
        )
      ) : practice.overall == null ? (
        <ReportEmpty>
          {self
            ? "Do a combine test in any area to get your practice handicap. Each area of your game gets its own handicap."
            : `No combines logged yet. Tap Test ${firstName} to run one and start ${firstName}'s practice handicap.`}
        </ReportEmpty>
      ) : (
        <PracticeHandicapBody
          practice={practice}
          playing={state.status === "ready" ? state.playing : null}
          verdict={practiceHandicapVerdict(practice, state.status === "ready" ? state.playing : null, self ? null : firstName)}
          openArea={openArea}
          onToggleArea={(a) => setOpenArea((cur) => (cur === a ? null : a))}
          self={self}
        />
      )}
      {editing && (
        <PracticeHandicapBenchmarksSheet playerName={playerName} averages={averages ?? []} onClose={() => setEditing(false)} />
      )}
    </>
  );

  if (!self) {
    return (
      <ReportSection
        title="Practice handicap"
        subtitle="What the combine tests say each part of the game plays to"
        aside={editButton || undefined}
      >
        {body}
      </ReportSection>
    );
  }

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-md sm:p-6" aria-labelledby="practice-handicap-heading">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 id="practice-handicap-heading" className="text-base font-semibold text-stone-900">
          Practice handicap
        </h3>
        <span className="flex items-center gap-3">
          {editButton}
          <Link href="/practice?plan=combine" className="inline-flex items-center gap-0.5 text-xs font-semibold text-[#014421] hover:underline">
            Do a combine
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </span>
      </div>
      {body}
    </section>
  );
}

function PracticeHandicapBody({
  practice,
  playing,
  verdict,
  openArea,
  onToggleArea,
  self,
}: {
  practice: PracticeHandicap;
  playing: number | null;
  verdict: HandicapVerdict | null;
  openArea: GameArea | null;
  onToggleArea: (area: GameArea) => void;
  self: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-[#014421] p-3 text-white">
          <p className="text-[11px] font-medium text-white/70">Practice handicap</p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums">{formatHandicap(practice.overall!)}</p>
          <p className="mt-0.5 text-[11px] text-white/60">
            {practice.testedAreas} of {GAME_AREAS.length} areas tested
          </p>
        </div>
        <div className="rounded-2xl bg-stone-50 p-3">
          <p className="text-[11px] font-medium text-stone-500">Playing handicap</p>
          <p className={`mt-0.5 text-2xl font-bold tabular-nums ${playing == null ? "text-stone-300" : "text-stone-900"}`}>
            {playing == null ? "–" : formatHandicap(playing)}
          </p>
          <p className="mt-0.5 text-[11px] text-stone-400">
            {playing == null ? (self ? "Log a round to compare" : "No handicap on file") : "From rounds and goals"}
          </p>
        </div>
      </div>

      {verdict && (
        <div className={`rounded-xl border px-3 py-2.5 ${VERDICT_STYLE[verdict.kind]}`}>
          <p className="text-sm font-bold">{verdict.title}</p>
          <p className="mt-0.5 text-xs leading-relaxed opacity-90">{verdict.detail}</p>
        </div>
      )}

      <ul className="divide-y divide-stone-100">
        {practice.areas.map((area) => {
          const open = openArea === area.area;
          if (area.handicap == null) {
            return (
              <li key={area.area} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-sm font-medium text-stone-400">{area.label}</span>
                <span className="text-xs text-stone-400">Not tested yet</span>
              </li>
            );
          }
          return (
            <li key={area.area} className="py-1">
              <button
                type="button"
                onClick={() => onToggleArea(area.area)}
                aria-expanded={open}
                className="flex w-full items-center gap-3 rounded-lg py-1.5 text-left hover:bg-stone-50"
              >
                <span className="w-20 shrink-0 text-sm font-medium text-stone-800">{area.label}</span>
                <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-stone-100">
                  <span className="block h-full rounded-full bg-[#014421]" style={{ width: `${barPct(area.handicap)}%` }} />
                </span>
                <span className="w-12 shrink-0 text-right text-sm font-bold tabular-nums text-stone-900">
                  {formatHandicap(area.handicap)}
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-stone-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
              </button>
              {open && (
                <ul className="mb-1 mt-1 space-y-1 rounded-xl bg-stone-50 px-3 py-2">
                  {area.combines.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 text-xs">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-stone-700">{c.label}</span>
                        <span className="block text-[11px] text-stone-500">
                          {c.averageDisplay} {c.attempts === 1 ? "(1 attempt)" : `(avg of last ${c.attempts})`}
                        </span>
                      </span>
                      <span className="shrink-0 font-bold tabular-nums text-stone-800">{formatHandicap(c.handicap)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <p className="text-[11px] leading-relaxed text-stone-400">
        Each test uses the average of the last {PRACTICE_HANDICAP_RECENT_ATTEMPTS} attempts. The practice handicap is the
        average of the areas tested.
      </p>
    </div>
  );
}
