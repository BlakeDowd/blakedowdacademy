"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { DoorOpen, Hammer, Spline } from "lucide-react";
import { useCombineUser } from "@/hooks/useCombineUser";
import { ironFaceControlConfig } from "@/lib/ironFaceControlConfig";
import { formatSupabaseWriteError } from "@/lib/formatSupabaseWriteError";
import { awardCombineCompletionXp } from "@/lib/combineXp";
import { asRecord } from "@/lib/combineReportData";
import { insertPracticeLogCompat } from "@/lib/practiceLogsCompat";
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
  type TrackItem,
} from "@/components/combine/PuttingCombineUi";
import { IronHeroArt, IronShotDiagram, ToggleCard } from "@/components/combine/IronCombineUi";
import { BreakdownBar, BreakdownCard, FocusCard, RateRow } from "@/components/combine/CombineBreakdown";

export type IronFaceShot = {
  gate: boolean;
  curve: boolean;
  solid: boolean;
};

const EMPTY_SHOT: IronFaceShot = { gate: false, curve: false, solid: false };

function shotPoints(s: IronFaceShot): number {
  return (
    (s.gate ? ironFaceControlConfig.ptsGate : 0) +
    (s.curve ? ironFaceControlConfig.ptsCurve : 0) +
    (s.solid ? ironFaceControlConfig.ptsSolid : 0)
  );
}

function sessionTotal(shots: IronFaceShot[]): number {
  return shots.reduce((acc, s) => acc + shotPoints(s), 0);
}

function pointsTone(points: number): string {
  if (points >= ironFaceControlConfig.maxShotPoints) return "bg-[#014421] text-white";
  if (points >= 6) return "bg-green-200 text-[#014421]";
  if (points > 0) return "bg-amber-200 text-amber-900";
  return "bg-red-500 text-white";
}

const SKILLS = [
  {
    key: "gate",
    label: "Through the gate",
    short: "gate",
    pts: ironFaceControlConfig.ptsGate,
    tone: "bg-[#FFA500]",
    tip: "Start line comes from the face. Pick a spot just past the gate and square the face to it.",
  },
  {
    key: "curve",
    label: "Curved as called",
    short: "curve",
    pts: ironFaceControlConfig.ptsCurve,
    tone: "bg-sky-400",
    tip: "Shape comes from path versus face. Keep the face on your start line and swing more out to in (fade) or in to out (draw).",
  },
  {
    key: "solid",
    label: "Solid strike",
    short: "strike",
    pts: ironFaceControlConfig.ptsSolid,
    tone: "bg-red-400",
    tip: "Shaping can cost strike. Slow down to 80% until the contact is back.",
  },
] as const;

function breakdown(shots: IronFaceShot[]) {
  const n = shots.length;
  const skills = SKILLS.map((s) => {
    const made = shots.filter((x) => x[s.key]).length;
    return { ...s, made, lost: (n - made) * s.pts };
  });
  const leakSkill = [...skills].sort((a, b) => b.lost - a.lost || a.made - b.made)[0]!;
  const leak = leakSkill.lost > 0 ? leakSkill.key : null;

  let bestStreak = 0;
  let run = 0;
  for (const s of shots) {
    run = shotPoints(s) >= 7 ? run + 1 : 0;
    bestStreak = Math.max(bestStreak, run);
  }

  const track: TrackItem[] = shots.map((s, i) => {
    const p = shotPoints(s);
    return { label: String(p), tone: pointsTone(p), ariaLabel: `Shot ${i + 1}: ${p} points` };
  });

  const focus = leak
    ? {
        title: `Focus next: ${leakSkill.label.toLowerCase()}`,
        lines: [`You made it on ${leakSkill.made} of ${n} shots, which cost you ${leakSkill.lost} pts.`, leakSkill.tip],
      }
    : { title: "Perfect round", lines: ["Every shot through the gate, shaped and solid. Narrow the gate next time."] };

  return {
    total: sessionTotal(shots),
    perfect: shots.filter((s) => shotPoints(s) === ironFaceControlConfig.maxShotPoints).length,
    bestStreak,
    skills,
    leak,
    track,
    focus,
  };
}

/** Saved shots from a practice_logs row, or null for sessions saved before shots were stored. */
export function parseIronFaceShots(strikeData: unknown): IronFaceShot[] | null {
  if (!Array.isArray(strikeData) || strikeData.length === 0) return null;
  const shots: IronFaceShot[] = [];
  for (const raw of strikeData) {
    const o = asRecord(raw);
    if (!o) return null;
    shots.push({ gate: o.gate === true, curve: o.curve === true, solid: o.solid === true });
  }
  return shots;
}

