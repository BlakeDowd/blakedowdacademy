"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Eye, Footprints, Ruler } from "lucide-react";
import { useCombineUser } from "@/hooks/useCombineUser";
import { pointsForAbsoluteError } from "@/lib/aimpoint6ftCombineScoring";
import { parsePercentOneDecimal } from "@/lib/slopeReadingParse";
import { CombineFlowBackControl } from "@/components/CombineFlowBackControl";
import {
  CombineHero,
  IntroSteps,
  PlayAgainButton,
  PrimaryButton,
  ProgressTrack,
  ResultHero,
  SaveStatus,
  ScoreRing,
  ScoringGuide,
  StatTiles,
  StepDots,
  type TrackItem,
} from "@/components/combine/PuttingCombineUi";
import { BreakdownBar, BreakdownCard, EveryShotList, FocusCard, ValueRow } from "@/components/combine/CombineBreakdown";

export type AimpointMark = "33" | "50" | "66";
export type MarkReading = { guess: number; actual: number };
export type MarkReadings = Partial<Record<AimpointMark, MarkReading>>;

export type AimpointSummary = {
  totalPoints: number;
  maxPoints: number;
  bias: number;
  reader: "Under-Reader" | "Over-Reader" | "Neutral";
  message: string | null;
};

export type AimpointFormat<R> = {
  title: string;
  chips: string[];
  marks: AimpointMark[];
  puttCount: number;
  buildDistances: () => number[];
  toRow: (putt: number, targetFt: number, readings: Record<AimpointMark, MarkReading>) => R;
  fromRow: (row: R) => MarkReadings;
  /** @returns null on success, or a user-visible error */
  persist: (userId: string, log: R[]) => Promise<string | null>;
  summarize: (log: R[]) => AimpointSummary;
};

type Inputs = Record<AimpointMark, string>;
const EMPTY: Inputs = { "33": "", "50": "", "66": "" };

function pointsTone(ratio: number): string {
  if (ratio >= 0.8) return "bg-[#014421] text-white";
  if (ratio >= 0.5) return "bg-green-200 text-[#014421]";
  if (ratio >= 0.25) return "bg-amber-200 text-amber-900";
  return "bg-red-500 text-white";
}

function rowPoints(readings: MarkReadings, marks: AimpointMark[]): number {
  return marks.reduce((s, m) => {
    const r = readings[m];
    return r ? s + pointsForAbsoluteError(Math.abs(r.guess - r.actual)) : s;
  }, 0);
}

const signedPct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;

/** Reads scoring 8+ are within 0.2% of the measured slope. */
const CLOSE_POINTS = 8;

const MARK_TIPS: Record<AimpointMark, string> = {
  "33": "Near the ball: stand on the line a third of the way along and feel the slope through your feet before you put a number on it.",
  "50": "Halfway is where long putts change the most. Take a proper read there rather than guessing from the two ends.",
  "66": "Near the hole the ball is slow and breaks the most. Take your time with this read instead of rushing to putt.",
};

type DistanceBand = { label: string; min: number; max: number };

/** Splits distances into bands with roughly equal putt counts, never splitting one distance across two bands. */
function distanceBands(distances: number[], groups: number): DistanceBand[] {
  const sorted = [...distances].sort((a, b) => a - b);
  const unique = [...new Set(sorted)];
  if (unique.length <= groups) return unique.map((d) => ({ label: `${d} ft`, min: d, max: d }));
  const bands: DistanceBand[] = [];
  let start = 0;
  for (let i = 0; i < sorted.length; i++) {
    const cut = (sorted.length * (bands.length + 1)) / groups;
    const last = i === sorted.length - 1;
    if (last || (i + 1 >= cut && sorted[i + 1] !== sorted[i] && bands.length < groups - 1)) {
      const min = sorted[start]!;
      const max = sorted[i]!;
      bands.push({ label: min === max ? `${min} ft` : `${min}–${max} ft`, min, max });
      start = i + 1;
    }
  }
  return bands;
}

