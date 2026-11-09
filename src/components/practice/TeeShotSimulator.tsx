"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hand, Play, Radar, RefreshCw, Target, Volume2, VolumeX } from "lucide-react";
import {
  CENTRE_BANDS,
  SHOTS_PER_SET,
  TEE_BALL,
  TEE_CLUBS,
  TEE_DISTANCE_LIMITS,
  cameraForTee,
  clampTeeAim,
  estimateTeeShotHandicap,
  generateTeeScenario,
  isFairwayHit,
  normalizeTeeDistanceRange,
  scoreTeeShot,
  suggestTeeClub,
  summarizeTeeSession,
  teeResultLabel,
  type TeeDistanceRange,
  type TeeMode,
  type TeeScenario,
  type TeeShotResult,
} from "@/lib/teeShotSim";
import { teeShotSimConfig } from "@/lib/teeShotSimConfig";
import { dist, landFromRadarApproach } from "@/lib/onCourseSimulator/physics";
import type { Vec2 } from "@/lib/onCourseSimulator/types";
import { playBallHit, playSand, playSplash, playSwing } from "@/lib/onCourseSimulator/sounds";
import { trackToolUse } from "@/lib/appUsage";
import { useAuth } from "@/contexts/AuthContext";
import { isCoachEmail } from "@/lib/coachEmails";
import { TestingForSelect } from "@/components/combine/TestingForSelect";
import type { PlayerOption } from "@/lib/coachingSpaces";
import { FingerMissInput, fingerMissReady } from "@/components/practice/FingerMissInput";
import {
  landFromFingerMiss,
  type FingerMissDirection,
  type FingerMissWidth,
} from "@/lib/fingerMissGeometry";
import { formatHandicap } from "@/lib/practiceHandicap";
import { insertPracticeLogCompat } from "@/lib/practiceLogsCompat";
import { awardCombineCompletionXp } from "@/lib/combineXp";
import { formatSupabaseWriteError } from "@/lib/formatSupabaseWriteError";
import { TeeShotSimReport } from "@/components/practice/TeeShotSimReport";

type FlightAnim = { from: Vec2; to: Vec2; progress: number; done: boolean };
type ScorePopup = { points: number; at: Vec2; born: number };
type Phase = "setup" | "playing" | "complete";

function worldToScreen(
  p: Vec2,
  cam: { cx: number; cy: number; scale: number },
  w: number,
  h: number,
): Vec2 {
  return {
    x: w / 2 + (p.x - cam.cx) * cam.scale,
    y: h / 2 - (p.y - cam.cy) * cam.scale,
  };
}

function screenToWorld(
  p: Vec2,
  cam: { cx: number; cy: number; scale: number },
  w: number,
  h: number,
): Vec2 {
  return {
    x: cam.cx + (p.x - w / 2) / cam.scale,
    y: cam.cy - (p.y - h / 2) / cam.scale,
  };
}

function pathPoly(
  ctx: CanvasRenderingContext2D,
  pts: Vec2[],
  cam: { cx: number; cy: number; scale: number },
  w: number,
  h: number,
) {
  if (pts.length < 3) return;
  const s0 = worldToScreen(pts[0]!, cam, w, h);
  ctx.beginPath();
  ctx.moveTo(s0.x, s0.y);
  for (let i = 1; i < pts.length; i++) {
    const s = worldToScreen(pts[i]!, cam, w, h);
    ctx.lineTo(s.x, s.y);
  }
  ctx.closePath();
}

const RESULT_KEY = "tee_shot_sim_last_v1";
const RANGE_KEY = "tee_shot_sim_range_v1";

type SavedResult = {
  at: string;
  playerId: string | null;
  playerName: string | null;
  mode: TeeMode;
  stats: ReturnType<typeof summarizeTeeSession>;
  handicapEstimate: number;
};

function loadSavedRange(): TeeDistanceRange {
  try {
    const raw = JSON.parse(localStorage.getItem(RANGE_KEY) || "null") as {
      minM?: number;
      maxM?: number;
    } | null;
    if (raw && typeof raw.minM === "number" && typeof raw.maxM === "number") {
      return normalizeTeeDistanceRange(raw.minM, raw.maxM);
    }
  } catch {
    /* ignore */
  }
  return normalizeTeeDistanceRange(140, 185);
}

function saveRange(range: TeeDistanceRange) {
  try {
    localStorage.setItem(RANGE_KEY, JSON.stringify(range));
  } catch {
    /* ignore */
  }
}

