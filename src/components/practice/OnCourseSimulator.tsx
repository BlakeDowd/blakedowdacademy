"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Flag,
  Hand,
  Radar,
  Volume2,
  VolumeX,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { STONECUTTERS_HOLES, cameraForHole } from "@/lib/onCourseSimulator/courseData";
import {
  applyRoll,
  dist,
  dropNearHazard,
  firstWaterCrossing,
  landFromCarryOffline,
  lieAt,
  puttMakeChance,
  simulatePutt,
  sub,
} from "@/lib/onCourseSimulator/physics";
import {
  playBallHit,
  playCup,
  playRoll,
  playSand,
  playSplash,
  playSwing,
} from "@/lib/onCourseSimulator/sounds";
import {
  CLUBS,
  TERRAIN_FILL,
  TERRAIN_LABEL,
  TERRAIN_STROKE,
  type ClubId,
  type HoleData,
  type HoleRoundState,
  type LieKind,
  type PlayerMode,
  type ShotData,
  type TerrainKind,
  type Vec2,
} from "@/lib/onCourseSimulator/types";
import { trackToolUse } from "@/lib/appUsage";
import { FingerMissInput, fingerMissReady } from "@/components/practice/FingerMissInput";
import {
  offlineMetresFromFingers,
  type FingerMissDirection,
  type FingerMissWidth,
} from "@/lib/fingerMissGeometry";

type FlightAnim = {
  from: Vec2;
  to: Vec2;
  progress: number;
  done: boolean;
};

function freshHole(hole: HoleData): HoleRoundState {
  return {
    holeId: hole.id,
    ball: { ...hole.tee },
    lie: "tee",
    strokes: 0,
    shots: [],
    holed: false,
    puttRemainM: null,
  };
}

function worldToScreen(
  p: Vec2,
  hole: HoleData,
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
  hole: HoleData,
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
  hole: HoleData,
  cam: { cx: number; cy: number; scale: number },
  w: number,
  h: number,
) {
  if (pts.length < 3) return false;
  ctx.beginPath();
  const s0 = worldToScreen(pts[0]!, hole, cam, w, h);
  ctx.moveTo(s0.x, s0.y);
  for (let i = 1; i < pts.length; i++) {
    const s = worldToScreen(pts[i]!, hole, cam, w, h);
    ctx.lineTo(s.x, s.y);
  }
  ctx.closePath();
  return true;
}