/** Everything the AimPoint results screen shows, including the "focus next" tip. */
function aimpointBreakdown(rows: MarkReadings[], marks: AimpointMark[], distances: number[], maxPerPutt: number) {
  const reads = rows.flatMap((r, putt) =>
    marks.flatMap((mark) => {
      const x = r[mark];
      if (!x) return [];
      const err = x.guess - x.actual;
      return [{ putt, mark, err, pts: pointsForAbsoluteError(Math.abs(err)) }];
    }),
  );
  const n = reads.length;
  const avgAbsErr = n > 0 ? reads.reduce((s, x) => s + Math.abs(x.err), 0) / n : 0;
  const close = reads.filter((x) => x.pts >= CLOSE_POINTS).length;
  const over = reads.filter((x) => x.pts < CLOSE_POINTS && x.err > 0).length;
  const under = reads.filter((x) => x.pts < CLOSE_POINTS && x.err < 0).length;
  const off = over + under;
  const wayOut = reads.filter((x) => x.pts === 0).length;

  const byMark = marks.map((mark) => {
    const at = reads.filter((x) => x.mark === mark);
    const k = at.length || 1;
    return {
      mark,
      avg: at.reduce((s, x) => s + x.pts, 0) / k,
      avgAbsErr: at.reduce((s, x) => s + Math.abs(x.err), 0) / k,
    };
  });
  const rankedMarks = [...byMark].sort((a, b) => a.avg - b.avg);
  const markSpread = rankedMarks.length > 1 && rankedMarks[0]!.avg < rankedMarks[rankedMarks.length - 1]!.avg;
  const weakMark = markSpread ? rankedMarks[0]! : null;
  const bestMark = markSpread ? rankedMarks[rankedMarks.length - 1]! : null;

  const puttPoints = rows.map((r) => rowPoints(r, marks));
  const bands = distanceBands(distances.slice(0, rows.length), 3).map((b) => {
    const idx = puttPoints.map((_, i) => i).filter((i) => distances[i]! >= b.min && distances[i]! <= b.max);
    return { ...b, n: idx.length, avg: idx.reduce((s, i) => s + puttPoints[i]!, 0) / (idx.length || 1) };
  });
  const rankedBands = [...bands].sort((a, b) => a.avg - b.avg);
  const weakBand =
    rankedBands.length > 1 && rankedBands[0]!.avg < rankedBands[rankedBands.length - 1]!.avg ? rankedBands[0]! : null;

  const track: TrackItem[] = puttPoints.map((pts, i) => ({
    label: String(pts),
    tone: pointsTone(pts / maxPerPutt),
    ariaLabel: `Putt ${i + 1}: ${pts} points`,
  }));

  let focus: { title: string; lines: string[] };
  const leanShare = off > 0 ? Math.max(over, under) / off : 0;
  if (n > 0 && reads.every((x) => x.pts === 10)) {
    focus = { title: "Perfect reads", lines: ["Every read matched the slope. Try longer or trickier putts next time."] };
  } else if (off >= 3 && leanShare >= 0.7) {
    focus =
      over > under
        ? {
            title: "Focus next: reading less slope",
            lines: [
              `${over} of your ${off} bigger misses read more slope than was there.`,
              "Feel the slope through your feet before you look, and go with the smaller number when you're unsure.",
            ],
          }
        : {
            title: "Focus next: seeing all the slope",
            lines: [
              `${under} of your ${off} bigger misses read less slope than was there.`,
              "Stand still a little longer and feel which foot takes more weight. When you're unsure, go one step higher.",
            ],
          };
    if (weakMark) focus.lines.push(`Your ${weakMark.mark}% read was the weakest at ${weakMark.avg.toFixed(1)} pts a read.`);
  } else if (weakMark && bestMark) {
    focus = {
      title: `Focus next: the ${weakMark.mark}% mark`,
      lines: [
        `You averaged ${weakMark.avg.toFixed(1)} pts a read there, against ${bestMark.avg.toFixed(1)} at the ${bestMark.mark}% mark.`,
        MARK_TIPS[weakMark.mark],
      ],
    };
  } else {
    focus = {
      title: "Focus next: tighter reads",
      lines: [
        `${close} of your ${n} reads were within 0.2% of the real slope.`,
        "Get the slope right to the nearest 0.5% first, then fine-tune it.",
      ],
    };
  }
  if (weakBand) focus.lines.push(`Toughest length: ${weakBand.label}, at ${weakBand.avg.toFixed(1)} pts a putt.`);

  return {
    reads: n,
    avgAbsErr,
    close,
    over,
    under,
    wayOut,
    byMark,
    weakMark: weakMark?.mark ?? null,
    bands,
    weakBand: weakBand?.label ?? null,
    puttPoints,
    track,
    focus,
  };
}

