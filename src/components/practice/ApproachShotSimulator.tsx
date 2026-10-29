"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hand, Play, Radar, RefreshCw, Target, Volume2, VolumeX } from "lucide-react";
import {
  SCORE_RINGS,
  SHOTS_PER_SET,
  cameraForApproach,
  estimateApproachHandicap,
  fairwayPolygon,
  generateApproachScenario,
  greenPolygon,
  scoreApproachShot,
  summarizeSession,
  type ApproachMode,
  type ApproachScenario,
  type ApproachShotResult,
} from "@/lib/approachShotSim";
import { approachShotSimConfig } from "@/lib/approachShotSimConfig";
import { dist, landFromRadarApproach } from "@/lib/onCourseSimulator/physics";
import type { Vec2 } from "@/lib/onCourseSimulator/types";
import { playBallHit, playCup, playSand, playSplash, playSwing } from "@/lib/onCourseSimulator/sounds";
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
import { IRON_TEST_CLUBS } from "@/lib/ironCombineClubs";
import { ApproachShotSimReport } from "@/components/practice/ApproachShotSimReport";

type FlightAnim = { from: Vec2; to: Vec2; progress: number; done: boolean };
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

const BALL: Vec2 = { x: 0, y: 0 };
const RESULT_KEY = "approach_shot_sim_last_v1";

type SavedResult = {
  at: string;
  playerId: string | null;
  playerName: string | null;
  mode: ApproachMode;
  stats: ReturnType<typeof summarizeSession>;
  handicapEstimate: number;
};