async function persistIronFaceSession(userId: string, shots: IronFaceShot[]): Promise<string | null> {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const total = sessionTotal(shots);
    const res = await insertPracticeLogCompat(supabase, {
      user_id: userId,
      log_type: ironFaceControlConfig.practiceLogType,
      score: total,
      total_points: total,
      strike_data: shots,
    });

    if (!res.ok) {
      console.warn("[IronFaceControl] practice_logs insert:", res.message);
      return res.message;
    }
    await awardCombineCompletionXp(userId);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("practiceSessionsUpdated"));
    }
    return null;
  } catch (e) {
    console.warn("[IronFaceControl] practice_logs insert failed", formatSupabaseWriteError(e));
    return formatSupabaseWriteError(e);
  }
}

/** The results screen. Coaches see the same report for a saved session. */
export function IronFaceControlReport({ shots }: { shots: IronFaceShot[] }) {
  const total = shots.length;
  const summary = breakdown(shots);
  return (
    <>
      <ResultHero>
        <ScoreRing
          pct={summary.total / ironFaceControlConfig.maxSessionPoints}
          value={summary.total}
          caption={`of ${ironFaceControlConfig.maxSessionPoints} points`}
        />
        <p className="mt-2 text-xs text-white/70">
          {summary.perfect} perfect shot{summary.perfect === 1 ? "" : "s"} · higher is better
        </p>
      </ResultHero>
      <StatTiles
        stats={[
          { label: "Avg per shot", value: (summary.total / total).toFixed(1) },
          { label: "Perfect shots", value: summary.perfect },
          { label: "Best streak", value: summary.bestStreak, sub: "7+ pt shots" },
        ]}
      />

      <FocusCard title={summary.focus.title} lines={summary.focus.lines} />

      <BreakdownCard title="Shot by shot">
        <ProgressTrack items={summary.track} current={-1} name="Shot" />
      </BreakdownCard>

      <BreakdownCard title="Skills" aside="Made / shots">
        <div className="space-y-3">
          {summary.skills.map((s) => (
            <RateRow key={s.key} label={s.label} made={s.made} total={total} flag={s.key === summary.leak ? "Biggest leak" : null} />
          ))}
        </div>
      </BreakdownCard>

      <BreakdownCard title="Where your points went" aside={`${summary.total} of ${ironFaceControlConfig.maxSessionPoints}`}>
        <BreakdownBar
          segments={[
            { label: "Scored", value: summary.total, tone: "bg-[#014421]" },
            ...summary.skills.map((s) => ({ label: `Lost: ${s.short}`, value: s.lost, tone: s.tone })),
          ]}
        />
      </BreakdownCard>
    </>
  );
}

