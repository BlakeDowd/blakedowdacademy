"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, RotateCcw } from "lucide-react";
import { BreakdownBar, BreakdownCard, EveryShotList, ValueRow } from "@/components/combine/CombineBreakdown";
import {
  BENCHMARK_TIERS,
  CHIP_LIES,
  DRIVES_5S_BASELINE,
  DRIVES_5S_HOLES,
  DRIVES_5S_HOLE_BASELINE,
  DRIVES_5S_MAX_STROKES,
  SHORT_STATIONS,
  TEE_OPTIONS,
  drives5sSummary,
  emptyHole,
  holeComplete,
  holePoints,
  toLogs,
  type ChipDifficulty,
  type Drives5sDetails,
  type Drives5sHole,
  type ShortStation,
  type TeeResult,
} from "@/lib/drives5sDrill";

type Card = Drives5sHole[];

function emptyCard(): Card {
  return Array.from({ length: DRIVES_5S_HOLES }, emptyHole);
}

function loadCard(storageKey: string): Card {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    if (Array.isArray(raw) && raw.length === DRIVES_5S_HOLES) return raw.map((h) => ({ ...emptyHole(), ...h }));
  } catch {
    /* storage unavailable */
  }
  return emptyCard();
}

function storeCard(storageKey: string, card: Card | null) {
  try {
    if (card) localStorage.setItem(storageKey, JSON.stringify(card));
    else localStorage.removeItem(storageKey);
  } catch {
    /* storage unavailable */
  }
}

const DIFFICULTY_TONES: Record<ChipDifficulty, string> = {
  easy: "bg-green-100 text-green-800",
  medium: "bg-amber-100 text-amber-800",
  hard: "bg-red-100 text-red-700",
};

const DIFFICULTY_LABELS: Record<ChipDifficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

function holeTone(h: Drives5sHole): string {
  if (!holeComplete(h)) return "bg-white text-gray-400 ring-gray-200";
  const pts = holePoints(h);
  if (pts < DRIVES_5S_HOLE_BASELINE) return "bg-green-600 text-white ring-green-600";
  if (pts === DRIVES_5S_HOLE_BASELINE) return "bg-[#014421] text-white ring-[#014421]";
  if (pts <= DRIVES_5S_HOLE_BASELINE + 2) return "bg-amber-100 text-amber-900 ring-amber-300";
  return "bg-red-100 text-red-800 ring-red-300";
}

const vsText = (n: number) => (n === 0 ? "level with" : n > 0 ? `+${n} vs` : `${n} vs`);

function Row({ label, sub, aside, children }: { label: string; sub?: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <p className="text-xs font-bold text-gray-900">
          {label}
          {sub && <span className="ml-1.5 font-semibold text-gray-400">{sub}</span>}
        </p>
        {aside}
      </div>
      {children}
    </div>
  );
}