function drawTerrainZone(
  ctx: CanvasRenderingContext2D,
  pts: Vec2[],
  hole: HoleData,
  cam: { cx: number; cy: number; scale: number },
  w: number,
  h: number,
  kind: TerrainKind,
) {
  if (!pathPoly(ctx, pts, hole, cam, w, h)) return;

  const xs = pts.map((p) => worldToScreen(p, hole, cam, w, h).x);
  const ys = pts.map((p) => worldToScreen(p, hole, cam, w, h).y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  if (kind === "water") {
    const g = ctx.createLinearGradient(minX, minY, maxX, maxY);
    g.addColorStop(0, "#5eb8e8");
    g.addColorStop(0.45, "#2f8fc4");
    g.addColorStop(1, "#1a6fa0");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 1;
    for (let y = minY; y < maxY; y += 7) {
      ctx.beginPath();
      ctx.moveTo(minX, y);
      ctx.quadraticCurveTo((minX + maxX) / 2, y + 3, maxX, y);
      ctx.stroke();
    }
    ctx.restore();
  } else if (kind === "green") {
    const g = ctx.createRadialGradient(
      (minX + maxX) / 2,
      (minY + maxY) / 2,
      4,
      (minX + maxX) / 2,
      (minY + maxY) / 2,
      Math.max(maxX - minX, maxY - minY) / 1.5,
    );
    g.addColorStop(0, "#a8e8a0");
    g.addColorStop(0.55, "#7ed47a");
    g.addColorStop(1, "#5cb85a");
    ctx.fillStyle = g;
    ctx.fill();
  } else if (kind === "bunker") {
    const g = ctx.createLinearGradient(minX, minY, maxX, maxY);
    g.addColorStop(0, "#ead7b0");
    g.addColorStop(1, "#c9a878");
    ctx.fillStyle = g;
    ctx.fill();
  } else if (kind === "fairway" || kind === "tee") {
    const g = ctx.createLinearGradient(minX, minY, maxX, maxY);
    g.addColorStop(0, kind === "tee" ? "#7eb868" : "#6bc86a");
    g.addColorStop(1, kind === "tee" ? "#5a9a48" : "#4aaa4a");
    ctx.fillStyle = g;
    ctx.fill();
  } else {
    ctx.fillStyle = TERRAIN_FILL[kind];
    ctx.fill();
  }

  ctx.strokeStyle = TERRAIN_STROKE[kind];
  ctx.lineWidth = kind === "green" || kind === "fairway" ? 1.25 : 0.9;
  ctx.stroke();
}

function scoreToPar(strokes: number, par: number): string {
  const d = strokes - par;
  if (d === 0) return "PAR";
  if (d === -1) return "BIRDIE";
  if (d === -2) return "EAGLE";
  if (d === 1) return "BOGEY";
  if (d === 2) return "DOUBLE";
  if (d < 0) return `${Math.abs(d)} UNDER`;
  return `+${d}`;
}

export default function OnCourseSimulator({ compact }: { compact?: boolean }) {
  const [holeIdx, setHoleIdx] = useState(0);
  const hole = STONECUTTERS_HOLES[holeIdx]!;
  const [round, setRound] = useState<HoleRoundState>(() => freshHole(STONECUTTERS_HOLES[0]!));
  const [mode, setMode] = useState<PlayerMode>("launch_monitor");
  const [club, setClub] = useState<ClubId>("driver");
  const [unit, setUnit] = useState<"m" | "yd">("m");
  const [carryIn, setCarryIn] = useState("180");
  const [offlineIn, setOfflineIn] = useState("0");
  /** Aim target (required for finger mode; optional for launch monitor). */
  const [mark, setMark] = useState<Vec2 | null>(null);
  const [fingerDir, setFingerDir] = useState<FingerMissDirection | null>(null);
  const [fingerWidth, setFingerWidth] = useState<FingerMissWidth | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [banner, setBanner] = useState<string | null>("Pick a hole and take your shot");
  const [flight, setFlight] = useState<FlightAnim | null>(null);
  const [cardTotal, setCardTotal] = useState<Record<string, number>>({});

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const camRef = useRef(cameraForHole(STONECUTTERS_HOLES[0]!, 360, 400));

  const toDisplay = (metres: number) =>
    unit === "m" ? Math.round(metres * 10) / 10 : Math.round(metres * 1.09361 * 10) / 10;
  const fromDisplay = (v: number) => (unit === "m" ? v : v / 1.09361);
  const unitLabel = unit === "m" ? "m" : "yd";

  const toPin = dist(round.ball, hole.pin);

  const fingerCarryM = useMemo(() => {
    const n = Number(carryIn);
    if (Number.isFinite(n) && n > 0) return fromDisplay(n);
    return toPin;
  }, [carryIn, toPin, unit]);

  useEffect(() => {
    setRound(freshHole(hole));
    setMark(null);
    setFingerDir(null);
    setFingerWidth(null);
    setFlight(null);
    setBanner(`Hole ${hole.number} · Par ${hole.par} · ${hole.yardageM}m`);
    const wrap = wrapRef.current;
    const w = wrap?.clientWidth || 360;
    const h = Math.max(compact ? 280 : 360, Math.min(520, w * 0.95));
    camRef.current = cameraForHole(hole, w, h);
    if (hole.par === 3) setClub("7i");
    else setClub("driver");
  }, [hole, compact]);

  useEffect(() => {
    if (round.lie === "green" && !round.holed) {
      setClub("putter");
      setRound((r) => ({ ...r, puttRemainM: dist(r.ball, hole.pin) }));
    }
  }, [round.lie, round.holed, hole.pin, round.ball.x, round.ball.y]);

  const sfx = useCallback(
    (fn: () => void) => {
      if (soundOn) fn();
    },
    [soundOn],
  );

  const finishShot = useCallback(
    (partial: {
      club: ClubId;
      from: Vec2;
      carryLand: Vec2;
      rest: Vec2;
      lie: LieKind;
      carryM: number;
      offlineM: number;
      strokesAdded: number;
      note?: string;
    }) => {
      const shot: ShotData = {
        id: `${Date.now()}`,
        club: partial.club,
        from: partial.from,
        to: partial.rest,
        carryLand: partial.carryLand,
        carryM: partial.carryM,
        offlineM: partial.offlineM,
        lieAfter: partial.lie,
        strokesAdded: partial.strokesAdded,
        note: partial.note,
      };

      setFlight({ from: partial.from, to: partial.carryLand, progress: 0, done: false });
      sfx(playSwing);
      sfx(playBallHit);

      window.setTimeout(() => {
        if (partial.lie === "water") sfx(playSplash);
        else if (partial.lie === "bunker") sfx(playSand);
        else sfx(playRoll);
      }, 450);

      setRound((r) => {
        const strokes = r.strokes + partial.strokesAdded;
        const holed = partial.lie === "green" && dist(partial.rest, hole.pin) < 0.35;
        if (holed) {
          sfx(playCup);
          setBanner(`Holed — ${scoreToPar(strokes, hole.par)} · ${strokes} strokes`);
          setCardTotal((c) => ({ ...c, [hole.id]: strokes }));
        } else if (partial.lie === "water") {
          setBanner(`Water hazard · +1 penalty · drop near entry`);
        } else if (partial.lie === "bunker") {
          setBanner(`In the bunker`);
        } else {
          const rem = dist(partial.rest, hole.pin);
          setBanner(
            `Shot ${r.shots.length + 1} · ${toDisplay(rem)}${unitLabel} to pin · ${TERRAIN_LABEL[partial.lie]}`,
          );
        }
        return {
          ...r,
          ball: holed ? { ...hole.pin } : partial.rest,
          lie: holed ? "green" : partial.lie === "water" ? lieAt(hole, partial.rest) : partial.lie,
          strokes,
          shots: [...r.shots, shot],
          holed,
          puttRemainM: partial.lie === "green" && !holed ? dist(partial.rest, hole.pin) : null,
        };
      });
    },
    [hole, sfx, toDisplay, unitLabel],
  );

  const resolveLanding = useCallback(
    (from: Vec2, carryLand: Vec2, usedClub: ClubId, offlineM: number) => {
      const waterHit = firstWaterCrossing(hole, from, carryLand);
      if (waterHit) {
        const drop = dropNearHazard(from, waterHit);
        finishShot({
          club: usedClub,
          from,
          carryLand: waterHit,
          rest: drop,
          lie: "water",
          carryM: dist(from, waterHit),
          offlineM,
          strokesAdded: 2,
          note: "Hazard penalty",
        });
        return;
      }
      const dir = sub(carryLand, from);
      const { rest, lie } = applyRoll(hole, carryLand, dir, usedClub);
      finishShot({
        club: usedClub,
        from,
        carryLand,
        rest,
        lie,
        carryM: dist(from, carryLand),
        offlineM,
        strokesAdded: 1,
      });
    },
    [finishShot, hole],
  );

  const fireLaunchMonitor = () => {
    if (round.holed || flight) return;
    trackToolUse("on-course-sim");
    const carryDisp = Number(carryIn);
    const offlineDisp = Number(offlineIn);
    if (!Number.isFinite(carryDisp) || carryDisp <= 0) return;
    const carryM = fromDisplay(carryDisp);
    const offlineM = fromDisplay(offlineDisp);
    const aimPt = mark ?? hole.pin;
    const land = landFromCarryOffline(round.ball, sub(aimPt, round.ball), carryM, offlineM);
    resolveLanding(round.ball, land, club, offlineM);
    setMark(null);
  };

  /** Log finger dispersion: aim first, then carry + fingers L/R of that line. */
  const confirmFingerMiss = () => {
    if (round.holed || flight || !mark) return;
    if (!fingerMissReady(fingerDir, fingerWidth) || !fingerDir) return;
    const carryDisp = Number(carryIn);
    if (!Number.isFinite(carryDisp) || carryDisp <= 0) return;
    trackToolUse("on-course-sim");
    const carryM = fromDisplay(carryDisp);
    const fingers = fingerDir === "straight" ? 0 : fingerWidth!;
    const offlineM = offlineMetresFromFingers(carryM, fingerDir, fingers);
    const land = landFromCarryOffline(round.ball, sub(mark, round.ball), carryM, offlineM);
    resolveLanding(round.ball, land, club, offlineM);
    setMark(null);
    setFingerDir(null);
    setFingerWidth(null);
  };

  const firePutt = () => {
    if (round.holed || round.lie !== "green") return;
    trackToolUse("on-course-sim");
    sfx(playSwing);
    const result = simulatePutt(round.ball, hole.pin);
    setRound((r) => {
      const strokes = r.strokes + result.strokes;
      if (result.holed) {
        sfx(playCup);
        setBanner(`Holed — ${scoreToPar(strokes, hole.par)}`);
        setCardTotal((c) => ({ ...c, [hole.id]: strokes }));
        return {
          ...r,
          ball: { ...hole.pin },
          strokes,
          holed: true,
          puttRemainM: null,
          shots: [
            ...r.shots,
            {
              id: `${Date.now()}`,
              club: "putter",
              from: r.ball,
              to: hole.pin,
              carryLand: hole.pin,
              carryM: dist(r.ball, hole.pin),
              offlineM: 0,
              lieAfter: "green",
              strokesAdded: 1,
              note: "Putt holed",
            },
          ],
        };
      }
      const rem = dist(result.rest, hole.pin);
      setBanner(`Missed · ${toDisplay(rem)}${unitLabel} left · ~${Math.round(puttMakeChance(rem) * 100)}% next`);
      return {
        ...r,
        ball: result.rest,
        strokes,
        puttRemainM: rem,
        shots: [
          ...r.shots,
          {
            id: `${Date.now()}`,
            club: "putter",
            from: r.ball,
            to: result.rest,
            carryLand: result.rest,
            carryM: dist(r.ball, result.rest),
            offlineM: 0,
            lieAfter: "green",
            strokesAdded: 1,
          },
        ],
      };
    });
  };

  // Flight animation + render loop
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setFlight((f) => {
        if (!f || f.done) return f;
        const next = f.progress + 0.04;
        if (next >= 1) return { ...f, progress: 1, done: true };
        return { ...f, progress: next };
      });
      raf = requestAnimationFrame(tick);
    };
    if (flight && !flight.done) raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [flight?.done, !!flight]);

  useEffect(() => {
    if (flight?.done) {
      const t = window.setTimeout(() => setFlight(null), 200);
      return () => clearTimeout(t);
    }
  }, [flight?.done]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    let raf = 0;
    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = wrap.clientWidth;
      const h = Math.max(compact ? 280 : 360, Math.min(520, wrap.clientWidth * 0.95));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Keep full hole in view
      camRef.current = cameraForHole(hole, w, h);
      const cam = camRef.current;

      // Soft sky → grass ground
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "#87b8d8");
      sky.addColorStop(0.35, "#c5dcc0");
      sky.addColorStop(1, "#6a9a58");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      // Ambient ground plate inside bounds
      const bMin = worldToScreen({ x: hole.bounds.minX, y: hole.bounds.maxY }, hole, cam, w, h);
      const bMax = worldToScreen({ x: hole.bounds.maxX, y: hole.bounds.minY }, hole, cam, w, h);
      ctx.fillStyle = "#4a7a3c";
      ctx.fillRect(bMin.x, bMin.y, bMax.x - bMin.x, bMax.y - bMin.y);

      const order = ["heavy", "rough", "fairway", "tee", "bunker", "water", "green"] as const;
      for (const kind of order) {
        for (const z of hole.zones) {
          if (z.kind !== kind) continue;
          drawTerrainZone(ctx, z.polygon, hole, cam, w, h, kind);
        }
      }

      // Soft vignette
      const vig = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.85);
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(1, "rgba(20,40,20,0.22)");
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);

      // Pin + flag with shadow
      const pinS = worldToScreen(hole.pin, hole, cam, w, h);
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.beginPath();
      ctx.ellipse(pinS.x + 1, pinS.y + 2, 5, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#e8eef2";
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(pinS.x, pinS.y);
      ctx.lineTo(pinS.x, pinS.y - 22);
      ctx.stroke();
      const flag = ctx.createLinearGradient(pinS.x, pinS.y - 22, pinS.x + 14, pinS.y - 10);
      flag.addColorStop(0, "#ff5a5a");
      flag.addColorStop(1, "#c62828");
      ctx.fillStyle = flag;
      ctx.beginPath();
      ctx.moveTo(pinS.x, pinS.y - 22);
      ctx.lineTo(pinS.x + 14, pinS.y - 16);
      ctx.lineTo(pinS.x, pinS.y - 10);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#1a1a1a";
      ctx.beginPath();
      ctx.arc(pinS.x, pinS.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Aim line + finger miss preview (relative to chosen aim)
      if (!round.holed && (mode === "launch_monitor" || mark)) {
        const target = mark ?? hole.pin;
        const b = worldToScreen(round.ball, hole, cam, w, h);
        const t = worldToScreen(target, hole, cam, w, h);
        ctx.strokeStyle =
          mode === "finger_dispersion" ? "rgba(1, 68, 33, 0.7)" : "rgba(1, 68, 33, 0.55)";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 6]);
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
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
        !round.holed &&
        mark &&
        fingerDir &&
        (fingerDir === "straight" || fingerWidth != null) &&
        fingerCarryM > 0
      ) {
        const fingers = fingerDir === "straight" ? 0 : fingerWidth!;
        const offlineM = offlineMetresFromFingers(fingerCarryM, fingerDir, fingers);
        const land = landFromCarryOffline(
          round.ball,
          sub(mark, round.ball),
          fingerCarryM,
          offlineM,
        );
        const a = worldToScreen(land, hole, cam, w, h);
        const b = worldToScreen(round.ball, hole, cam, w, h);
        ctx.strokeStyle = "rgba(255, 170, 40, 0.85)";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(a.x, a.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(255, 170, 40, 0.2)";
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

      // Flight tracer with glow
      if (flight) {
        const b = worldToScreen(flight.from, hole, cam, w, h);
        const e = worldToScreen(flight.to, hole, cam, w, h);
        const mx = (b.x + e.x) / 2;
        const my = Math.min(b.y, e.y) - 48 * Math.sin(flight.progress * Math.PI);
        const steps = 24;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        for (let i = 1; i <= steps; i++) {
          const t = (i / steps) * flight.progress;
          const x = (1 - t) * (1 - t) * b.x + 2 * (1 - t) * t * mx + t * t * e.x;
          const y = (1 - t) * (1 - t) * b.y + 2 * (1 - t) * t * my + t * t * e.y;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        for (let i = 1; i <= steps; i++) {
          const t = (i / steps) * flight.progress;
          const x = (1 - t) * (1 - t) * b.x + 2 * (1 - t) * t * mx + t * t * e.x;
          const y = (1 - t) * (1 - t) * b.y + 2 * (1 - t) * t * my + t * t * e.y;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
        const t = flight.progress;
        const bx = (1 - t) * (1 - t) * b.x + 2 * (1 - t) * t * mx + t * t * e.x;
        const by = (1 - t) * (1 - t) * b.y + 2 * (1 - t) * t * my + t * t * e.y;
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.beginPath();
        ctx.arc(bx, by, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(bx, by, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Ball
      const ballS = worldToScreen(round.ball, hole, cam, w, h);
      const ballR = 5.5;
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.beginPath();
      ctx.ellipse(ballS.x + 2, ballS.y + 3.5, ballR + 1.5, ballR * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      const ballGrad = ctx.createRadialGradient(ballS.x - 1.5, ballS.y - 1.5, 0.5, ballS.x, ballS.y, ballR);
      ballGrad.addColorStop(0, "#ffffff");
      ballGrad.addColorStop(0.7, "#f0f4f8");
      ballGrad.addColorStop(1, "#c8d0d8");
      ctx.fillStyle = ballGrad;
      ctx.beginPath();
      ctx.arc(ballS.x, ballS.y, ballR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(1, 68, 33, 0.65)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.strokeStyle = "rgba(1, 68, 33, 0.35)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(ballS.x, ballS.y, ballR + 6, 0, Math.PI * 2);
      ctx.stroke();

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [hole, round.ball, round.holed, mark, mode, flight, compact, fingerDir, fingerWidth, fingerCarryM]);

  const onPointer = (e: React.PointerEvent<HTMLCanvasElement>, down?: boolean) => {
    if (round.holed) return;
    if (!down) return;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const rect = canvas.getBoundingClientRect();
    const sp = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setMark(screenToWorld(sp, hole, camRef.current, rect.width, rect.height));
  };

  const holeSelect = (dir: -1 | 1) => {
    setHoleIdx((i) => (i + dir + STONECUTTERS_HOLES.length) % STONECUTTERS_HOLES.length);
  };

  const cardScore = useMemo(() => {
    const vals = Object.values(cardTotal);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0);
  }, [cardTotal]);

  return (
    <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white text-stone-900 shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 bg-gradient-to-r from-[#014421] to-[#0b6634] px-3 py-2.5 text-white">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-bold tracking-tight">
            Stonecutters Ridge
            <span className="rounded-full bg-[#FFA500] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#3d2600]">
              Beta
            </span>
          </p>
          <p className="text-[11px] text-white/75">On-course simulator</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => holeSelect(-1)}
            className="rounded-full bg-white/10 p-1.5 hover:bg-white/20"
            aria-label="Previous hole"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[6.5rem] text-center text-xs font-semibold tabular-nums">
            Hole {hole.number} · Par {hole.par}
          </span>
          <button
            type="button"
            onClick={() => holeSelect(1)}
            className="rounded-full bg-white/10 p-1.5 hover:bg-white/20"
            aria-label="Next hole"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSoundOn((s) => !s)}
            className="rounded-full bg-white/10 p-1.5 hover:bg-white/20"
            aria-label={soundOn ? "Mute sounds" : "Unmute"}
          >
            {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => {
              setRound(freshHole(hole));
              setMark(null);
              setFingerDir(null);
              setFingerWidth(null);
              setFlight(null);
              setBanner(`Hole ${hole.number} restarted`);
            }}
            className="rounded-full bg-white/10 p-1.5 hover:bg-white/20"
            aria-label="Restart hole"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {banner && (
        <div className="bg-stone-50 px-3 py-2 text-center text-xs font-medium text-stone-700">{banner}</div>
      )}

      <div className="space-y-3 p-3">
        <p className="text-xs leading-relaxed text-stone-500">{hole.description}</p>

        <div className="flex rounded-full bg-stone-100 p-0.5" role="radiogroup" aria-label="Play mode">
          {(
            [
              { id: "launch_monitor" as const, label: "Launch monitor", icon: Radar },
              { id: "finger_dispersion" as const, label: "Finger dispersion", icon: Hand },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={mode === m.id}
              onClick={() => {
                setMode(m.id);
                setMark(null);
                setFingerDir(null);
                setFingerWidth(null);
              }}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-2 text-xs font-semibold transition ${
                mode === m.id ? "bg-[#014421] text-white shadow-sm" : "text-stone-600 hover:text-stone-900"
              }`}
            >
              <m.icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-stone-500">
          {mode === "finger_dispersion"
            ? "Tap to set aim, hit that line on the range, then enter carry and fingers left or right of aim."
            : "Hit your real shot, then enter carry and offline from the launch monitor."}
        </p>

        <div
          ref={wrapRef}
          className="relative overflow-hidden rounded-2xl shadow-inner ring-1 ring-stone-200/80"
        >
          <canvas
            ref={canvasRef}
            className="block w-full touch-none"
            onPointerDown={(e) => {
              (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
              onPointer(e, true);
            }}
          />
          <div className="pointer-events-none absolute left-2 top-2 max-w-[80%] rounded-2xl bg-white/95 px-2.5 py-1.5 text-[11px] font-semibold text-stone-800 shadow-sm backdrop-blur">
            {round.holed ? (
              <span>Complete</span>
            ) : mode === "finger_dispersion" && !mark ? (
              <span>Tap the map to set your aim</span>
            ) : (
              <span>
                Shot {round.shots.length + 1} · {toDisplay(toPin)}
                {unitLabel} · {TERRAIN_LABEL[round.lie]}
                {mode === "finger_dispersion" && mark ? " · Aim set" : ""}
              </span>
            )}
          </div>
          <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-[#014421] shadow-sm backdrop-blur">
            <Flag className="h-3 w-3" aria-hidden />
            {round.strokes} stroke{round.strokes === 1 ? "" : "s"}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
          <label className="flex min-w-0 flex-1 items-center gap-2 text-xs font-medium text-stone-600">
            Club
            <select
              value={club}
              onChange={(e) => setClub(e.target.value as ClubId)}
              disabled={round.lie === "green" && !round.holed}
              className="min-w-0 flex-1 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-semibold text-stone-900 outline-none focus:border-[#014421]"
            >
              {CLUBS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {round.lie === "green" && !round.holed ? (
          <div className="space-y-2 rounded-2xl bg-emerald-50 p-3 ring-1 ring-emerald-100">
            <p className="text-sm font-medium text-emerald-900">
              On the green · {toDisplay(round.puttRemainM ?? toPin)}
              {unitLabel} · ~{Math.round(puttMakeChance(round.puttRemainM ?? toPin) * 100)}% make
            </p>
            <button
              type="button"
              onClick={firePutt}
              className="w-full rounded-2xl bg-[#014421] py-3 text-sm font-bold text-white hover:bg-[#01351a]"
            >
              Putt
            </button>
          </div>
        ) : round.holed ? (
          <div className="space-y-2 rounded-2xl bg-amber-50 p-4 text-center ring-1 ring-amber-100">
            <p className="text-lg font-bold text-[#014421]">{scoreToPar(round.strokes, hole.par)}</p>
            <p className="text-xs text-stone-600">
              Card:{" "}
              {STONECUTTERS_HOLES.map((h) => (
                <span key={h.id} className="mr-2">
                  H{h.number}:{cardTotal[h.id] ?? "–"}
                </span>
              ))}
              {cardScore != null && <span className="font-semibold text-[#014421]">Total {cardScore}</span>}
            </p>
            <button
              type="button"
              onClick={() => holeSelect(1)}
              className="w-full rounded-2xl bg-[#014421] py-3 text-sm font-bold text-white"
            >
              Next hole
            </button>
          </div>
        ) : mode === "launch_monitor" ? (
          <div className="space-y-2 rounded-2xl bg-stone-50 p-3 ring-1 ring-stone-100">
            <p className="text-xs text-stone-500">
              Hit your real shot, then enter carry and offline from the launch monitor
            </p>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs font-semibold text-stone-700">
                Carry ({unitLabel})
                <input
                  type="number"
                  inputMode="decimal"
                  value={carryIn}
                  onChange={(e) => setCarryIn(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-lg font-bold tabular-nums text-stone-900 outline-none focus:border-[#014421]"
                />
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {[120, 150, 180, 210, 240].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setCarryIn(String(unit === "m" ? n : Math.round(n * 1.09361)))}
                      className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-stone-700 ring-1 ring-stone-200"
                    >
                      {unit === "m" ? n : Math.round(n * 1.09361)}
                    </button>
                  ))}
                </div>
              </label>
              <label className="block text-xs font-semibold text-stone-700">
                Offline L− / R+ ({unitLabel})
                <input
                  type="number"
                  inputMode="decimal"
                  value={offlineIn}
                  onChange={(e) => setOfflineIn(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-lg font-bold tabular-nums text-stone-900 outline-none focus:border-[#FFA500]"
                />
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {[-15, -5, 0, 5, 15].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setOfflineIn(String(unit === "m" ? n : Math.round(n * 1.09361)))}
                      className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-stone-700 ring-1 ring-stone-200"
                    >
                      {n > 0
                        ? `+${unit === "m" ? n : Math.round(n * 1.09361)}`
                        : unit === "m"
                          ? n
                          : Math.round(n * 1.09361)}
                    </button>
                  ))}
                </div>
              </label>
            </div>
            <p className="text-[11px] text-stone-400">Optional: tap the map to set aim line (defaults to pin).</p>
            <button
              type="button"
              onClick={fireLaunchMonitor}
              disabled={!!flight}
              className="w-full rounded-2xl bg-[#014421] py-3.5 text-sm font-bold text-white disabled:opacity-40"
            >
              Log shot
            </button>
          </div>
        ) : (
          <div className="space-y-2 rounded-2xl bg-stone-50 p-3 ring-1 ring-stone-100">
            <p className="text-xs text-stone-500">
              1. Tap the map to set aim · 2. Hit that line on the range · 3. Enter carry and fingers
              left or right of aim
            </p>
            <label className="block text-xs font-semibold text-stone-700">
              Carry ({unitLabel})
              <input
                type="number"
                inputMode="decimal"
                value={carryIn}
                onChange={(e) => setCarryIn(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-lg font-bold tabular-nums text-stone-900 outline-none focus:border-[#014421]"
              />
            </label>
            <FingerMissInput
              distanceM={fingerCarryM}
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
              disabled={
                !mark ||
                !fingerMissReady(fingerDir, fingerWidth) ||
                !!flight ||
                !(Number(carryIn) > 0)
              }
              className="w-full rounded-2xl bg-[#FFA500] py-3.5 text-sm font-bold text-[#3d2600] disabled:opacity-40"
            >
              {!mark
                ? "Set aim first"
                : fingerMissReady(fingerDir, fingerWidth) && Number(carryIn) > 0
                  ? "Log shot"
                  : "Enter carry & finger miss"}
            </button>
          </div>
        )}

        {round.shots.length > 0 && (
          <ul className="max-h-28 space-y-1 overflow-y-auto text-xs text-stone-500">
            {round.shots.map((s, i) => (
              <li key={s.id} className="flex justify-between gap-2 border-b border-stone-100 py-1.5">
                <span>
                  #{i + 1} {CLUBS.find((c) => c.id === s.club)?.label} · {toDisplay(s.carryM)}
                  {unitLabel}
                  {s.note ? ` · ${s.note}` : ""}
                </span>
                <span className="font-medium text-[#014421]">{TERRAIN_LABEL[s.lieAfter]}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