/** Bird's-eye putt with the read marks laid out from ball to hole. */
function MarksDiagram({ marks, className = "" }: { marks: AimpointMark[]; className?: string }) {
  return (
    <svg viewBox="0 0 100 120" className={className} aria-hidden>
      <rect x="2" y="2" width="96" height="116" rx="22" fill="#1f7a3f" />
      <line x1="50" y1="104" x2="50" y2="22" stroke="white" strokeOpacity={0.6} strokeWidth={2} strokeDasharray="1 5" strokeLinecap="round" />
      {marks.map((m) => {
        const y = 104 - (82 * Number(m)) / 100;
        return (
          <g key={m}>
            <circle cx="50" cy={y} r="5" fill="#FFA500" />
            <text x="60" y={y + 3.5} fontSize="11" fontWeight="700" fill="white">
              {m}%
            </text>
          </g>
        );
      })}
      <line x1="50" y1="22" x2="50" y2="6" stroke="white" strokeWidth={1.5} />
      <path d="M50 6 L62 9 L50 12 Z" fill="#FFA500" />
      <circle cx="50" cy="22" r="6.5" fill="#0b2e18" stroke="white" strokeOpacity={0.5} strokeWidth={1} />
      <circle cx="50" cy="104" r="5" fill="white" />
    </svg>
  );
}

function PercentInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  const invalid = value.trim() !== "" && parsePercentOneDecimal(value) === null;
  return (
    <label className="relative block min-w-0 flex-1">
      <span className="sr-only">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        placeholder="0.0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-xl border-2 py-2.5 pl-3 pr-8 text-lg font-extrabold tabular-nums focus:outline-none ${
          invalid ? "border-red-300 focus:border-red-400" : "border-gray-200 focus:border-[#014421]"
        }`}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">%</span>
    </label>
  );
}

export function AimpointCombineRunner<R>({ format }: { format: AimpointFormat<R> }) {
  const user = useCombineUser();
  const userId = user?.id;
  const { marks, puttCount: total } = format;
  const maxPerPutt = marks.length * 10;

  const [status, setStatus] = useState<"intro" | "active" | "complete">("intro");
  const [phase, setPhase] = useState<"read" | "measure">("read");
  const [distances, setDistances] = useState<number[]>([]);
  const [puttIndex, setPuttIndex] = useState(0);
  const [reads, setReads] = useState<Inputs>(EMPTY);
  const [actuals, setActuals] = useState<Inputs>(EMPTY);
  const [log, setLog] = useState<R[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const persistAttemptedRef = useRef(false);

  const puttDisplay = puttIndex + 1;
  const targetFt = distances[puttIndex] ?? 0;

  const parsed = (inputs: Inputs) => marks.map((m) => parsePercentOneDecimal(inputs[m]));
  const readsValid = parsed(reads).every((n) => n !== null);
  const actualsValid = parsed(actuals).every((n) => n !== null);

  const startTest = useCallback(() => {
    setDistances(format.buildDistances());
    setStatus("active");
    setPhase("read");
    setPuttIndex(0);
    setReads(EMPTY);
    setActuals(EMPTY);
    setLog([]);
    setSaveError(null);
    setSaved(false);
    persistAttemptedRef.current = false;
  }, [format]);

  const save = useCallback(
    async (rows: R[]) => {
      if (!userId) {
        setSaveError("Sign in to save this session to practice.");
        setSaved(false);
        return;
      }
      persistAttemptedRef.current = true;
      setSaveError(null);
      const err = await format.persist(userId, rows);
      setSaved(err == null);
      if (err) {
        setSaveError(err);
        persistAttemptedRef.current = false;
      }
    },
    [format, userId],
  );

  const recordPutt = useCallback(async () => {
    if (status !== "active" || !readsValid || !actualsValid || targetFt <= 0) return;
    const readings = {} as Record<AimpointMark, MarkReading>;
    for (const m of marks) {
      readings[m] = { guess: parsePercentOneDecimal(reads[m])!, actual: parsePercentOneDecimal(actuals[m])! };
    }
    const nextLog = [...log, format.toRow(puttDisplay, targetFt, readings)];
    setReads(EMPTY);
    setActuals(EMPTY);
    setPhase("read");
    setLog(nextLog);

    if (puttDisplay >= total) {
      setStatus("complete");
      if (!persistAttemptedRef.current) await save(nextLog);
    } else {
      setPuttIndex((i) => i + 1);
    }
  }, [status, readsValid, actualsValid, targetFt, marks, reads, actuals, log, format, puttDisplay, total, save]);

  const undoLastPutt = useCallback(() => {
    if (status !== "active" || log.length === 0) return;
    const last = format.fromRow(log[log.length - 1]!);
    setLog((s) => s.slice(0, -1));
    setPuttIndex((i) => Math.max(0, i - 1));
    const r = { ...EMPTY };
    const a = { ...EMPTY };
    for (const m of marks) {
      r[m] = last[m] ? String(last[m]!.guess) : "";
      a[m] = last[m] ? String(last[m]!.actual) : "";
    }
    setReads(r);
    setActuals(a);
    setPhase("measure");
  }, [status, log, format, marks]);

  const summary = useMemo(() => {
    if (log.length < total) return null;
    const rows = log.map(format.fromRow);
    return { ...format.summarize(log), ...aimpointBreakdown(rows, marks, distances, maxPerPutt), rows };
  }, [log, total, format, marks, distances, maxPerPutt]);

  if (status === "intro") {
    const markList = marks.map((m) => `${m}%`).join(", ").replace(/, ([^,]*)$/, " and $1");
    return (
      <div className="space-y-4">
        <CombineHero title={format.title} chips={format.chips} />
        <IntroSteps
          steps={[
            { icon: <Footprints className="h-5 w-5" aria-hidden />, title: "Find the marks", hint: `${markList} of the way from the ball to the hole` },
            { icon: <Eye className="h-5 w-5" aria-hidden />, title: "Read the slope at each mark", hint: "Enter your AimPoint read before you check it" },
            { icon: <Ruler className="h-5 w-5" aria-hidden />, title: "Measure the real slope", hint: "With your level or slope app" },
          ]}
        />
        <ScoringGuide title="How points work">
          <p className="mb-2">Each read scores by how close it was to the measured slope:</p>
          <ul className="space-y-1.5">
            {[
              ["Spot on", "10"],
              ["Within 0.2%", "8"],
              ["Within 0.5%", "5"],
              ["Within 1%", "1"],
              ["More than 1% out", "0"],
            ].map(([label, pts]) => (
              <li key={label} className="flex items-center justify-between">
                <span>{label}</span>
                <span className="rounded-full bg-green-100 px-2.5 py-0.5 font-bold text-[#014421]">{pts}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-gray-400">
            {marks.length} reads a putt, {total * maxPerPutt} points max.
          </p>
        </ScoringGuide>
        <PrimaryButton onClick={startTest}>Start the test</PrimaryButton>
      </div>
    );
  }

  if (status === "complete" && summary) {
    const pct = summary.maxPoints > 0 ? summary.totalPoints / summary.maxPoints : 0;
    const readerText =
      summary.reader === "Over-Reader"
        ? "You read more slope than there is"
        : summary.reader === "Under-Reader"
          ? "You read less slope than there is"
          : "No strong lean either way";
    return (
      <div className="space-y-4">
        <ResultHero>
          <ScoreRing pct={pct} value={`${Math.round(pct * 100)}%`} caption={`${summary.totalPoints} of ${summary.maxPoints} pts`} />
          <span className="mt-3 inline-flex rounded-full bg-white px-4 py-1.5 text-sm font-bold text-[#014421]">
            {summary.reader === "Neutral" ? "Balanced reader" : summary.reader.replace("-R", "-r")}
          </span>
          <p className="mt-2 text-sm text-white/80">
            {readerText} (avg {signedPct(summary.bias)})
          </p>
        </ResultHero>

        <StatTiles
          stats={[
            { label: "Avg read error", value: `${summary.avgAbsErr.toFixed(2)}%` },
            { label: "Within 0.2%", value: `${summary.close}/${summary.reads}` },
            { label: "Over 1% out", value: summary.wayOut },
          ]}
        />

        <FocusCard title={summary.focus.title} lines={summary.focus.lines} />

        <BreakdownCard title="Putt by putt" aside={`Points out of ${maxPerPutt}`}>
          <ProgressTrack items={summary.track} current={-1} />
        </BreakdownCard>

        <BreakdownCard title="By mark" aside="Avg points a read">
          <div className="space-y-3">
            {summary.byMark.map((b) => (
              <ValueRow
                key={b.mark}
                label={`${b.mark}% mark`}
                value={b.avg}
                max={10}
                display={
                  <>
                    {b.avg.toFixed(1)}
                    <span className="ml-1.5 text-xs font-semibold text-gray-400">±{b.avgAbsErr.toFixed(2)}%</span>
                  </>
                }
                flag={b.mark === summary.weakMark ? "Work on" : null}
              />
            ))}
          </div>
        </BreakdownCard>

        <BreakdownCard title="Read bias" aside={`Avg ${signedPct(summary.bias)}`}>
          <BreakdownBar
            segments={[
              { label: "Too little slope", value: summary.under, tone: "bg-amber-500" },
              { label: "Within 0.2%", value: summary.close, tone: "bg-[#014421]" },
              { label: "Too much slope", value: summary.over, tone: "bg-sky-400" },
            ]}
          />
        </BreakdownCard>

        {summary.bands.length > 1 && (
          <BreakdownCard title="By distance" aside="Avg points a putt">
            <div className="space-y-3">
              {summary.bands.map((b) => (
                <ValueRow
                  key={b.label}
                  label={b.label}
                  value={b.avg}
                  max={maxPerPutt}
                  display={b.avg.toFixed(1)}
                  flag={b.label === summary.weakBand ? "Work on" : null}
                />
              ))}
            </div>
          </BreakdownCard>
        )}

        <EveryShotList title="Every putt">
          {summary.rows.map((r, i) => {
            const pts = summary.puttPoints[i]!;
            return (
              <li key={i} className="flex items-center gap-3 py-2">
                <span className="w-9 shrink-0 rounded-lg bg-gray-100 py-1 text-center text-xs font-bold text-gray-800">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-gray-800">{distances[i]} ft</span>
                  <span className="block text-xs text-gray-500">
                    {marks
                      .filter((m) => r[m])
                      .map((m) => `${m}%: read ${r[m]!.guess}, was ${r[m]!.actual}`)
                      .join(" · ")}
                  </span>
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${pointsTone(pts / maxPerPutt)}`}>
                  {pts}
                </span>
              </li>
            );
          })}
        </EveryShotList>

        <SaveStatus saved={saved} error={saveError} onRetry={userId ? () => void save(log) : undefined} />
        <PlayAgainButton onClick={startTest} />
      </div>
    );
  }

  const rows = log.map(format.fromRow);
  const track: TrackItem[] = Array.from({ length: total }, (_, i) => {
    const r = rows[i];
    if (!r) return null;
    const pts = rowPoints(r, marks);
    return { label: String(pts), tone: pointsTone(pts / maxPerPutt), ariaLabel: `Putt ${i + 1}: ${pts} points` };
  });
  const sessionPoints = rows.reduce((s, r) => s + rowPoints(r, marks), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-[#014421] px-3 py-1 text-xs font-bold tabular-nums text-white">{sessionPoints} pts</span>
        <span className="text-xs font-semibold text-gray-500">{total * maxPerPutt} max</span>
      </div>

      <ProgressTrack items={track} current={puttIndex} />

      <div className="flex items-stretch gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <MarksDiagram marks={marks} className="h-28 w-[5.5rem] shrink-0" />
        <div className="flex min-w-0 flex-col justify-center">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Putt {puttDisplay} of {total}
          </p>
          <p className="text-5xl font-extrabold tabular-nums leading-none text-gray-900">
            {targetFt}
            <span className="ml-1 text-xl font-bold text-gray-400">ft</span>
          </p>
          <p className="mt-1.5 text-sm font-semibold text-[#014421]">
            {marks.length} reads: {marks.map((m) => `${m}%`).join(" · ")}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        {phase === "measure" ? (
          <CombineFlowBackControl onBack={() => setPhase("read")} label="Back to your reads" />
        ) : log.length > 0 ? (
          <CombineFlowBackControl onBack={undoLastPutt} label="Undo last putt" />
        ) : (
          <span />
        )}
        <StepDots step={phase === "read" ? 1 : 2} total={2} />
      </div>

      {phase === "read" ? (
        <div key="read" className="space-y-3">
          <div>
            <p className="text-base font-bold text-gray-900">What do you read?</p>
            <p className="text-xs text-gray-500">Slope in %, one decimal (e.g. 1.5)</p>
          </div>
          {marks.map((m) => (
            <div key={m} className="flex items-center gap-3">
              <span className="w-24 shrink-0">
                <span className="block text-sm font-extrabold text-gray-900">{m}% mark</span>
                <span className="block text-[11px] text-gray-400">{m === "33" ? "Near the ball" : m === "66" ? "Near the hole" : "Halfway"}</span>
              </span>
              <PercentInput label={`Your read at ${m}%`} value={reads[m]} onChange={(v) => setReads((s) => ({ ...s, [m]: v }))} />
            </div>
          ))}
          <PrimaryButton onClick={() => setPhase("measure")} disabled={!readsValid}>
            Now measure it
          </PrimaryButton>
        </div>
      ) : (
        <div key="measure" className="space-y-3">
          <div>
            <p className="text-base font-bold text-gray-900">What did it measure?</p>
            <p className="text-xs text-gray-500">Enter the real slope at each mark</p>
          </div>
          {marks.map((m) => {
            const g = parsePercentOneDecimal(reads[m]);
            const a = parsePercentOneDecimal(actuals[m]);
            const pts = g != null && a != null ? pointsForAbsoluteError(Math.abs(g - a)) : null;
            return (
              <div key={m} className="flex items-center gap-3">
                <span className="w-24 shrink-0">
                  <span className="block text-sm font-extrabold text-gray-900">{m}% mark</span>
                  <span className="block text-[11px] text-gray-400">You read {reads[m]}%</span>
                </span>
                <PercentInput label={`Measured slope at ${m}%`} value={actuals[m]} onChange={(v) => setActuals((s) => ({ ...s, [m]: v }))} />
                <span
                  className={`w-12 shrink-0 rounded-full py-1 text-center text-xs font-bold tabular-nums ${
                    pts == null ? "bg-gray-100 text-gray-300" : pointsTone(pts / 10)
                  }`}
                >
                  {pts == null ? "–" : `+${pts}`}
                </span>
              </div>
            );
          })}
          <PrimaryButton onClick={() => void recordPutt()} disabled={!actualsValid}>
            {puttDisplay >= total ? "Finish the test" : "Next putt"}
          </PrimaryButton>
        </div>
      )}
    </div>
  );
}
