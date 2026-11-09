"use client";

import Link from "next/link";
import { usePracticeHandicap } from "@/hooks/usePracticeHandicap";
import { formatHandicap, weakestArea } from "@/lib/practiceHandicap";
import { TestPlayerButton } from "@/components/coaching/TestPlayerButton";

export type DiscussStrokeSaver = {
  name: string;
  estimatedGain: number;
  current: string | number;
  goal: string | number;
  unit: string;
};

export type DiscussWeek = {
  actualHours: number;
  commitmentHours: number;
  focusMismatch: boolean;
  focusLabel: string;
  topCategory: string | null;
  avgHours?: number | null;
  avgWeeks?: number;
} | null;

/**
 * Compact session notes at the top of a player report — short lines, not AI-style writeups.
 */
export function CoachSessionDiscussFirst({
  playerId,
  playerName,
  strokeSaver,
  week,
  hasGoals,
  combineCount,
  roundsInRange,
}: {
  playerId: string;
  playerName: string;
  strokeSaver: DiscussStrokeSaver | null;
  week: DiscussWeek;
  hasGoals: boolean;
  combineCount: number;
  roundsInRange: number;
}) {
  const hcp = usePracticeHandicap(playerId);
  const practice = hcp.status === "ready" ? hcp.practice : null;
  const playing = hcp.status === "ready" ? hcp.playing : null;
  const weak = practice ? weakestArea(practice) : null;
  const furthest =
    playing != null && practice
      ? practice.areas
          .filter((a) => a.handicap != null)
          .map((a) => ({ area: a, gap: a.handicap! - playing }))
          .sort((a, b) => b.gap - a.gap)[0]
      : null;

  const lines: string[] = [];

  if (furthest && furthest.gap > 0.4) {
    lines.push(
      `${furthest.area.label} ${formatHandicap(furthest.area.handicap!)} · goal ${formatHandicap(playing!)}`,
    );
  } else if (weak) {
    lines.push(`${weak.label} ${formatHandicap(weak.handicap!)} on practice tests`);
  }

  if (strokeSaver) {
    lines.push(
      `${strokeSaver.name}: ${strokeSaver.current} → ${strokeSaver.goal} (~${strokeSaver.estimatedGain.toFixed(1)}/rd)`,
    );
  }

  if (week) {
    if (week.avgHours != null) {
      lines.push(
        `Practice ${week.actualHours.toFixed(1)}h last week · ${week.avgHours.toFixed(1)}h avg (${week.avgWeeks ?? 4} wks)`,
      );
    } else {
      lines.push(`Practice ${week.actualHours.toFixed(1)}h last week · goal ${week.commitmentHours.toFixed(1)}h`);
    }
    if (week.focusMismatch && week.topCategory) {
      lines.push(`Time went to ${week.topCategory}, plan is ${week.focusLabel}`);
    }
  }

  if (!hasGoals) lines.push("Goals not set yet");
  if (combineCount === 0) lines.push("No combines logged");
  if (roundsInRange === 0) lines.push("No rounds in this date range");

  const top = lines.slice(0, 4);

  return (
    <section className="rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-sm print:break-inside-avoid">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-[#014421]">Focus</h2>
        <Link href="#coach-report-body" className="text-[11px] font-semibold text-stone-400 hover:text-stone-700">
          Full report ↓
        </Link>
      </div>

      {top.length === 0 ? (
        <p className="mt-2 text-xs text-stone-500">Nothing logged yet — run a test or round first.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {top.map((line) => (
            <li key={line} className="flex gap-2 text-sm text-stone-800">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#014421]" aria-hidden />
              <span className="leading-snug">{line}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3">
        <TestPlayerButton playerId={playerId} playerName={playerName} className="w-full" />
      </div>
    </section>
  );
}
