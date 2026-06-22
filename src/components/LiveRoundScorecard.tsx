"use client";

import {
  courseHoleNumberForPlayingHole,
  effectiveHoleStrokes,
  parForPlayingHole,
  type LiveRoundDraft,
} from "@/lib/liveRoundDraft";

type ScoreShape = "empty" | "par" | "birdie" | "eagle" | "bogey" | "double-plus";

function scoreShape(strokes: number | null, par: number | null): ScoreShape {
  if (strokes == null || strokes <= 0 || par == null) return "empty";
  const diff = strokes - par;
  if (diff <= -2) return "eagle";
  if (diff === -1) return "birdie";
  if (diff === 0) return "par";
  if (diff === 1) return "bogey";
  return "double-plus";
}

function sumDefined(values: (number | null | undefined)[]): number | null {
  let total = 0;
  let any = false;
  for (const v of values) {
    if (v == null || v <= 0) continue;
    total += v;
    any = true;
  }
  return any ? total : null;
}

type ScorecardSection = {
  label: string;
  playingHoles: number[];
  courseHoles: number[];
  pars: (number | null)[];
  strokes: (number | null)[];
};

function buildSections(draft: LiveRoundDraft): ScorecardSection[] {
  const { setup } = draft;

  const sectionForRange = (label: string, playingStart: number, count: number): ScorecardSection => {
    const playingHoles = Array.from({ length: count }, (_, i) => playingStart + i);
    const courseHoles = playingHoles.map((h) => courseHoleNumberForPlayingHole(h, setup));
    const pars = playingHoles.map((h) => {
      const entry = draft.holes.find((e) => e.hole === h);
      return entry?.par ?? parForPlayingHole(h, setup);
    });
    const strokes = playingHoles.map((h) => {
      const entry = draft.holes.find((e) => e.hole === h);
      if (!entry) return null;
      return effectiveHoleStrokes(entry);
    });
    return { label, playingHoles, courseHoles, pars, strokes };
  };

  if (setup.holes === 18) {
    return [
      sectionForRange("OUT", 1, 9),
      sectionForRange("IN", 10, 9),
    ];
  }

  return [sectionForRange(setup.nineSide === "back" ? "IN" : "OUT", 1, 9)];
}

