"use client";

import { useState } from "react";
import { MapPin, RotateCcw, Undo2 } from "lucide-react";
import { BreakdownBar, BreakdownCard, EveryShotList, FocusCard, ValueRow } from "@/components/combine/CombineBreakdown";
import { parsePercentOneDecimal } from "@/lib/slopeReadingParse";
import {
  AIMPOINT_READ_DRILLS,
  AIMPOINT_READ_MAX_SCORE,
  AIMPOINT_READ_PUTTS,
  READ_SPOTS,
  aimpointReadReport,
  aimpointReadScore,
  leanOf,
  readPoints,
  type AimpointReadDetails,
  type AimpointReadKey,
  type SpotRead,
} from "@/lib/aimpointReadDrill";

function pointsTone(pts: number): string {
  if (pts >= 8) return "bg-[#014421] text-white";
  if (pts >= 5) return "bg-green-200 text-[#014421]";
  if (pts >= 1) return "bg-amber-200 text-amber-900";
  return "bg-red-500 text-white";
}

const signedPct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;

function PercentInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const invalid = value.trim() !== "" && parsePercentOneDecimal(value) === null;
  return (
    <label className="relative block">
      <span className="mb-1 block text-xs font-semibold text-gray-700">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        placeholder="0.0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-xl border-2 py-2.5 pl-3 pr-8 text-xl font-extrabold tabular-nums focus:outline-none ${
          invalid ? "border-red-300 focus:border-red-400" : "border-gray-200 focus:border-[#014421]"
        }`}
      />
      <span className="pointer-events-none absolute bottom-3 right-3 text-sm font-bold text-gray-400">%</span>
    </label>
  );
}

/** 10 putts, each read at 2 or 3 spots along the line (guess, then measure). Ends with a report on what to practise. */
export default function AimpointReadDrill({
  drillKey,
  saving,
  onSave,
}: {
  drillKey: AimpointReadKey;
  saving: boolean;
  onSave: (score: number, reps: number, details: AimpointReadDetails) => Promise<boolean>;
}) {
  const info = AIMPOINT_READ_DRILLS[drillKey];
  const spots = info.spots;
  const totalReads = AIMPOINT_READ_PUTTS * spots.length;
  const [phase, setPhase] = useState<"intro" | "reading" | "done">("intro");
  const [reads, setReads] = useState<SpotRead[]>([]);
  const [read, setRead] = useState("");
  const [actual, setActual] = useState("");
  const [saved, setSaved] = useState(false);

  const puttIndex = Math.floor(reads.length / spots.length);
  const spot = spots[reads.length % spots.length]!;
  const lastSpot = reads.length % spots.length === spots.length - 1;
  const readNum = parsePercentOneDecimal(read);
  const actualNum = parsePercentOneDecimal(actual);
  const livePoints = readNum != null && actualNum != null ? readPoints({ read: readNum, actual: actualNum }) : null;
  const readsFor = (putt: number) => reads.filter((r) => r.putt === putt);

  const start = () => {
    setReads([]);
    setRead("");
    setActual("");
    setSaved(false);
    setPhase("reading");
  };

  const next = () => {
    if (readNum == null || actualNum == null) return;
    const all = [...reads, { putt: puttIndex, spot, read: readNum, actual: actualNum }];
    setReads(all);
    setRead("");
    setActual("");
    if (all.length >= totalReads) setPhase("done");
  };

  const undo = () => {
    const last = reads[reads.length - 1];
    if (!last) return;
    setReads(reads.slice(0, -1));
    setRead(String(last.read));
    setActual(String(last.actual));
    setPhase("reading");
  };

  const shell = (body: React.ReactNode) => (
    <div className="space-y-3 rounded-xl bg-white p-3 ring-1 ring-gray-200" onClick={(e) => e.stopPropagation()}>
      {body}
    </div>
  );

  const spotLabels = spots.map((s) => READ_SPOTS[s].label.toLowerCase());
  const spotList = `${spotLabels.slice(0, -1).join(", ")} and ${spotLabels[spotLabels.length - 1]}`;

  if (phase === "intro") {
    return shell(
      <>
        <p className="text-sm font-semibold text-gray-900">AimPoint reads · {info.title}</p>
        <ol className="list-decimal space-y-1 pl-4 text-xs leading-snug text-gray-600">
          <li>
            Pick a putt. You&apos;ll read it {spots.length} times: at the {spotList} of the way to the hole.
          </li>
          <li>At each spot, enter the slope you read before you check it.</li>
          <li>Then measure the real slope with your level or slope app and enter it.</li>
          <li>
            {AIMPOINT_READ_PUTTS} putts ({totalReads} reads), then you get a report on what to practise.
          </li>
        </ol>
        <p className="text-[11px] text-gray-500">
          Each read: 10 points for spot on, 8 within 0.2%, 5 within 0.5%, 1 within 1%. Scored out of{" "}
          {AIMPOINT_READ_MAX_SCORE}.
        </p>
        <button
          type="button"
          onClick={start}
          className="w-full rounded-lg bg-[#014421] py-2.5 text-sm font-bold text-white hover:bg-[#013320]"
        >
          Start {AIMPOINT_READ_PUTTS} putts
        </button>
      </>,
    );
  }

  if (phase === "reading") {
    return shell(
      <>
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Putt {puttIndex + 1} of {AIMPOINT_READ_PUTTS}
          </p>
          <p className="text-xs font-semibold tabular-nums text-gray-500">
            {reads.length ? `${aimpointReadScore(reads)}/${AIMPOINT_READ_MAX_SCORE}` : ""}
          </p>
        </div>
        <div className="flex gap-1">
          {Array.from({ length: AIMPOINT_READ_PUTTS }, (_, i) => {
            const done = readsFor(i);
            const tone =
              done.length === spots.length
                ? pointsTone(done.reduce((s, r) => s + readPoints(r), 0) / done.length)
                : i === puttIndex
                  ? "bg-[#FFA500]"
                  : "bg-gray-200";
            return <span key={i} className={`h-1.5 flex-1 rounded-full ${tone}`} />;
          })}
        </div>

        <div className="flex gap-1.5">
          {spots.map((s, i) => {
            const r = readsFor(puttIndex)[i];
            const current = s === spot && !r;
            return (
              <span
                key={s}
                className={`flex-1 rounded-lg px-2 py-1 text-center text-[11px] font-bold ${
                  r ? pointsTone(readPoints(r)) : current ? "bg-[#014421]/10 text-[#014421] ring-1 ring-[#014421]" : "bg-gray-100 text-gray-400"
                }`}
              >
                {READ_SPOTS[s].label}
                {r ? ` · +${readPoints(r)}` : ""}
              </span>
            );
          })}
        </div>

        <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
          <MapPin className="h-4 w-4 text-[#014421]" aria-hidden />
          {READ_SPOTS[spot].label} of the way
        </div>
        <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
          <PercentInput label="Your read" value={read} onChange={setRead} />
          <PercentInput label="Measured" value={actual} onChange={setActual} />
          <span
            className={`mb-1.5 w-12 rounded-full py-1.5 text-center text-sm font-bold tabular-nums ${
              livePoints == null ? "bg-gray-100 text-gray-300" : pointsTone(livePoints)
            }`}
          >
            {livePoints == null ? "–" : `+${livePoints}`}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={undo}
            disabled={!reads.length}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-200 disabled:opacity-30"
          >
            <Undo2 className="h-3.5 w-3.5" aria-hidden />
            Back
          </button>
          <button
            type="button"
            onClick={next}
            disabled={readNum == null || actualNum == null}
            className="flex-1 rounded-lg bg-[#014421] py-2.5 text-sm font-bold text-white hover:bg-[#013320] disabled:opacity-40"
          >
            {reads.length + 1 >= totalReads
              ? "See my report"
              : lastSpot
                ? "Next putt"
                : `Next: ${READ_SPOTS[spots[(reads.length + 1) % spots.length]!].label.toLowerCase()}`}
          </button>
        </div>
      </>,
    );
  }

  const report = aimpointReadReport(reads);
  return shell(
    <>
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">AimPoint reads · {info.title}</p>
        <p className="text-3xl font-extrabold tabular-nums text-[#014421]">
          {report.score}
          <span className="text-base font-bold text-gray-400">/{AIMPOINT_READ_MAX_SCORE}</span>
        </p>
        <span className="mt-1 inline-flex rounded-full bg-[#014421]/10 px-3 py-1 text-xs font-bold text-[#014421]">
          {report.reader} · avg {signedPct(report.bias)}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-1.5 text-center">
        {[
          { label: "Avg miss", value: `${report.avgAbsErr.toFixed(1)}%` },
          { label: "Within 0.2%", value: `${report.close}/${reads.length}` },
          { label: "Over 1% out", value: String(report.wayOut) },
        ].map((s) => (
          <div key={s.label} className="rounded-lg bg-gray-50 py-1.5 ring-1 ring-gray-200">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{s.label}</p>
            <p className="text-sm font-bold tabular-nums text-gray-900">{s.value}</p>
          </div>
        ))}
      </div>

      <FocusCard title={report.focus.title} lines={[...report.focus.lines, info.tip]} />

      <BreakdownCard title="Read bias">
        <BreakdownBar
          segments={[
            { label: "Too little slope", value: report.under, tone: "bg-amber-500" },
            { label: "Within 0.2%", value: report.close, tone: "bg-[#014421]" },
            { label: "Too much slope", value: report.over, tone: "bg-sky-400" },
          ]}
        />
      </BreakdownCard>

      <BreakdownCard title="By spot on the putt" aside="Avg miss">
        <div className="space-y-3">
          {report.spots.map((s) => (
            <ValueRow
              key={s.spot}
              label={`${s.label} · ${leanOf(s.bias) ? `reads ${leanOf(s.bias)}` : "no lean"}`}
              value={s.avgAbsErr}
              max={1.5}
              lowerIsBetter
              display={`${s.avgAbsErr.toFixed(1)}%`}
              flag={s.spot === report.weakSpot ? "Work on" : null}
            />
          ))}
        </div>
      </BreakdownCard>

      {report.bands.length > 1 && (
        <BreakdownCard title="By slope" aside="Avg miss">
          <div className="space-y-3">
            {report.bands.map((b) => (
              <ValueRow
                key={b.key}
                label={`${b.label} · ${b.n}`}
                value={b.avgAbsErr}
                max={1.5}
                lowerIsBetter
                display={`${b.avgAbsErr.toFixed(1)}%`}
                flag={b.key === report.weakBand ? "Work on" : null}
              />
            ))}
          </div>
        </BreakdownCard>
      )}

      <EveryShotList title="Every putt">
        {Array.from({ length: AIMPOINT_READ_PUTTS }, (_, i) => (
          <li key={i} className="flex items-start gap-3 py-2">
            <span className="w-8 shrink-0 rounded-lg bg-gray-100 py-1 text-center text-xs font-bold text-gray-800">{i + 1}</span>
            <div className="min-w-0 flex-1 space-y-1">
              {readsFor(i).map((r) => {
                const pts = readPoints(r);
                return (
                  <div key={r.spot} className="flex items-center gap-2 text-sm text-gray-800">
                    <span className="w-8 shrink-0 text-xs font-semibold text-gray-500">{READ_SPOTS[r.spot].short}</span>
                    <span className="min-w-0 flex-1">
                      Read {r.read}%, was {r.actual}%
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${pointsTone(pts)}`}>
                      {pts}
                    </span>
                  </div>
                );
              })}
            </div>
          </li>
        ))}
      </EveryShotList>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={start}
          disabled={saving}
          className="inline-flex items-center gap-1 rounded-lg px-3 py-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-200 disabled:opacity-40"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          {saved ? "Go again" : "Restart"}
        </button>
        {!saved && (
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              if (
                await onSave(report.score, AIMPOINT_READ_PUTTS, { kind: "aimpoint_reads", spots: [...spots], reads })
              )
                setSaved(true);
            }}
            className="flex-1 rounded-lg bg-[#014421] py-2.5 text-sm font-bold text-white hover:bg-[#013320] disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save score"}
          </button>
        )}
      </div>
    </>,
  );
}