async function persistTeeSet(
  userId: string,
  mode: TeeMode,
  shots: TeeShotResult[],
  stats: ReturnType<typeof summarizeTeeSession>,
): Promise<void> {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const res = await insertPracticeLogCompat(supabase, {
      user_id: userId,
      log_type: teeShotSimConfig.practiceLogType,
      score: stats.score,
      total_points: stats.score,
      strike_data: shots.map((s) => ({
        points: s.points,
        lie: s.lie,
        distanceM: s.distanceM,
        offlineM: s.offlineM,
        side: s.side,
        danger: s.danger,
        club: s.club ?? null,
      })),
      metadata: {
        mode,
        firPct: stats.firPct,
        handicapEstimate: estimateTeeShotHandicap(stats.score),
      },
    });
    if (!res.ok) {
      console.warn("[TeeShotSim] practice_logs insert:", res.message);
      return;
    }
    await awardCombineCompletionXp(userId);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("practiceSessionsUpdated"));
    }
  } catch (e) {
    console.warn("[TeeShotSim] practice_logs insert failed", formatSupabaseWriteError(e));
  }
}

function saveLastResult(entry: SavedResult) {
  try {
    localStorage.setItem(RESULT_KEY, JSON.stringify(entry));
  } catch {
    /* ignore */
  }
}

function loadLastResult(): SavedResult | null {
  try {
    const raw = JSON.parse(localStorage.getItem(RESULT_KEY) || "null");
    return raw && typeof raw.at === "string" ? (raw as SavedResult) : null;
  } catch {
    return null;
  }
}

