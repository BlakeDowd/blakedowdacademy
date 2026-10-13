"use client";

import Link from "next/link";
import { ChevronRight, Crosshair, Gauge } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePracticeHandicap } from "@/hooks/usePracticeHandicap";
import {
  formatHandicap,
  practiceHandicapVerdict,
  weakestArea,
  type HandicapVerdict,
  type PracticeHandicap,
} from "@/lib/practiceHandicap";

const AREA_SHORT: Record<string, string> = {
  driving: "Drive",
  irons: "Irons",
  wedges: "Wedges",
  chipping: "Chip",
  bunkers: "Sand",
  putting: "Putt",
};

function shortVerdict(verdict: HandicapVerdict, practice: PracticeHandicap, playing: number) {
  const weakest = weakestArea(practice);
  const shots = Math.round(Math.abs(playing - practice.overall!));
  if (verdict.kind === "mental") {
    return {
      title: "Your skills are ahead of your scores",
      detail: `About ${shots} shot${shots === 1 ? "" : "s"} a round go missing on the course. Mental game and strategy are the next step.`,
    };
  }
  if (verdict.kind === "overachiever") {
    return {
      title: "You're scoring beyond your tests",
      detail: weakest ? `Your next shots come from building skill, starting with ${weakest.label.toLowerCase()}.` : "",
    };
  }
  return {
    title: "Skill is your limiter",
    detail: weakest ? `Biggest gain: ${weakest.label.toLowerCase()} (${formatHandicap(weakest.handicap!)}).` : "",
  };
}

const wholeHandicap = (h: number) => {
  const r = Math.round(h);
  return r < 0 ? `+${Math.abs(r)}` : String(r);
};

/** Where a handicap sits on the card's scale, 0–100. */
function scaleFor(values: number[]) {
  const lo = Math.floor(Math.min(...values) - 4);
  const hi = Math.ceil(Math.max(...values) + 4);
  return { lo, hi, at: (h: number) => ((h - lo) / (hi - lo)) * 100 };
}

/** Home card: playing handicap against practice handicap, with the gap and what it means. */
export function HomePracticeHandicapCard() {
  const { user } = useAuth();
  const data = usePracticeHandicap(user?.id);

  if (!user?.id || data.status === "error") return null;
  if (data.status === "loading") {
    return (
      <div className="mb-6 w-full px-4">
        <div className="h-[260px] animate-pulse rounded-2xl border border-gray-100 bg-white shadow-sm" aria-hidden />
      </div>
    );
  }

  const { practice, playing } = data;

  if (practice.overall == null) {
    return (
      <div className="mb-6 w-full px-4">
        <Link
          href="/practice?plan=combine"
          className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-colors hover:bg-gray-50"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#014421]/10">
            <Crosshair className="h-5 w-5 text-[#014421]" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-bold text-gray-900">What&apos;s your practice handicap?</span>
            <span className="block text-xs leading-snug text-gray-500">
              Do a combine in any area to see how your skills compare with your{" "}
              {playing == null ? "" : `${formatHandicap(playing)} `}handicap.
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-gray-300" aria-hidden />
        </Link>
      </div>
    );
  }

  const overall = practice.overall;
  const verdict = practiceHandicapVerdict(practice, playing, null);
  const summary = verdict && playing != null ? shortVerdict(verdict, practice, playing) : null;
  const scale = scaleFor(playing == null ? [overall] : [overall, playing]);
  const gap = playing == null ? null : Math.round((playing - overall) * 10) / 10;
  const weakest = weakestArea(practice);
  const bigGap = gap != null && Math.abs(gap) >= 3;

  return (
    <div className="mb-6 w-full px-4">
      <Link
        href="/profile?tab=practice"
        className="block rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-colors hover:bg-gray-50/60"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#014421]/10">
              <Gauge className="h-4 w-4 text-[#014421]" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-bold leading-tight text-gray-900">Handicap vs Practice</h2>
              <p className="truncate text-xs text-gray-500">From your last 3 attempts at each combine</p>
            </div>
          </div>
          <span className="shrink-0 text-sm font-medium" style={{ color: "#FFA500" }}>
            View
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-[#FFA500]/10 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-orange-700">
              <span className="h-2 w-2 rounded-full bg-[#FFA500]" aria-hidden />
              Playing
            </p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums text-gray-900">
              {playing == null ? "–" : formatHandicap(playing)}
            </p>
          </div>
          <div className="rounded-xl bg-[#014421]/[0.06] px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[#014421]">
              <span className="h-2 w-2 rounded-full bg-[#014421]" aria-hidden />
              Practice
            </p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums text-gray-900">{formatHandicap(overall)}</p>
          </div>
        </div>

        <div className="relative mt-5 h-1.5 rounded-full bg-gray-100" aria-hidden>
          {playing != null && (
            <span
              className="absolute inset-y-0 rounded-full"
              style={{
                left: `${Math.min(scale.at(playing), scale.at(overall))}%`,
                width: `${Math.abs(scale.at(playing) - scale.at(overall))}%`,
                backgroundImage: `linear-gradient(to right, ${
                  playing < overall ? "#FFA500, #014421" : "#014421, #FFA500"
                })`,
                opacity: 0.35,
              }}
            />
          )}
          {playing != null && (
            <span
              className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#FFA500] shadow"
              style={{ left: `${scale.at(playing)}%` }}
            />
          )}
          <span
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#014421] shadow"
            style={{ left: `${scale.at(overall)}%` }}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[10px] tabular-nums text-gray-400">
          <span>{wholeHandicap(scale.lo)}</span>
          {gap != null && (
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                bigGap ? "bg-[#FFA500]/15 text-orange-700" : "bg-gray-100 text-gray-600"
              }`}
            >
              {Math.abs(gap) < 0.5 ? "Even" : `${Math.abs(gap).toFixed(1)} shot gap`}
            </span>
          )}
          <span>{wholeHandicap(scale.hi)}</span>
        </div>

        {summary ? (
          <div
            className={`mt-3 rounded-xl border px-3 py-2.5 ${
              verdict!.kind === "mental" ? "border-[#FFA500]/30 bg-[#FFF8EC]" : "border-gray-100 bg-gray-50"
            }`}
          >
            <p className="text-sm font-semibold text-gray-900">{summary.title}</p>
            {summary.detail && <p className="mt-0.5 text-xs leading-snug text-gray-500">{summary.detail}</p>}
          </div>
        ) : (
          <p className="mt-3 rounded-xl bg-gray-50 px-3 py-2.5 text-xs text-gray-500">
            Log a round to compare your practice with your playing handicap.
          </p>
        )}

        <ul className="mt-3 grid grid-cols-6 gap-1.5">
          {practice.areas.map((a) => {
            const isWeakest = weakest?.area === a.area && practice.testedAreas > 1;
            return (
              <li
                key={a.area}
                className={`rounded-lg py-1.5 text-center ${
                  isWeakest ? "bg-[#FFA500]/10 ring-1 ring-[#FFA500]/50" : "bg-gray-50"
                }`}
              >
                <span className={`block text-[10px] font-medium ${isWeakest ? "text-orange-700" : "text-gray-500"}`}>
                  {AREA_SHORT[a.area]}
                </span>
                <span
                  className={`block text-xs font-bold tabular-nums ${
                    a.handicap == null ? "text-gray-300" : isWeakest ? "text-orange-700" : "text-gray-900"
                  }`}
                >
                  {a.handicap == null ? "–" : wholeHandicap(a.handicap)}
                </span>
              </li>
            );
          })}
        </ul>
      </Link>
    </div>
  );
}