function ScoreCell({
  strokes,
  par,
  isCurrent,
  onSelect,
}: {
  strokes: number | null;
  par: number | null;
  isCurrent: boolean;
  onSelect?: () => void;
}) {
  const shape = scoreShape(strokes, par);
  const hasScore = strokes != null && strokes > 0;

  const shapeClass =
    shape === "birdie"
      ? "rounded-full border-2 border-red-600 text-red-700"
      : shape === "eagle"
        ? "rounded-full border-2 border-red-600 text-red-700 shadow-[0_0_0_2px_white,0_0_0_4px_#dc2626]"
        : shape === "bogey"
          ? "rounded-sm border-2 border-blue-600 text-blue-700"
          : shape === "double-plus"
            ? "rounded-sm border-2 border-blue-600 text-blue-700 shadow-[0_0_0_1px_white,0_0_0_3px_#2563eb]"
            : "";

  const content = hasScore ? (
    <span
      className={`inline-flex h-7 min-w-[1.75rem] items-center justify-center px-0.5 text-sm font-bold tabular-nums ${shapeClass}`}
    >
      {strokes}
    </span>
  ) : (
    <span className="text-sm font-medium text-gray-300">–</span>
  );

  if (!onSelect) {
    return (
      <div
        className={`flex h-10 items-center justify-center ${isCurrent ? "bg-[#FFA500]/20" : ""}`}
      >
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex h-10 w-full items-center justify-center transition-colors hover:bg-gray-100 ${
        isCurrent ? "bg-[#FFA500]/25 ring-1 ring-inset ring-[#FFA500]/60" : ""
      }`}
      aria-label={
        hasScore && par != null
          ? `Hole score ${strokes}, par ${par}`
          : "Go to hole"
      }
    >
      {content}
    </button>
  );
}

function ScorecardGrid({
  section,
  currentPlayingHole,
  onSelectHole,
}: {
  section: ScorecardSection;
  currentPlayingHole: number;
  onSelectHole?: (playingHole: number) => void;
}) {
  const parTotal = sumDefined(section.pars);
  const scoreTotal = sumDefined(section.strokes);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[20rem] border-collapse text-center text-xs">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50/80">
            <th className="sticky left-0 z-10 bg-gray-50/95 px-2 py-1.5 text-left font-semibold text-gray-500">
              Hole
            </th>
            {section.courseHoles.map((n) => (
              <th
                key={`h-${n}`}
                className="min-w-[2.25rem] px-0.5 py-1.5 font-semibold tabular-nums text-gray-700"
              >
                {n}
              </th>
            ))}
            <th className="min-w-[2.5rem] px-1 py-1.5 font-bold text-gray-800">{section.label}</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-gray-100">
            <td className="sticky left-0 z-10 bg-white px-2 py-1 text-left font-semibold text-gray-500">
              Par
            </td>
            {section.pars.map((p, i) => (
              <td key={`p-${section.courseHoles[i]}`} className="px-0.5 py-1 tabular-nums text-gray-600">
                {p ?? "–"}
              </td>
            ))}
            <td className="px-1 py-1 font-bold tabular-nums text-gray-800">{parTotal ?? "–"}</td>
          </tr>
          <tr>
            <td className="sticky left-0 z-10 bg-white px-2 py-0.5 text-left font-semibold text-gray-800">
              Score
            </td>
            {section.playingHoles.map((playingHole, i) => (
              <td key={`s-${section.courseHoles[i]}`} className="px-0.5 py-0">
                <ScoreCell
                  strokes={section.strokes[i]}
                  par={section.pars[i]}
                  isCurrent={playingHole === currentPlayingHole}
                  onSelect={onSelectHole ? () => onSelectHole(playingHole) : undefined}
                />
              </td>
            ))}
            <td className="px-1 py-1.5 text-sm font-bold tabular-nums text-gray-900">
              {scoreTotal ?? "–"}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function LiveRoundScorecard({
  draft,
  onSelectHole,
}: {
  draft: LiveRoundDraft;
  onSelectHole?: (playingHole: number) => void;
}) {
  const sections = buildSections(draft);
  const allPars = sections.flatMap((s) => s.pars);
  const allStrokes = sections.flatMap((s) => s.strokes);
  const parTotal = sumDefined(allPars);
  const scoreTotal = sumDefined(allStrokes);
  const showRoundTotal = draft.setup.holes === 18 && sections.length > 1;

  return (
    <div className="rounded-2xl bg-white p-3 shadow-lg">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-gray-900">Scorecard</p>
        {scoreTotal != null && parTotal != null && (
          <p className="text-xs font-semibold tabular-nums text-gray-600">
            {scoreTotal}
            <span className="mx-1 text-gray-400">/</span>
            {parTotal} par
          </p>
        )}
      </div>

      <div className="space-y-3">
        {sections.map((section) => (
          <ScorecardGrid
            key={section.label}
            section={section}
            currentPlayingHole={draft.currentHole}
            onSelectHole={onSelectHole}
          />
        ))}
      </div>

      {showRoundTotal && (
        <div className="mt-3 flex items-center justify-end gap-3 border-t border-gray-100 pt-2 text-sm">
          <span className="font-semibold text-gray-500">Total</span>
          <span className="font-bold tabular-nums text-gray-900">{scoreTotal ?? "–"}</span>
          <span className="text-gray-400">/</span>
          <span className="font-bold tabular-nums text-gray-600">{parTotal ?? "–"}</span>
        </div>
      )}

      <p className="mt-2 text-[10px] leading-snug text-gray-400">
        PGA-style markers:{" "}
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-red-600 align-middle" />{" "}
        birdie{" "}
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm border border-blue-600 align-middle" />{" "}
        bogey
      </p>
    </div>
  );
}