export default function TeeShotSimulator({ compact }: { compact?: boolean }) {
  const { user } = useAuth();
  const isCoach = isCoachEmail(user?.email) || user?.role === "coach";

  const [phase, setPhase] = useState<Phase>("setup");
  const [testingFor, setTestingFor] = useState<PlayerOption | null>(null);
  const [scenario, setScenario] = useState<TeeScenario | null>(null);
  const [mode, setMode] = useState<TeeMode>("launch_monitor");
  const [unit, setUnit] = useState<"m" | "yd">("m");
  const [carryIn, setCarryIn] = useState("");
  const [offlineIn, setOfflineIn] = useState("0");
  const [mark, setMark] = useState<Vec2 | null>(null);
  const [fingerDir, setFingerDir] = useState<FingerMissDirection | null>(null);
  const [fingerWidth, setFingerWidth] = useState<FingerMissWidth | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [results, setResults] = useState<TeeShotResult[]>([]);
  const [club, setClub] = useState("driver");
  const [flight, setFlight] = useState<FlightAnim | null>(null);
  const [scorePopup, setScorePopup] = useState<ScorePopup | null>(null);
  const [shotBusy, setShotBusy] = useState(false);
  const [lastMsg, setLastMsg] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<SavedResult | null>(null);
  const [range, setRange] = useState<TeeDistanceRange>(() =>
    typeof window !== "undefined" ? loadSavedRange() : normalizeTeeDistanceRange(140, 185),
  );
  /** Display-unit strings while editing min/max carry. */
  const [minCarryIn, setMinCarryIn] = useState("");
  const [maxCarryIn, setMaxCarryIn] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const camRef = useRef({ cx: 0, cy: 100, scale: 4 });
  const rangeRef = useRef(range);
  rangeRef.current = range;

  const toDisplay = (metres: number) =>
    unit === "m" ? Math.round(metres * 10) / 10 : Math.round(metres * 1.09361 * 10) / 10;
  const fromDisplay = (v: number) => (unit === "m" ? v : v / 1.09361);
  const unitLabel = unit === "m" ? "m" : "yd";
  const roundDisplay = (metres: number) =>
    unit === "m" ? Math.round(metres) : Math.round(metres * 1.09361);

  const stats = useMemo(() => summarizeTeeSession(results), [results]);
  const handicapEstimate = useMemo(
    () => (stats.shots > 0 ? estimateTeeShotHandicap(stats.score) : null),
    [stats.shots, stats.score],
  );
  const shotNum = results.length + 1;
  const playerLabel = testingFor?.name ?? (isCoach ? "Yourself" : null);
  const persistForId = testingFor?.id ?? user?.id ?? null;

  useEffect(() => {
    setLastSaved(loadLastResult());
    const saved = loadSavedRange();
    setRange(saved);
  }, []);

  useEffect(() => {
    setMinCarryIn(String(roundDisplay(range.minM)));
    setMaxCarryIn(String(roundDisplay(range.maxM)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit, range.minM, range.maxM]);

  const commitRangeFromInputs = (prefer: "min" | "max" | "both" = "both") => {
    const minN = Number(minCarryIn);
    const maxN = Number(maxCarryIn);
    if (!Number.isFinite(minN) || !Number.isFinite(maxN)) return;
    const next = normalizeTeeDistanceRange(fromDisplay(minN), fromDisplay(maxN), prefer);
    setRange(next);
    saveRange(next);
    setMinCarryIn(String(roundDisplay(next.minM)));
    setMaxCarryIn(String(roundDisplay(next.maxM)));
  };

  useEffect(() => {
    if (!scenario || phase !== "playing") return;
    setCarryIn(String(toDisplay(scenario.distanceM)));
    setOfflineIn("0");
    setMark(null);
    setFingerDir(null);
    setFingerWidth(null);
    setFlight(null);
    setClub(suggestTeeClub(scenario.distanceM));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario?.id]);

  const sfx = useCallback(
    (fn: () => void) => {
      if (soundOn) fn();
    },
    [soundOn],
  );

  const startTest = () => {
    trackToolUse("tee-shot-sim");
    const useRange = normalizeTeeDistanceRange(
      fromDisplay(Number(minCarryIn) || range.minM),
      fromDisplay(Number(maxCarryIn) || range.maxM),
      "min",
    );
    setRange(useRange);
    saveRange(useRange);
    const next = generateTeeScenario(useRange);
    setScenario(next);
    setClub(suggestTeeClub(next.distanceM));
    setResults([]);
    setLastMsg(null);
    setFlight(null);
    setScorePopup(null);
    setShotBusy(false);
    setMark(null);
    setFingerDir(null);
    setFingerWidth(null);
    setPhase("playing");
  };

  const backToSetup = () => {
    setPhase("setup");
    setScenario(null);
    setResults([]);
    setFlight(null);
    setScorePopup(null);
    setShotBusy(false);
    setMark(null);
    setFingerDir(null);
    setFingerWidth(null);
    setLastMsg(null);
    setLastSaved(loadLastResult());
  };

  const nextScenario = useCallback(() => {
    setScorePopup(null);
    setShotBusy(false);
    setScenario(generateTeeScenario(rangeRef.current));
  }, []);

  const finishLanding = useCallback(
    (land: Vec2, current: TeeScenario) => {
      const scored = scoreTeeShot(current, land);
      const entry: TeeShotResult = {
        ...scored,
        club,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      };
      const fairway = isFairwayHit(entry.lie);

      setShotBusy(true);
      setFlight({ from: TEE_BALL, to: land, progress: 0, done: false });
      sfx(playSwing);
      sfx(playBallHit);
      window.setTimeout(() => {
        if (entry.lie === "water") sfx(playSplash);
        else if (entry.lie === "bunker") sfx(playSand);
        setScorePopup({ points: entry.points, at: land, born: Date.now() });
      }, 420);

      const off =
        entry.side === "C"
          ? "centre line"
          : `${toDisplay(Math.abs(entry.offlineM))}${unitLabel} ${entry.side}${
              entry.danger ? " danger" : " safe"
            }`;
      setLastMsg(`${teeResultLabel(entry.lie)} · ${off} · ${entry.points}/100`);

      setResults((prev) => {
        const next = [...prev, entry];
        if (next.length >= SHOTS_PER_SET) {
          const summary = summarizeTeeSession(next);
          const hcp = estimateTeeShotHandicap(summary.score);
          const saved: SavedResult = {
            at: new Date().toISOString(),
            playerId: testingFor?.id ?? null,
            playerName: testingFor?.name ?? null,
            mode,
            stats: summary,
            handicapEstimate: hcp,
          };
          saveLastResult(saved);
          setLastSaved(saved);
          window.setTimeout(() => {
            setShotBusy(false);
            setPhase("complete");
          }, fairway ? 1100 : 400);
          if (persistForId) {
            void persistTeeSet(persistForId, mode, next, summary);
          }
        } else {
          window.setTimeout(() => nextScenario(), fairway ? 1300 : 700);
        }
        return next;
      });
    },
    [sfx, toDisplay, unitLabel, nextScenario, testingFor, mode, persistForId, club],
  );

  const fireRadar = () => {
    if (!scenario || flight || shotBusy || phase !== "playing") return;
    const carryDisp = Number(carryIn);
    const offlineDisp = Number(offlineIn);
    if (!Number.isFinite(carryDisp) || carryDisp <= 0) return;
    const carryM = fromDisplay(carryDisp);
    const offlineM = fromDisplay(Number.isFinite(offlineDisp) ? offlineDisp : 0);
    const land = landFromRadarApproach(
      TEE_BALL,
      scenario.target,
      mark,
      carryM,
      offlineM,
      false,
    );
    finishLanding(land, scenario);
  };

  const confirmFingerMiss = () => {
    if (!scenario || flight || shotBusy || phase !== "playing" || !mark) return;
    if (!fingerMissReady(fingerDir, fingerWidth) || !fingerDir) return;
    const fingers = fingerDir === "straight" ? 0 : fingerWidth!;
    const { land } = landFromFingerMiss(TEE_BALL, mark, fingerDir, fingers);
    finishLanding(land, scenario);
  };

  useEffect(() => {
    let raf = 0;
    if (flight && !flight.done) {
      const tick = () => {
        setFlight((f) => {
          if (!f || f.done) return f;
          const next = f.progress + 0.045;
          if (next >= 1) return { ...f, progress: 1, done: true };
          return { ...f, progress: next };
        });
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    return () => cancelAnimationFrame(raf);
  }, [flight?.done, !!flight]);

  useEffect(() => {
    if (flight?.done) {
      const t = window.setTimeout(() => setFlight(null), 180);
      return () => clearTimeout(t);
    }
  }, [flight?.done]);

  useEffect(() => {
    if (phase !== "playing" || !scenario) return;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    let raf = 0;

    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = wrap.clientWidth;
      const h = Math.max(compact ? 260 : 340, Math.min(480, w * 0.9));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      camRef.current = cameraForTee(scenario, w, h);
      const cam = camRef.current;

      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "#9ec4dc");
      sky.addColorStop(0.28, "#c5d9b8");
      sky.addColorStop(0.55, "#6a9a55");
      sky.addColorStop(1, "#3a6a32");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      const b0 = worldToScreen({ x: scenario.bounds.minX, y: scenario.bounds.maxY }, cam, w, h);
      const b1 = worldToScreen({ x: scenario.bounds.maxX, y: scenario.bounds.minY }, cam, w, h);
      ctx.fillStyle = "#3f6e36";
      ctx.fillRect(b0.x, b0.y, b1.x - b0.x, b1.y - b0.y);
      ctx.save();
      ctx.beginPath();
      ctx.rect(b0.x, b0.y, b1.x - b0.x, b1.y - b0.y);
      ctx.clip();
      for (let i = 0; i < 70; i++) {
        const t = (i * 97 + scenario.distanceM * 3) % 1000;
        const gx = b0.x + (((t * 37) % 1000) / 1000) * (b1.x - b0.x);
        const gy = b0.y + (((t * 53) % 1000) / 1000) * (b1.y - b0.y);
        ctx.fillStyle = i % 2 === 0 ? "rgba(50,90,40,0.16)" : "rgba(90,120,55,0.1)";
        ctx.fillRect(gx, gy, 1.5 + (i % 3), 1.2 + (i % 2));
      }
      ctx.restore();

      pathPoly(ctx, scenario.fairwayPoly, cam, w, h);
      const fw = ctx.createLinearGradient(0, h, 0, h * 0.35);
      fw.addColorStop(0, "#5aa848");
      fw.addColorStop(1, "#78c868");
      ctx.fillStyle = fw;
      ctx.fill();
      ctx.strokeStyle = "rgba(40,100,40,0.45)";
      ctx.lineWidth = 1.2;
      pathPoly(ctx, scenario.fairwayPoly, cam, w, h);
      ctx.stroke();

      // Soft danger-side wash + centre line through the landing window
      {
        const dangerSign = scenario.dangerSide === "R" ? 1 : -1;
        const top = worldToScreen({ x: 0, y: scenario.distanceM + 24 }, cam, w, h);
        const bot = worldToScreen({ x: 0, y: scenario.distanceM - 55 }, cam, w, h);
        const edge = worldToScreen(
          { x: dangerSign * (scenario.fairwayHalfM + 18), y: scenario.distanceM },
          cam,
          w,
          h,
        );
        ctx.fillStyle = "rgba(180, 40, 40, 0.1)";
        ctx.beginPath();
        ctx.moveTo(bot.x, bot.y);
        ctx.lineTo(top.x, top.y);
        ctx.lineTo(edge.x, top.y);
        ctx.lineTo(edge.x, bot.y);
        ctx.closePath();
        ctx.fill();

        ctx.setLineDash([6, 5]);
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(bot.x, bot.y);
        ctx.lineTo(top.x, top.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      for (const hz of scenario.hazards) {
        pathPoly(ctx, hz.polygon, cam, w, h);
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        let cx = 0;
        let cy = 0;
        for (const p of hz.polygon) {
          const s = worldToScreen(p, cam, w, h);
          cx += s.x;
          cy += s.y;
          minX = Math.min(minX, s.x);
          maxX = Math.max(maxX, s.x);
          minY = Math.min(minY, s.y);
          maxY = Math.max(maxY, s.y);
        }
        cx /= hz.polygon.length;
        cy /= hz.polygon.length;
        const rad = Math.max(10, Math.hypot(maxX - minX, maxY - minY) * 0.42);

        if (hz.kind === "water") {
          const g = ctx.createRadialGradient(cx - rad * 0.15, cy - rad * 0.2, 1, cx, cy, rad);
          g.addColorStop(0, "#8ed0ea");
          g.addColorStop(0.55, "#3a9fd0");
          g.addColorStop(1, "#1a628f");
          ctx.fillStyle = g;
          ctx.fill();
          ctx.strokeStyle = "rgba(255,255,255,0.4)";
          ctx.lineWidth = 1.6;
          ctx.stroke();
          pathPoly(ctx, hz.polygon, cam, w, h);
          ctx.strokeStyle = "rgba(20,80,120,0.45)";
          ctx.lineWidth = 1;
          ctx.stroke();
        } else {
          const g = ctx.createRadialGradient(cx - 4, cy - 5, 1, cx, cy, rad);
          g.addColorStop(0, "#f3e2c0");
          g.addColorStop(0.65, "#d2b07a");
          g.addColorStop(1, "#b8925c");
          ctx.fillStyle = g;
          ctx.fill();
          ctx.strokeStyle = "rgba(140,110,70,0.75)";
          ctx.lineWidth = 1.1;
          ctx.stroke();
        }
      }

      // Target + centre bands (strict offline scoring guides)
      const targetS = worldToScreen(scenario.target, cam, w, h);
      for (let i = CENTRE_BANDS.length - 1; i >= 0; i--) {
        const band = CENTRE_BANDS[i]!;
        const rPx = band.radiusM * cam.scale;
        ctx.beginPath();
        ctx.arc(targetS.x, targetS.y, rPx, 0, Math.PI * 2);
        ctx.strokeStyle =
          i === 0 ? "rgba(255,165,0,0.9)" : i === 1 ? "rgba(255,255,255,0.75)" : "rgba(160,200,255,0.65)";
        ctx.lineWidth = i === 0 ? 2 : 1.4;
        ctx.setLineDash(i === 0 ? [] : [5, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.fillStyle = "#FFA500";
      ctx.beginPath();
      ctx.arc(targetS.x, targetS.y, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Shot enters from bottom-centre (landing zoom — tee is off-screen below).
      const entryScreen = { x: w / 2, y: h - 6 };

      if (mode === "finger_dispersion" ? mark : true) {
        const aim = mark ?? scenario.target;
        const t = worldToScreen(aim, cam, w, h);
        const end = {
          x: Math.max(6, Math.min(w - 6, t.x)),
          y: Math.max(6, Math.min(h - 6, t.y)),
        };
        ctx.strokeStyle =
          mode === "finger_dispersion" ? "rgba(1,68,33,0.75)" : "rgba(1,68,33,0.5)";
        ctx.setLineDash([5, 6]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(entryScreen.x, entryScreen.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        ctx.setLineDash([]);
        if (mode === "finger_dispersion" && mark) {
          ctx.fillStyle = "#014421";
          ctx.beginPath();
          ctx.arc(end.x, end.y, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }

      if (
        mode === "finger_dispersion" &&
        mark &&
        fingerDir &&
        (fingerDir === "straight" || fingerWidth != null)
      ) {
        const { land } = landFromFingerMiss(
          TEE_BALL,
          mark,
          fingerDir,
          fingerDir === "straight" ? 0 : fingerWidth!,
        );
        const aRaw = worldToScreen(land, cam, w, h);
        const a = {
          x: Math.max(6, Math.min(w - 6, aRaw.x)),
          y: Math.max(6, Math.min(h - 6, aRaw.y)),
        };
        ctx.strokeStyle = "rgba(255,170,40,0.75)";
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(entryScreen.x, entryScreen.y);
        ctx.lineTo(a.x, a.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(255,170,40,0.2)";
        ctx.beginPath();
        ctx.arc(a.x, a.y, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffaa28";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(a.x, a.y, 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(a.x, a.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }

      if (flight) {
        const eRaw = worldToScreen(flight.to, cam, w, h);
        const e = {
          x: Math.max(6, Math.min(w - 6, eRaw.x)),
          y: Math.max(6, Math.min(h - 6, eRaw.y)),
        };
        const b = entryScreen;
        const mx = (b.x + e.x) / 2;
        const my = Math.min(b.y, e.y) - 36 * Math.sin(flight.progress * Math.PI);
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        for (let i = 1; i <= 20; i++) {
          const t = (i / 20) * flight.progress;
          ctx.lineTo(
            (1 - t) * (1 - t) * b.x + 2 * (1 - t) * t * mx + t * t * e.x,
            (1 - t) * (1 - t) * b.y + 2 * (1 - t) * t * my + t * t * e.y,
          );
        }
        ctx.stroke();
        const t = flight.progress;
        const bx = (1 - t) * (1 - t) * b.x + 2 * (1 - t) * t * mx + t * t * e.x;
        const by = (1 - t) * (1 - t) * b.y + 2 * (1 - t) * t * my + t * t * e.y;
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(bx, by, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }

      if (scorePopup) {
        const age = (Date.now() - scorePopup.born) / 1000;
        if (age < 1.25) {
          const s = worldToScreen(scorePopup.at, cam, w, h);
          const rise = Math.min(36, age * 42);
          const alpha =
            age < 0.12 ? age / 0.12 : age > 0.85 ? Math.max(0, 1 - (age - 0.85) / 0.4) : 1;
          const label = `${scorePopup.points}`;
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.font = "800 22px ui-sans-serif, system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.lineWidth = 4;
          ctx.strokeStyle = "rgba(1,68,33,0.85)";
          ctx.strokeText(label, s.x, s.y - 10 - rise);
          ctx.fillStyle = "#FFA500";
          ctx.fillText(label, s.x, s.y - 10 - rise);
          ctx.font = "700 11px ui-sans-serif, system-ui, sans-serif";
          ctx.fillStyle = "#fff";
          ctx.strokeStyle = "rgba(1,68,33,0.7)";
          ctx.lineWidth = 3;
          ctx.strokeText("pts", s.x, s.y + 4 - rise);
          ctx.fillText("pts", s.x, s.y + 4 - rise);
          ctx.restore();
        }
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [phase, scenario, mark, mode, flight, scorePopup, compact, fingerDir, fingerWidth]);

  const onPointer = (e: React.PointerEvent<HTMLCanvasElement>, down?: boolean) => {
    if (phase !== "playing" || !scenario) return;
    if (!down) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sp = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const world = screenToWorld(sp, camRef.current, rect.width, rect.height);
    setMark(clampTeeAim(scenario, world, false));
  };

  return (
    <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 bg-gradient-to-r from-[#014421] to-[#0b6634] px-3 py-2.5 text-white">
        <div className="min-w-0">
          <p className="text-sm font-bold tracking-tight">Tee Shot Simulator</p>
          <p className="text-[11px] text-white/75">
            {phase === "setup"
              ? "Set up the test, then start"
              : phase === "complete"
                ? "Set complete"
                : `Shot ${Math.min(shotNum, SHOTS_PER_SET)} of ${SHOTS_PER_SET}${
                    playerLabel ? ` · ${playerLabel}` : ""
                  }`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSoundOn((s) => !s)}
            className="rounded-full bg-white/10 p-1.5 hover:bg-white/20"
            aria-label={soundOn ? "Mute" : "Unmute"}
          >
            {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
          {phase !== "setup" && (
            <button
              type="button"
              onClick={backToSetup}
              className="rounded-full bg-white/10 p-1.5 hover:bg-white/20"
              aria-label="Back to setup"
              title="Back to setup"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {phase === "playing" && lastMsg && (
        <div className="bg-stone-50 px-3 py-2 text-center text-xs font-medium text-stone-700">{lastMsg}</div>
      )}

      <div className="space-y-3 p-3">
        {phase === "setup" && (
          <>
            {isCoach && (
              <TestingForSelect
                value={testingFor}
                onChange={setTestingFor}
                promptTitle="Who is taking this test?"
                promptHint="Yourself, or search a player in your lesson"
                selectedTitle={(name) => `Testing ${name}`}
                selectedHint="Their set score and handicap estimate save to their practice record."
              />
            )}

            <div>
              <p className="mb-1.5 text-xs font-semibold text-stone-600">Input mode</p>
              <div className="flex rounded-full bg-stone-100 p-0.5" role="radiogroup" aria-label="Input mode">
                {(
                  [
                    { id: "launch_monitor" as const, label: "Radar", icon: Radar },
                    { id: "finger_dispersion" as const, label: "Finger dispersion", icon: Hand },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={mode === m.id}
                    onClick={() => setMode(m.id)}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-2.5 text-xs font-semibold transition ${
                      mode === m.id ? "bg-[#014421] text-white shadow-sm" : "text-stone-600"
                    }`}
                  >
                    <m.icon className="h-3.5 w-3.5" aria-hidden />
                    {m.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-stone-500">
                {mode === "finger_dispersion"
                  ? "Tap left/right of the target to set aim."
                  : "Hit your real shot, then enter carry and offline from the launch monitor."}
              </p>
            </div>

            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-stone-600">Units</p>
              <div className="flex rounded-full bg-stone-100 p-0.5">
                {(["m", "yd"] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setUnit(u)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      unit === u ? "bg-[#FFA500] text-[#3d2600]" : "text-stone-600"
                    }`}
                  >
                    {u === "m" ? "Metres" : "Yards"}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 rounded-2xl bg-stone-50 p-3 ring-1 ring-stone-100">
              <div>
                <p className="text-xs font-semibold text-stone-800">Your carry range</p>
                <p className="mt-0.5 text-[11px] text-stone-500">
                  Corridors randomise between these distances ({unitLabel}). Saved on this phone.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs font-semibold text-stone-700">
                  Min
                  <input
                    type="text"
                    inputMode="decimal"
                    value={minCarryIn}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || /^\d*\.?\d*$/.test(v)) setMinCarryIn(v);
                    }}
                    onBlur={() => commitRangeFromInputs("min")}
                    className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-lg font-bold tabular-nums outline-none focus:border-[#014421]"
                  />
                </label>
                <label className="block text-xs font-semibold text-stone-700">
                  Max
                  <input
                    type="text"
                    inputMode="decimal"
                    value={maxCarryIn}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || /^\d*\.?\d*$/.test(v)) setMaxCarryIn(v);
                    }}
                    onBlur={() => commitRangeFromInputs("max")}
                    className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-lg font-bold tabular-nums outline-none focus:border-[#014421]"
                  />
                </label>
              </div>
              <p className="text-[11px] text-stone-400">
                Allowed {roundDisplay(TEE_DISTANCE_LIMITS.minM)}–
                {roundDisplay(TEE_DISTANCE_LIMITS.maxM)}
                {unitLabel}.
              </p>
            </div>

            <div className="rounded-2xl bg-stone-50 p-3 text-xs text-stone-600 ring-1 ring-stone-100">
              <p className="font-semibold text-stone-800">
                {SHOTS_PER_SET} random tee corridors · strict centre-line scoring
              </p>
              <p className="mt-1">
                Stay near the centre line for top points. The red-tinted danger side is penalised
                harder than the safe side
                {isCoach && testingFor ? ` · saves for ${testingFor.name}` : ""}.
              </p>
            </div>

            {lastSaved && (
              <div className="rounded-2xl border border-stone-100 bg-white px-3 py-2.5 text-xs text-stone-600">
                <p className="font-semibold text-stone-800">Last set on this phone</p>
                <p className="mt-0.5">
                  {lastSaved.playerName ? lastSaved.playerName : "Yourself"} ·{" "}
                  <span className="font-bold text-[#014421]">{lastSaved.stats.score}/100</span>
                  {typeof lastSaved.handicapEstimate === "number" && (
                    <>
                      {" "}
                      · est.{" "}
                      <span className="font-bold text-[#014421]">
                        {formatHandicap(lastSaved.handicapEstimate)}
                      </span>
                    </>
                  )}{" "}
                  · FIR {lastSaved.stats.firPct}%
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={startTest}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#014421] py-3.5 text-sm font-bold text-white"
            >
              <Play className="h-4 w-4 fill-current" aria-hidden />
              Start test
              {isCoach && testingFor ? ` · ${testingFor.name}` : ""}
            </button>
          </>
        )}

        {phase === "playing" && scenario && (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-stone-50 p-2.5">
                <p className="text-[10px] font-medium text-stone-500">Distance</p>
                <p className="text-base font-bold tabular-nums text-stone-900">
                  {toDisplay(scenario.distanceM)}
                  {unitLabel}
                </p>
              </div>
              <div className="rounded-2xl bg-stone-50 p-2.5">
                <p className="text-[10px] font-medium text-stone-500">Danger</p>
                <p className="text-base font-bold text-red-700">
                  {scenario.dangerSide === "L" ? "Left" : "Right"}
                </p>
              </div>
              <div className="rounded-2xl bg-stone-50 p-2.5">
                <p className="text-[10px] font-medium text-stone-500">Safe</p>
                <p className="text-base font-bold text-[#014421]">
                  {scenario.dangerSide === "L" ? "Right" : "Left"}
                </p>
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold text-stone-600">Club for this shot</p>
              <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                {TEE_CLUBS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setClub(c.id)}
                    aria-pressed={club === c.id}
                    className={`shrink-0 rounded-xl px-2.5 py-2 text-xs font-bold transition ${
                      club === c.id
                        ? "bg-[#014421] text-white"
                        : "bg-stone-100 text-stone-700 hover:bg-stone-200"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div ref={wrapRef} className="relative overflow-hidden rounded-2xl ring-1 ring-stone-200/80">
              <canvas
                ref={canvasRef}
                className="block w-full touch-none"
                onPointerDown={(e) => {
                  (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
                  onPointer(e, true);
                }}
              />
              <div className="pointer-events-none absolute left-2 top-2 max-w-[85%] rounded-2xl bg-white/95 px-2.5 py-1.5 text-[11px] font-semibold text-stone-800 shadow-sm">
                {mode === "finger_dispersion"
                  ? mark
                    ? "Aim set — hit, then enter fingers L/R"
                    : "Tap left or right of the target"
                  : "Optional: tap left/right of target (defaults to centre)"}
              </div>
            </div>

            {mode === "launch_monitor" ? (
              <div className="space-y-2 rounded-2xl bg-stone-50 p-3 ring-1 ring-stone-100">
                <p className="text-xs text-stone-500">
                  Hit your real shot, then enter carry &amp; offline from the launch monitor
                </p>
                <label className="block text-xs font-semibold text-stone-700">
                  Carry ({unitLabel})
                  <input
                    type="text"
                    inputMode="decimal"
                    value={carryIn}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || /^\d*\.?\d*$/.test(v)) setCarryIn(v);
                    }}
                    className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-lg font-bold tabular-nums outline-none focus:border-[#014421]"
                  />
                </label>
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-stone-700">
                    Offline ({unitLabel})
                  </p>
                  {(() => {
                    const offlineSide: "L" | "0" | "R" = offlineIn.startsWith("-")
                      ? "L"
                      : Number(offlineIn) > 0
                        ? "R"
                        : "0";
                    const offlineMag = offlineIn.replace(/^-/, "");
                    const magNum = Number(offlineMag);
                    return (
                      <>
                        <div className="flex gap-2">
                          {(
                            [
                              { key: "L" as const, label: "Left" },
                              { key: "0" as const, label: "On line" },
                              { key: "R" as const, label: "Right" },
                            ] as const
                          ).map((side) => {
                            const active = offlineSide === side.key;
                            return (
                              <button
                                key={side.key}
                                type="button"
                                onClick={() => {
                                  if (side.key === "0") {
                                    setOfflineIn("0");
                                    return;
                                  }
                                  const base =
                                    Number.isFinite(magNum) && magNum > 0 ? offlineMag : "5";
                                  setOfflineIn(side.key === "L" ? `-${base}` : base);
                                }}
                                className={`flex-1 rounded-xl py-2.5 text-sm font-bold ${
                                  active
                                    ? side.key === "L"
                                      ? "bg-sky-700 text-white"
                                      : side.key === "R"
                                        ? "bg-[#FFA500] text-[#3d2600]"
                                        : "bg-stone-700 text-white"
                                    : "bg-white text-stone-600 ring-1 ring-stone-200"
                                }`}
                              >
                                {side.label}
                              </button>
                            );
                          })}
                        </div>
                        <label className="mt-2 block text-xs font-semibold text-stone-700">
                          How far offline
                          <input
                            type="text"
                            inputMode="decimal"
                            disabled={offlineSide === "0"}
                            value={offlineSide === "0" ? "0" : offlineMag}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (!(v === "" || /^\d*\.?\d*$/.test(v))) return;
                              if (offlineSide === "L") setOfflineIn(v === "" ? "-" : `-${v}`);
                              else setOfflineIn(v === "" ? "" : v);
                            }}
                            className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-lg font-bold tabular-nums outline-none focus:border-[#FFA500] disabled:bg-stone-100 disabled:text-stone-400"
                          />
                        </label>
                        <p className="mt-1 text-[11px] text-stone-500">
                          Tap Left or Right, then enter distance — no minus key needed.
                        </p>
                      </>
                    );
                  })()}
                </div>
                <button
                  type="button"
                  onClick={fireRadar}
                  disabled={!!flight || shotBusy}
                  className="w-full rounded-2xl bg-[#014421] py-3.5 text-sm font-bold text-white disabled:opacity-40"
                >
                  Log shot
                </button>
              </div>
            ) : (
              <div className="space-y-2 rounded-2xl bg-stone-50 p-3 ring-1 ring-stone-100">
                <p className="text-xs text-stone-500">
                  1. Tap left/right of the target to set aim · 2. Hit that line on the range · 3.
                  Enter fingers left or right of aim
                </p>
                <FingerMissInput
                  distanceM={mark ? dist(TEE_BALL, mark) : scenario.distanceM}
                  unitLabel={unitLabel}
                  toDisplay={toDisplay}
                  direction={fingerDir}
                  fingers={fingerWidth}
                  onDirectionChange={setFingerDir}
                  onFingersChange={setFingerWidth}
                />
                <button
                  type="button"
                  onClick={confirmFingerMiss}
                  disabled={!mark || !fingerMissReady(fingerDir, fingerWidth) || !!flight || shotBusy}
                  className="w-full rounded-2xl bg-[#FFA500] py-3.5 text-sm font-bold text-[#3d2600] disabled:opacity-40"
                >
                  {!mark
                    ? "Set aim first"
                    : fingerMissReady(fingerDir, fingerWidth)
                      ? "Log shot"
                      : "Enter finger miss"}
                </button>
              </div>
            )}

            {results.length > 0 && (
              <>
                <div className="flex items-center justify-between gap-2 rounded-xl bg-stone-50 px-3 py-2 text-xs">
                  <span className="text-stone-500">
                    Running · FIR {stats.fairways}/{stats.shots} ({stats.firPct}%)
                  </span>
                  <span className="font-bold tabular-nums text-[#014421]">{stats.score}/100</span>
                </div>
                <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-stone-500">
                  {[...results].reverse().map((r, idx) => (
                    <li key={r.id} className="flex justify-between gap-2 border-b border-stone-100 py-1.5">
                      <span>
                        #{results.length - idx} · {toDisplay(r.distanceM)}
                        {unitLabel}
                        {r.club ? ` · ${r.club}` : ""} · {teeResultLabel(r.lie)}
                        {r.side === "C"
                          ? " · centre"
                          : ` · ${toDisplay(Math.abs(r.offlineM))}${unitLabel} ${r.side}${
                              r.danger ? " danger" : " safe"
                            }`}
                      </span>
                      <span
                        className={`font-bold tabular-nums ${
                          r.danger ? "text-red-700" : "text-[#014421]"
                        }`}
                      >
                        {r.points}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}

        {phase === "complete" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 px-1 text-[#014421]">
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5" aria-hidden />
                <h3 className="text-sm font-bold">
                  Set report{playerLabel ? ` · ${playerLabel}` : ""}
                </h3>
              </div>
              {handicapEstimate != null && (
                <p className="text-xs font-bold">
                  Est.{" "}
                  <span className="tabular-nums text-[#FFA500]">
                    {formatHandicap(handicapEstimate)}
                  </span>
                </p>
              )}
            </div>
            <TeeShotSimReport
              shots={results.map((s) => ({
                points: s.points,
                lie: s.lie,
                distanceM: s.distanceM,
                offlineM: s.offlineM,
                side: s.side,
                danger: s.danger,
                club: s.club,
              }))}
            />
            <p className="text-center text-[11px] text-stone-400">
              Saves to your profile combines · feeds the Driving practice handicap.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={backToSetup}
                className="flex-1 rounded-2xl bg-stone-100 py-3 text-sm font-bold text-stone-800"
              >
                Setup
              </button>
              <button
                type="button"
                onClick={startTest}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-[#014421] py-3 text-sm font-bold text-white"
              >
                <Play className="h-4 w-4 fill-current" aria-hidden />
                Play another 9
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