function TeePicker({ value, onPick }: { value: TeeResult | null; onPick: (v: TeeResult) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {TEE_OPTIONS.map((o) => {
        const on = value === o.value;
        const tone =
          o.value === 0 ? "bg-[#014421] ring-[#014421]" : o.value === 1 ? "bg-amber-500 ring-amber-500" : "bg-red-600 ring-red-600";
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onPick(o.value)}
            aria-pressed={on}
            className={`rounded-lg py-1.5 text-center ring-1 transition-colors ${on ? `${tone} text-white` : "bg-white text-gray-800 ring-gray-200 hover:bg-gray-50"}`}
          >
            <span className="block text-xs font-bold">{o.value === 2 ? "Hazard / OB" : o.label}</span>
            <span className={`block text-[10px] font-semibold ${on ? "text-white/80" : "text-gray-400"}`}>
              {o.value === 0 ? "0 pts" : o.value === 1 ? "1 pt" : "2 pts"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function StrokePicker({ value, holed, onPick }: { value: number | null; holed: string; onPick: (v: number) => void }) {
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {Array.from({ length: DRIVES_5S_MAX_STROKES }, (_, i) => i + 1).map((n) => {
        const on = value === n;
        const isHoled = n === 1;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onPick(n)}
            aria-pressed={on}
            className={`rounded-lg py-1.5 text-center ring-1 transition-colors ${
              on
                ? isHoled
                  ? "bg-[#FFA500] text-white ring-[#FFA500]"
                  : "bg-[#014421] text-white ring-[#014421]"
                : isHoled
                  ? "bg-orange-50 text-orange-800 ring-[#FFA500]/60 hover:bg-orange-100"
                  : "bg-white text-gray-800 ring-gray-200 hover:bg-gray-50"
            }`}
          >
            <span className="block text-base font-extrabold tabular-nums">{n === DRIVES_5S_MAX_STROKES ? `${n}+` : n}</span>
            <span className={`block text-[9px] font-semibold leading-tight ${on ? "text-white/80" : "text-gray-400"}`}>
              {isHoled ? holed : n === 2 ? "Up & down" : n === DRIVES_5S_MAX_STROKES ? "or more" : `${n} shots`}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const TEE_SHORT: Record<TeeResult, string> = { 0: "F", 1: "R", 2: "H" };

/** Hole-by-hole logger for Drives & 5s. The card survives closing the drill until it's saved. */
export default function Drives5sScorecard({
  storageKey,
  saving,
  onSave,
}: {
  storageKey: string;
  saving: boolean;
  onSave: (score: number, reps: number, details: Drives5sDetails) => Promise<boolean>;
}) {
  const [card, setCard] = useState<Card>(() => loadCard(storageKey));
  const [current, setCurrent] = useState(() => {
    const next = card.findIndex((h) => !holeComplete(h));
    return next < 0 ? DRIVES_5S_HOLES - 1 : next;
  });
  const [view, setView] = useState<"card" | "results">(() => (card.every(holeComplete) ? "results" : "card"));
  const [saved, setSaved] = useState(false);

  const update = (next: Card) => {
    setCard(next);
    storeCard(storageKey, next);
  };

  const setField = <K extends keyof Drives5sHole>(key: K, value: Drives5sHole[K]) => {
    update(card.map((h, i) => (i === current ? { ...h, [key]: value } : h)));
  };

  const restart = () => {
    update(emptyCard());
    storeCard(storageKey, null);
    setCurrent(0);
    setView("card");
    setSaved(false);
  };

  const hole = card[current]!;
  const lie = CHIP_LIES[current]!;
  const completeCount = card.filter(holeComplete).length;
  const runningTotal = card.reduce((s, h) => s + (holeComplete(h) ? holePoints(h) : 0), 0);
  const done = completeCount === DRIVES_5S_HOLES;

  const shell = (body: React.ReactNode) => (
    <div className="space-y-3 rounded-xl bg-white p-3 ring-1 ring-gray-200" onClick={(e) => e.stopPropagation()}>
      {body}
    </div>
  );

  const holeStrip = (
    <div className="grid grid-cols-7 gap-1">
      {card.map((h, i) => (
        <button
          key={i}
          type="button"
          onClick={() => {
            if (saved) return;
            setCurrent(i);
            setView("card");
          }}
          aria-label={`Hole ${i + 1}`}
          className={`rounded-lg py-1 text-center ring-1 ${holeTone(h)} ${view === "card" && i === current ? "outline outline-2 outline-offset-1 outline-[#FFA500]" : ""}`}
        >
          <span className="block text-[9px] font-semibold opacity-70">H{i + 1}</span>
          <span className="block text-sm font-extrabold tabular-nums">{holeComplete(h) ? holePoints(h) : "·"}</span>
        </button>
      ))}
    </div>
  );

  if (view === "results" && done) {
    const logs = toLogs(card);
    const s = drives5sSummary(logs);
    return shell(
      <>
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Drives &amp; 5s · 7 holes</p>
          <p className="text-3xl font-extrabold tabular-nums text-[#014421]">
            {s.total}
            <span className="text-base font-bold text-gray-400"> pts</span>
          </p>
          <span className="mt-1 inline-flex rounded-full bg-[#014421]/10 px-3 py-1 text-xs font-bold text-[#014421]">
            {s.tier.label} level · {vsText(s.vsBaseline)} {DRIVES_5S_BASELINE} baseline
          </span>
        </div>

        {holeStrip}

        <div className="grid grid-cols-3 gap-1.5 text-center">
          {[
            { label: "Fairways", value: `${s.driving.fairways}/${s.driving.shots}` },
            { label: "Scrambles", value: `${s.scrambles}/${s.scrambleChances}` },
            { label: "Holed", value: String(s.short.reduce((n, x) => n + x.holed, 0)) },
          ].map((x) => (
            <div key={x.label} className="rounded-lg bg-gray-50 py-1.5 ring-1 ring-gray-200">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{x.label}</p>
              <p className="text-sm font-bold tabular-nums text-gray-900">{x.value}</p>
            </div>
          ))}
        </div>

        <BreakdownCard title="Benchmark" aside="Lower is better">
          <div className="space-y-1">
            {BENCHMARK_TIERS.map((t) => {
              const on = t.label === s.tier.label;
              return (
                <div
                  key={t.label}
                  className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm ${on ? "bg-[#014421] font-bold text-white" : "text-gray-700"}`}
                >
                  <span>{t.label}</span>
                  <span className="tabular-nums">{on ? `${s.total} · ${t.range}` : t.range}</span>
                </div>
              );
            })}
          </div>
        </BreakdownCard>

        <BreakdownCard title="Driving" aside={`${s.drivingPct}% fairways`}>
          <BreakdownBar
            segments={[
              { label: "Fairway", value: s.driving.fairways, tone: "bg-[#014421]" },
              { label: "Rough", value: s.driving.rough, tone: "bg-amber-500" },
              { label: "Hazard / OB", value: s.driving.hazard, tone: "bg-red-500" },
            ]}
          />
        </BreakdownCard>

        <BreakdownCard title="Short game" aside={`${s.scramblePct}% in 2 or less`}>
          <div className="space-y-3">
            {s.short.map((x) => (
              <ValueRow
                key={x.key}
                label={`${x.label} · ${x.range}`}
                value={x.avg - 1}
                max={3}
                lowerIsBetter
                display={
                  <>
                    {x.avg.toFixed(1)} avg
                    {x.holed > 0 && (
                      <span className="ml-1.5 rounded-full bg-[#FFA500] px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {x.holed} {x.key === "chip" ? `chip-in${x.holed === 1 ? "" : "s"}` : "holed"}
                      </span>
                    )}
                  </>
                }
              />
            ))}
          </div>
        </BreakdownCard>

        <BreakdownCard title="Chips by lie" aside="Avg strokes">
          <div className="space-y-3">
            {s.chipByDifficulty
              .filter((c) => c.count > 0)
              .map((c) => (
                <ValueRow
                  key={c.difficulty}
                  label={`${DIFFICULTY_LABELS[c.difficulty]} · ${c.count} hole${c.count === 1 ? "" : "s"}`}
                  value={c.avg - 1}
                  max={3}
                  lowerIsBetter
                  display={c.avg.toFixed(1)}
                />
              ))}
          </div>
        </BreakdownCard>

        <EveryShotList title="Every hole">
          {logs.map((h, i) => (
            <li key={i} className="flex items-center gap-3 py-2 text-xs">
              <span className="w-8 shrink-0 rounded-lg bg-gray-100 py-1 text-center font-bold text-gray-800">H{i + 1}</span>
              <span className="min-w-0 flex-1 tabular-nums text-gray-700">
                Tee {TEE_SHORT[h.drive1]} {TEE_SHORT[h.drive2]} · Wedge {h.approach} · Pitch {h.pitch} · Chip {h.chip}{" "}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${DIFFICULTY_TONES[h.chipDifficulty]}`}>
                  {DIFFICULTY_LABELS[h.chipDifficulty]}
                </span>
              </span>
              <span className="shrink-0 text-sm font-extrabold tabular-nums text-gray-900">
                {h.drive1 + h.drive2 + h.approach + h.pitch + h.chip}
              </span>
            </li>
          ))}
        </EveryShotList>

        <div className="flex gap-2">
          {saved ? (
            <button
              type="button"
              onClick={restart}
              className="inline-flex items-center gap-1 rounded-lg px-3 py-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-200"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              New round
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setView("card")}
                disabled={saving}
                className="inline-flex items-center gap-1 rounded-lg px-3 py-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-200 disabled:opacity-40"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
                Edit holes
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  const details: Drives5sDetails = {
                    kind: "drives_5s",
                    holes: logs,
                    total: s.total,
                    fairways: s.driving.fairways,
                    fairwayPct: s.drivingPct,
                    scrambles: s.scrambles,
                    scramblePct: s.scramblePct,
                  };
                  if (await onSave(s.total, DRIVES_5S_HOLES, details)) {
                    setSaved(true);
                    storeCard(storageKey, null);
                  }
                }}
                className="flex-1 rounded-lg bg-[#014421] py-2.5 text-sm font-bold text-white hover:bg-[#013320] disabled:opacity-40"
              >
                {saving ? "Saving…" : `Save ${s.total} pts`}
              </button>
            </>
          )}
        </div>
      </>,
    );
  }

  const stationValue = (key: ShortStation) => hole[key];
  const holeDone = holeComplete(hole);
  const isLast = current === DRIVES_5S_HOLES - 1;
  const nextIncomplete = card.findIndex((h, i) => i !== current && !holeComplete(h));

  return shell(
    <>
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold text-gray-900">Drives &amp; 5s</p>
        <p className="text-xs font-semibold tabular-nums text-gray-500">
          {completeCount ? `Thru ${completeCount} · ${runningTotal} pts` : `Par is ${DRIVES_5S_HOLE_BASELINE} a hole`}
        </p>
      </div>

      {holeStrip}

      <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 ring-1 ring-gray-200">
        <p className="text-sm font-extrabold text-gray-900">Hole {current + 1}</p>
        <p className="text-xs font-semibold text-gray-500">
          Hole score{" "}
          <span className="text-base font-extrabold tabular-nums text-gray-900">{holePoints(hole)}</span>
          <span className="text-gray-400"> / par {DRIVES_5S_HOLE_BASELINE}</span>
        </p>
      </div>

      <Row label="Tee shot 1">
        <TeePicker value={hole.drive1} onPick={(v) => setField("drive1", v)} />
      </Row>
      <Row label="Tee shot 2">
        <TeePicker value={hole.drive2} onPick={(v) => setField("drive2", v)} />
      </Row>
      {SHORT_STATIONS.map((st) => (
        <Row
          key={st.key}
          label={st.label}
          sub={st.key === "chip" ? undefined : st.range}
          aside={
            st.key === "chip" ? (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${DIFFICULTY_TONES[lie.difficulty]}`}>
                {DIFFICULTY_LABELS[lie.difficulty]}
              </span>
            ) : undefined
          }
        >
          {st.key === "chip" && <p className="-mt-0.5 mb-1 text-[11px] text-gray-500">{lie.lie}</p>}
          <StrokePicker value={stationValue(st.key)} holed={st.holed} onPick={(v) => setField(st.key, v)} />
        </Row>
      ))}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setCurrent(current - 1)}
          disabled={current === 0}
          className="inline-flex items-center gap-0.5 rounded-lg px-3 py-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-200 disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Hole {current}
        </button>
        {done ? (
          <button
            type="button"
            onClick={() => setView("results")}
            className="flex-1 rounded-lg bg-[#014421] py-2.5 text-sm font-bold text-white hover:bg-[#013320]"
          >
            See results · {runningTotal} pts
          </button>
        ) : (
          <button
            type="button"
            disabled={!holeDone}
            onClick={() => setCurrent(isLast ? Math.max(0, nextIncomplete) : current + 1)}
            className="inline-flex flex-1 items-center justify-center gap-0.5 rounded-lg bg-[#014421] py-2.5 text-sm font-bold text-white hover:bg-[#013320] disabled:opacity-40"
          >
            {isLast ? `Finish hole ${nextIncomplete + 1}` : `Hole ${current + 2}`}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
      {completeCount > 0 && (
        <button
          type="button"
          onClick={restart}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-gray-500 hover:bg-gray-100"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Clear card
        </button>
      )}
    </>,
  );
}