export function IronFaceControlRunner() {
  const user = useCombineUser();
  const userId = user?.id ?? null;
  const total = ironFaceControlConfig.shotCount;
  const [status, setStatus] = useState<"intro" | "active" | "complete">("intro");
  const [shots, setShots] = useState<IronFaceShot[]>([]);
  const [current, setCurrent] = useState<IronFaceShot>(EMPTY_SHOT);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const persistAttemptedRef = useRef(false);

  const startTest = useCallback(() => {
    setStatus("active");
    setShots([]);
    setCurrent(EMPTY_SHOT);
    setSaveError(null);
    setSaved(false);
    persistAttemptedRef.current = false;
  }, []);

  const save = useCallback(
    async (all: IronFaceShot[]) => {
      if (!userId) {
        setSaveError("Sign in to save this session.");
        return;
      }
      persistAttemptedRef.current = true;
      setSaveError(null);
      const err = await persistIronFaceSession(userId, all);
      setSaved(err == null);
      if (err) {
        setSaveError(err);
        persistAttemptedRef.current = false;
      }
    },
    [userId],
  );

  const recordShot = useCallback(async () => {
    if (status !== "active") return;
    const next = [...shots, current];
    setShots(next);
    setCurrent(EMPTY_SHOT);
    if (next.length >= total) {
      setStatus("complete");
      if (!persistAttemptedRef.current) await save(next);
    }
  }, [status, shots, current, total, save]);

  const undoLastShot = useCallback(() => {
    if (status !== "active" || shots.length === 0) return;
    setCurrent(shots[shots.length - 1]!);
    setShots((s) => s.slice(0, -1));
  }, [status, shots]);

  const summary = useMemo(() => (status === "complete" ? breakdown(shots) : null), [status, shots]);

  if (status === "intro") {
    return (
      <div className="space-y-4">
        <CombineHero
          title={ironFaceControlConfig.testName}
          kicker="Iron combine"
          art={<IronHeroArt curve="draw" />}
          chips={[`${total} shots`, "Any iron", "~10 min", "Highest score wins"]}
        />
        <IntroSteps
          steps={[
            { icon: <DoorOpen className="h-5 w-5" aria-hidden />, title: "Set a gate 2 m in front", hint: "Two alignment sticks on your start line" },
            { icon: <Spline className="h-5 w-5" aria-hidden />, title: "Call the shape before each shot", hint: "Draw or fade, it's your choice" },
            { icon: <Hammer className="h-5 w-5" aria-hidden />, title: "Tap what you pulled off", hint: "Through the gate, curved as planned, struck solid" },
          ]}
        />
        <ScoringGuide title="How points work">
          <ul className="space-y-1.5">
            <li>Started through the gate: +{ironFaceControlConfig.ptsGate}</li>
            <li>Curved the way you called it: +{ironFaceControlConfig.ptsCurve}</li>
            <li>Solid strike: +{ironFaceControlConfig.ptsSolid}</li>
            <li className="font-semibold text-gray-900">
              Up to {ironFaceControlConfig.maxShotPoints} per shot, {ironFaceControlConfig.maxSessionPoints} in total. Higher is better.
            </li>
          </ul>
        </ScoringGuide>
        <PrimaryButton onClick={startTest}>Start the test</PrimaryButton>
      </div>
    );
  }

  if (status === "complete" && summary) {
    return (
      <div className="space-y-4">
        <IronFaceControlReport shots={shots} />

        <SaveStatus saved={saved} error={saveError} onRetry={userId ? () => void save(shots) : undefined} />
        <PlayAgainButton onClick={startTest} />
      </div>
    );
  }

  const shotNumber = shots.length + 1;
  const runningTotal = sessionTotal(shots);
  const track: TrackItem[] = Array.from({ length: total }, (_, i) => {
    const s = shots[i];
    if (!s) return null;
    const p = shotPoints(s);
    return { label: String(p), tone: pointsTone(p), ariaLabel: `Shot ${i + 1}: ${p} points` };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-[#014421] px-3 py-1 text-xs font-bold tabular-nums text-white">{runningTotal} pts</span>
        <span className="text-xs font-semibold text-gray-500">Higher is better</span>
      </div>

      <ProgressTrack items={track} current={shots.length} name="Shot" />

      <div className="flex items-stretch gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <IronShotDiagram curve={shotNumber % 2 === 0 ? "fade" : "draw"} className="h-28 w-[5.5rem] shrink-0" />
        <div className="flex min-w-0 flex-col justify-center">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Shot {shotNumber} of {total}
          </p>
          <p className="text-5xl font-extrabold tabular-nums leading-none text-gray-900">
            {shotPoints(current)}
            <span className="ml-1 text-xl font-bold text-gray-400">pts</span>
          </p>
          <p className="mt-1.5 text-sm font-semibold text-[#014421]">Call your shape, then hit</p>
        </div>
      </div>

      {shots.length > 0 && <CombineFlowBackControl onBack={undoLastShot} label="Undo last shot" />}

      <div className="space-y-2">
        <p className="text-base font-bold text-gray-900">What did you pull off?</p>
        <ToggleCard
          icon={<DoorOpen className="h-5 w-5" aria-hidden />}
          title="Through the gate"
          hint="Started on your line"
          points={ironFaceControlConfig.ptsGate}
          on={current.gate}
          onChange={(on) => setCurrent((c) => ({ ...c, gate: on }))}
        />
        <ToggleCard
          icon={<Spline className="h-5 w-5" aria-hidden />}
          title="Curved as called"
          hint="Drew or faded the way you planned"
          points={ironFaceControlConfig.ptsCurve}
          on={current.curve}
          onChange={(on) => setCurrent((c) => ({ ...c, curve: on }))}
        />
        <ToggleCard
          icon={<Hammer className="h-5 w-5" aria-hidden />}
          title="Solid strike"
          hint="Ball first, out of the middle"
          points={ironFaceControlConfig.ptsSolid}
          on={current.solid}
          onChange={(on) => setCurrent((c) => ({ ...c, solid: on }))}
        />
      </div>

      <PrimaryButton onClick={() => void recordShot()}>
        {shotNumber >= total ? "Finish the test" : "Next shot"}
        <span className="block text-xs font-semibold text-white/70">
          {shotPoints(current) === 0 ? "Nothing ticked scores 0" : `This shot scores ${shotPoints(current)}`}
        </span>
      </PrimaryButton>
    </div>
  );
}
