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
  StepDots,
  type TrackItem,
} from "@/components/combine/PuttingCombineUi";

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
    const byMark = marks.map((m) => ({
      mark: m,
      avg: rows.reduce((s, r) => s + (r[m] ? pointsForAbsoluteError(Math.abs(r[m]!.guess - r[m]!.actual)) : 0), 0) / rows.length,
    }));
    return { ...format.summarize(log), byMark };
  }, [log, total, format, marks]);

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

        <div className="rounded-2xl border border-gray-100 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Average points by mark</p>
          <div className="space-y-2">
            {summary.byMark.map((b) => (
              <div key={b.mark} className="flex items-center gap-3">
                <span className="w-10 text-sm font-bold tabular-nums text-gray-700">{b.mark}%</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-[#014421]" style={{ width: `${(b.avg / 10) * 100}%` }} />
                </div>
                <span className="w-12 text-right text-sm font-bold tabular-nums text-gray-900">{b.avg.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>

        {summary.message && <p className="rounded-2xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900">{summary.message}</p>}

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