async function persistApproachSet(
  userId: string,
  mode: ApproachMode,
  shots: ApproachShotResult[],
  stats: ReturnType<typeof summarizeSession>,
): Promise<void> {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const res = await insertPracticeLogCompat(supabase, {
      user_id: userId,
      log_type: approachShotSimConfig.practiceLogType,
      score: stats.score,
      total_points: stats.score,
      strike_data: shots.map((s) => ({
        points: s.points,
        lie: s.lie,
        proximityM: s.proximityM,
        distanceM: s.distanceM,
        club: s.club ?? null,
      })),
      metadata: {
        mode,
        girPct: stats.girPct,
        avgProximityM: stats.avgProximityM,
        handicapEstimate: estimateApproachHandicap(stats.score),
      },
    });
    if (!res.ok) {
      console.warn("[ApproachShotSim] practice_logs insert:", res.message);
      return;
    }
    await awardCombineCompletionXp(userId);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("practiceSessionsUpdated"));
    }
  } catch (e) {
    console.warn("[ApproachShotSim] practice_logs insert failed", formatSupabaseWriteError(e));
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

export default function ApproachShotSimulator({ compact }: { compact?: boolean }) {
  const { user } = useAuth();
  const isCoach = isCoachEmail(user?.email) || user?.role === "coach";

  const [phase, setPhase] = useState<Phase>("setup");
  const [testingFor, setTestingFor] = useState<PlayerOption | null>(null);
  const [scenario, setScenario] = useState<ApproachScenario | null>(null);
  const [mode, setMode] = useState<ApproachMode>("launch_monitor");
  const [unit, setUnit] = useState<"m" | "yd">("m");
  const [carryIn, setCarryIn] = useState("");
  const [offlineIn, setOfflineIn] = useState("0");
  /** Aim target on the map (required for finger mode; optional for radar). */
  const [mark, setMark] = useState<Vec2 | null>(null);
  const [fingerDir, setFingerDir] = useState<FingerMissDirection | null>(null);
  const [fingerWidth, setFingerWidth] = useState<FingerMissWidth | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [showScoreRings, setShowScoreRings] = useState(false);
  /** When off, map taps only move aim left/right (depth stays at the pin). */
  const [aimDepthFree, setAimDepthFree] = useState(false);
  const [results, setResults] = useState<ApproachShotResult[]>([]);
  const [club, setClub] = useState("7i");
  const [flight, setFlight] = useState<FlightAnim | null>(null);
  const [lastMsg, setLastMsg] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<SavedResult | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const camRef = useRef({ cx: 0, cy: 100, scale: 4 });

  const toDisplay = (metres: number) =>
    unit === "m" ? Math.round(metres * 10) / 10 : Math.round(metres * 1.09361 * 10) / 10;
  const fromDisplay = (v: number) => (unit === "m" ? v : v / 1.09361);
  const unitLabel = unit === "m" ? "m" : "yd";

  const stats = useMemo(() => summarizeSession(results), [results]);
  const handicapEstimate = useMemo(
    () => (stats.shots > 0 ? estimateApproachHandicap(stats.score) : null),
    [stats.shots, stats.score],
  );
  const shotNum = results.length + 1;
  const playerLabel = testingFor?.name ?? (isCoach ? "Yourself" : null);
  const persistForId = testingFor?.id ?? user?.id ?? null;

  useEffect(() => {
    setLastSaved(loadLastResult());
  }, []);

  useEffect(() => {
    if (!scenario || phase !== "playing") return;
    setCarryIn(String(toDisplay(scenario.distanceM)));
    setOfflineIn("0");
    setMark(null);
    setFingerDir(null);
    setFingerWidth(null);
    setFlight(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario?.id]);

  // Turning off depth aim snaps any existing mark back onto the pin line.
  useEffect(() => {
    if (aimDepthFree || !scenario || !mark) return;
    if (Math.abs(mark.y - scenario.pin.y) < 0.05) return;
    setMark({ x: mark.x, y: scenario.pin.y });
  }, [aimDepthFree, scenario, mark]);

  const sfx = useCallback(
    (fn: () => void) => {
      if (soundOn) fn();
    },
    [soundOn],
  );

  const startTest = () => {
    trackToolUse("approach-shot-sim");
    const next = generateApproachScenario();
    setScenario(next);
    setResults([]);
    setLastMsg(null);
    setFlight(null);
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
    setMark(null);
    setFingerDir(null);
    setFingerWidth(null);
    setLastMsg(null);
    setLastSaved(loadLastResult());
  };

  const nextScenario = useCallback(() => {
    setScenario(generateApproachScenario());
  }, []);

  const finishLanding = useCallback(
    (land: Vec2, current: ApproachScenario) => {
      // Land exactly where carry/aim says — no extra roll that would mismatch entered distance.
      const scored = scoreApproachShot(current, land);
      const entry: ApproachShotResult = {
        ...scored,
        club,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      };

      setFlight({ from: BALL, to: land, progress: 0, done: false });
      sfx(playSwing);
      sfx(playBallHit);
      window.setTimeout(() => {
        if (entry.lie === "water") sfx(playSplash);
        else if (entry.lie === "bunker") sfx(playSand);
        else if (entry.lie === "green" && (entry.proximityM ?? 99) < 3) sfx(playCup);
      }, 400);

      const prox =
        entry.proximityM != null
          ? `${toDisplay(entry.proximityM)}${unitLabel} from pin`
          : entry.lie === "water"
            ? "Water"
            : entry.lie === "bunker"
              ? "Bunker"
              : "Missed green";
      setLastMsg(`${prox} · ${entry.points}/100`);

      setResults((prev) => {
        const next = [...prev, entry];
        if (next.length >= SHOTS_PER_SET) {
          const summary = summarizeSession(next);
          const hcp = estimateApproachHandicap(summary.score);
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
          setPhase("complete");
          if (persistForId) {
            void persistApproachSet(persistForId, mode, next, summary);
          }
        } else {
          window.setTimeout(() => nextScenario(), 700);
        }
        return next;
      });
    },
    [sfx, toDisplay, unitLabel, nextScenario, testingFor, mode, persistForId, club],
  );

  const fireRadar = () => {
    if (!scenario || flight || phase !== "playing") return;
    const carryDisp = Number(carryIn);
    const offlineDisp = Number(offlineIn);
    if (!Number.isFinite(carryDisp) || carryDisp <= 0) return;
    const carryM = fromDisplay(carryDisp);
    const offlineM = fromDisplay(Number.isFinite(offlineDisp) ? offlineDisp : 0);
    // Left/right taps only shift aim line; carry always matches the entered distance.
    const land = landFromRadarApproach(BALL, scenario.pin, mark, carryM, offlineM, aimDepthFree);
    finishLanding(land, scenario);
  };

  /** Log finger dispersion: aim first, then fingers L/R of that line (on-line = aim mark). */
  const confirmFingerMiss = () => {
    if (!scenario || flight || phase !== "playing" || !mark) return;
    if (!fingerMissReady(fingerDir, fingerWidth) || !fingerDir) return;
    const fingers = fingerDir === "straight" ? 0 : fingerWidth!;
    // Carry = ball→aim so "On line" finishes on the aim mark, not the random pin distance.
    const { land } = landFromFingerMiss(BALL, mark, fingerDir, fingers);
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

      camRef.current = cameraForApproach(scenario, w, h);
      const cam = camRef.current;

      // Photo-like atmosphere: soft sky → deep rough
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "#9ec4dc");
      sky.addColorStop(0.28, "#c5d9b8");
      sky.addColorStop(0.55, "#6a9a55");
      sky.addColorStop(1, "#3a6a32");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      // Rough plate with subtle grain
      const b0 = worldToScreen({ x: scenario.bounds.minX, y: scenario.bounds.maxY }, cam, w, h);
      const b1 = worldToScreen({ x: scenario.bounds.maxX, y: scenario.bounds.minY }, cam, w, h);
      ctx.fillStyle = "#3f6e36";
      ctx.fillRect(b0.x, b0.y, b1.x - b0.x, b1.y - b0.y);
      // Stable rough grain (no flicker)
      ctx.save();
      ctx.beginPath();
      ctx.rect(b0.x, b0.y, b1.x - b0.x, b1.y - b0.y);
      ctx.clip();
      for (let i = 0; i < 70; i++) {
        const t = (i * 97 + scenario.distanceM * 3) % 1000;
        const gx = b0.x + ((t * 37) % 1000) / 1000 * (b1.x - b0.x);
        const gy = b0.y + ((t * 53) % 1000) / 1000 * (b1.y - b0.y);
        ctx.fillStyle = i % 2 === 0 ? "rgba(50,90,40,0.16)" : "rgba(90,120,55,0.1)";
        ctx.fillRect(gx, gy, 1.5 + (i % 3), 1.2 + (i % 2));
      }
      ctx.restore();

      // Fairway apron
      pathPoly(ctx, fairwayPolygon(scenario), cam, w, h);
      const fw = ctx.createLinearGradient(0, h, 0, h * 0.35);
      fw.addColorStop(0, "#5aa848");
      fw.addColorStop(1, "#78c868");
      ctx.fillStyle = fw;
      ctx.fill();

      // Collar / fringe (darker ring outside putting surface)
      pathPoly(ctx, scenario.collarPoly, cam, w, h);
      ctx.fillStyle = "#4e8f42";
      ctx.fill();

      for (const hz of scenario.hazards) {
        pathPoly(ctx, hz.polygon, cam, w, h);
        if (hz.kind === "water") {
          // Soft pond: deep centre, lighter shore — no stripe overlay
          let cx = 0;
          let cy = 0;
          for (const p of hz.polygon) {
            const s = worldToScreen(p, cam, w, h);
            cx += s.x;
            cy += s.y;
          }
          cx /= hz.polygon.length;
          cy /= hz.polygon.length;
          const g = ctx.createRadialGradient(cx - 6, cy - 8, 2, cx, cy, 55);
          g.addColorStop(0, "#7ec8e8");
          g.addColorStop(0.45, "#3a9fd0");
          g.addColorStop(1, "#1e6a98");
          ctx.fillStyle = g;
          ctx.fill();
          ctx.strokeStyle = "rgba(255,255,255,0.35)";
          ctx.lineWidth = 2;
          ctx.stroke();
          pathPoly(ctx, hz.polygon, cam, w, h);
          ctx.strokeStyle = "rgba(20,90,130,0.55)";
          ctx.lineWidth = 1;
          ctx.stroke();
        } else {
          const g = ctx.createRadialGradient(w * 0.45, h * 0.4, 4, w * 0.5, h * 0.45, h * 0.35);
          g.addColorStop(0, "#f0e0c0");
          g.addColorStop(1, "#c4a06e");
          ctx.fillStyle = g;
          ctx.fill();
          ctx.strokeStyle = "#a88858";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      // Putting green — photo-like mow stripes + soft edge
      const greenPts = greenPolygon(scenario);
      pathPoly(ctx, greenPts, cam, w, h);
      const gc = worldToScreen(scenario.greenCenter, cam, w, h);
      const gg = ctx.createRadialGradient(gc.x - 8, gc.y - 10, 4, gc.x, gc.y, Math.max(scenario.greenRx, scenario.greenRy) * cam.scale * 1.15);
      gg.addColorStop(0, "#b6efae");
      gg.addColorStop(0.45, "#7ed674");
      gg.addColorStop(1, "#4fad4a");
      ctx.fillStyle = gg;
      ctx.fill();
      ctx.save();
      pathPoly(ctx, greenPts, cam, w, h);
      ctx.clip();
      // Alternating mow bands
      const stripeStep = Math.max(4, 2.2 * cam.scale);
      for (let i = -20; i < 40; i++) {
        const y = gc.y - 20 * cam.scale + i * stripeStep;
        ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.07)" : "rgba(20,70,25,0.06)";
        ctx.fillRect(0, y, w, stripeStep * 0.92);
      }
      // Soft contour shade
      const shade = ctx.createRadialGradient(gc.x + 12, gc.y + 8, 2, gc.x, gc.y, Math.max(40, scenario.greenRy * cam.scale));
      shade.addColorStop(0, "rgba(255,255,255,0)");
      shade.addColorStop(1, "rgba(30,70,30,0.16)");
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      ctx.strokeStyle = "rgba(55,120,50,0.85)";
      ctx.lineWidth = 1.4;
      pathPoly(ctx, greenPts, cam, w, h);
      ctx.stroke();

      const pinS = worldToScreen(scenario.pin, cam, w, h);

      // Score guide rings only — labels live in the HTML legend (avoids overlap)
      if (showScoreRings) {
        const ringColors = [
          "rgba(255,165,0,0.95)",
          "rgba(255,255,255,0.88)",
          "rgba(160,200,255,0.75)",
        ];
        for (let i = SCORE_RINGS.length - 1; i >= 0; i--) {
          const ring = SCORE_RINGS[i]!;
          const rPx = ring.radiusM * cam.scale;
          ctx.beginPath();
          ctx.arc(pinS.x, pinS.y, rPx, 0, Math.PI * 2);
          ctx.strokeStyle = ringColors[i] ?? "rgba(255,255,255,0.7)";
          ctx.lineWidth = i === 0 ? 2.2 : 1.5;
          ctx.setLineDash(i === 0 ? [] : [5, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.beginPath();
      ctx.ellipse(pinS.x + 1, pinS.y + 2, 4, 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#f1f5f9";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pinS.x, pinS.y);
      ctx.lineTo(pinS.x, pinS.y - 18);
      ctx.stroke();
      ctx.fillStyle = "#e53935";
      ctx.beginPath();
      ctx.moveTo(pinS.x, pinS.y - 18);
      ctx.lineTo(pinS.x + 12, pinS.y - 13);
      ctx.lineTo(pinS.x, pinS.y - 8);
      ctx.fill();
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.arc(pinS.x, pinS.y, 3, 0, Math.PI * 2);
      ctx.fill();

      const entryScreen = { x: w / 2, y: h + 8 };
      // Aim line (required for finger mode; optional for radar)
      if (mode === "finger_dispersion" ? mark : true) {
        const target = mark ?? scenario.pin;
        const t = worldToScreen(target, cam, w, h);
        ctx.strokeStyle =
          mode === "finger_dispersion" ? "rgba(1,68,33,0.7)" : "rgba(1,68,33,0.45)";
        ctx.setLineDash([5, 6]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(entryScreen.x, entryScreen.y);
        ctx.lineTo(t.x, t.y);
        ctx.stroke();
        ctx.setLineDash([]);
        if (mode === "finger_dispersion" && mark) {
          ctx.fillStyle = "#014421";
          ctx.beginPath();
          ctx.arc(t.x, t.y, 5, 0, Math.PI * 2);
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
          BALL,
          mark,
          fingerDir,
          fingerDir === "straight" ? 0 : fingerWidth!,
        );
        const a = worldToScreen(land, cam, w, h);
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
        const e = worldToScreen(flight.to, cam, w, h);
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

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [phase, scenario, mark, mode, flight, compact, fingerDir, fingerWidth, showScoreRings]);

  const onPointer = (e: React.PointerEvent<HTMLCanvasElement>, down?: boolean) => {
    if (phase !== "playing" || !scenario) return;
    if (!down) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sp = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const world = screenToWorld(sp, camRef.current, rect.width, rect.height);
    // Default: lateral aim only — keep depth on the pin so taps don’t go short/long by accident.
    if (!aimDepthFree) world.y = scenario.pin.y;
    setMark(world);
  };

  return (
    <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 bg-gradient-to-r from-[#014421] to-[#0b6634] px-3 py-2.5 text-white">
        <div className="min-w-0">
          <p className="text-sm font-bold tracking-tight">Approach Shot Simulator</p>
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
                  ? "Tap left/right of the pin to set aim (depth stays on the pin unless you turn on Short / long aim)."
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

            <div className="flex items-center justify-between gap-2 rounded-2xl bg-stone-50 px-3 py-2.5 ring-1 ring-stone-100">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-stone-800">Score rings</p>
                <p className="text-[11px] text-stone-500">
                  2 m / 5 m / 10 m from the pin ≈ 88 / 70 / 40 points
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={showScoreRings}
                onClick={() => setShowScoreRings((v) => !v)}
                className={`relative h-7 w-12 shrink-0 rounded-full transition ${
                  showScoreRings ? "bg-[#014421]" : "bg-stone-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${
                    showScoreRings ? "left-[1.35rem]" : "left-0.5"
                  }`}
                />
              </button>
            </div>

            <div className="rounded-2xl bg-stone-50 p-3 text-xs text-stone-600 ring-1 ring-stone-100">
              <p className="font-semibold text-stone-800">{SHOTS_PER_SET} random approaches</p>
              <p className="mt-1">
                Each shot gets a new distance, irregular green shape, pin and hazards. Score is out of
                100 (closer to the pin = higher). Finish the set for a handicap estimate
                {isCoach && testingFor ? ` for ${testingFor.name}` : ""}.
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
                  · GIR {lastSaved.stats.girPct}%
                  {lastSaved.stats.avgProximityM != null
                    ? ` · avg ${toDisplay(lastSaved.stats.avgProximityM)}${unitLabel}`
                    : ""}
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
                <p className="text-[10px] font-medium text-stone-500">Green</p>
                <p className="text-base font-bold tabular-nums text-stone-900">
                  {Math.round(scenario.greenRx * 2)}×{Math.round(scenario.greenRy * 2)}
                  {unitLabel}
                </p>
              </div>
              <div className="rounded-2xl bg-stone-50 p-2.5">
                <p className="text-[10px] font-medium text-stone-500">Hazards</p>
                <p className="text-base font-bold text-stone-900">
                  {scenario.hazards.filter((h) => h.kind === "bunker").length}B
                  {scenario.hazards.some((h) => h.kind === "water") ? " · H2O" : ""}
                </p>
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold text-stone-600">
                Club for this shot
              </p>
              <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                {IRON_TEST_CLUBS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setClub(c.key)}
                    aria-pressed={club === c.key}
                    className={`shrink-0 rounded-xl px-2.5 py-2 text-xs font-bold transition ${
                      club === c.key
                        ? "bg-[#014421] text-white"
                        : "bg-stone-100 text-stone-700 hover:bg-stone-200"
                    }`}
                  >
                    {c.key}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <button
                type="button"
                role="switch"
                aria-checked={aimDepthFree}
                onClick={() => setAimDepthFree((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  aimDepthFree
                    ? "bg-[#014421] text-white"
                    : "bg-stone-100 text-stone-600 ring-1 ring-stone-200"
                }`}
                title={
                  aimDepthFree
                    ? "Tap sets left/right and short/long"
                    : "Tap sets left/right only (depth locked to pin)"
                }
              >
                Short / long aim
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={showScoreRings}
                onClick={() => setShowScoreRings((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  showScoreRings
                    ? "bg-[#014421] text-white"
                    : "bg-stone-100 text-stone-600 ring-1 ring-stone-200"
                }`}
              >
                <Target className="h-3 w-3" aria-hidden />
                Score rings
              </button>
            </div>

            {showScoreRings && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-stone-900/90 px-3 py-2 text-[11px] font-semibold text-white">
                {SCORE_RINGS.map((ring, i) => {
                  const swatch =
                    i === 0 ? "bg-[#FFA500]" : i === 1 ? "bg-white" : "bg-sky-300";
                  const distLabel =
                    unit === "m"
                      ? `${ring.radiusM} m`
                      : `${Math.round(ring.radiusM * 1.09361)} yd`;
                  return (
                    <span key={ring.radiusM} className="inline-flex items-center gap-1.5">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${swatch}`} aria-hidden />
                      {distLabel}
                      <span className="font-normal text-white/70">≈ {ring.approxPoints} pts</span>
                    </span>
                  );
                })}
              </div>
            )}

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
                    ? aimDepthFree
                      ? "Aim set — hit, then enter fingers L/R"
                      : "Aim set left/right — Short / long aim unlocks depth"
                    : aimDepthFree
                      ? "Tap to set aim (any direction)"
                      : "Tap left or right of the pin"
                  : "Optional: tap left/right of pin (defaults to pin)"}
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
                  disabled={!!flight}
                  className="w-full rounded-2xl bg-[#014421] py-3.5 text-sm font-bold text-white disabled:opacity-40"
                >
                  Log shot
                </button>
              </div>
            ) : (
              <div className="space-y-2 rounded-2xl bg-stone-50 p-3 ring-1 ring-stone-100">
                <p className="text-xs text-stone-500">
                  1. Tap left/right of the pin to set aim · 2. Hit that line on the range · 3. Enter
                  fingers left or right of aim
                  {aimDepthFree ? " · Short / long aim is on" : ""}
                </p>
                <FingerMissInput
                  distanceM={mark ? dist(BALL, mark) : scenario.distanceM}
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
                  disabled={!mark || !fingerMissReady(fingerDir, fingerWidth) || !!flight}
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
                    Running · GIR {stats.gir}/{stats.shots} ·{" "}
                    {stats.avgProximityM != null
                      ? `avg ${toDisplay(stats.avgProximityM)}${unitLabel}`
                      : "no GIR yet"}
                  </span>
                  <span className="font-bold tabular-nums text-[#014421]">{stats.score}/100</span>
                </div>
                <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-stone-500">
                  {[...results].reverse().map((r, idx) => (
                    <li key={r.id} className="flex justify-between gap-2 border-b border-stone-100 py-1.5">
                      <span>
                        #{results.length - idx} · {toDisplay(r.distanceM)}
                        {unitLabel}
                        {r.club ? ` · ${r.club}` : ""} ·{" "}
                        {r.proximityM != null
                          ? `${toDisplay(r.proximityM)}${unitLabel} to pin`
                          : r.lie}
                      </span>
                      <span className="font-bold tabular-nums text-[#014421]">{r.points}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}

        {phase === "complete" && (
          <div className="space-y-3 rounded-2xl bg-[#014421]/5 p-4 ring-1 ring-[#014421]/15">
            <div className="flex items-center justify-between gap-2 text-[#014421]">
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
            <ApproachShotSimReport
              shots={results.map((s) => ({
                points: s.points,
                lie: s.lie,
                proximityM: s.proximityM,
                distanceM: s.distanceM,
                club: s.club,
              }))}
            />
            <p className="text-center text-[11px] text-stone-400">
              Saves to your profile combines · feeds the Irons practice handicap. Last 3 sets count.
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
