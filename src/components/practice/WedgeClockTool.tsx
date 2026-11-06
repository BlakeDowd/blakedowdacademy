"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Film, Loader2, RotateCcw, Save, Square, Trash2, Upload } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { trackToolUse } from "@/lib/appUsage";
import { getPoseLandmarker } from "@/lib/poseLandmarker";
import {
  WEDGE_CLOCK_CLUBS,
  WEDGE_CLOCK_TARGETS,
  describeDelta,
  leadArmPoints,
  measureLeadArmDegrees,
  snapClockLabel,
  type Handedness,
} from "@/lib/wedgeClock";
import {
  deleteWedgeClockLog,
  fetchWedgeClockLogs,
  formatDistanceDelta,
  insertWedgeClockLog,
  loadDistanceUnit,
  saveDistanceUnit,
  type DistanceUnit,
  type WedgeClockLogEntry,
} from "@/lib/wedgeClockLog";

type Mode = "idle" | "camera" | "video";

type LiveReading = {
  degrees: number;
  label: string;
  peakDegrees: number;
  peakLabel: string;
};

function parseDistText(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

export default function WedgeClockTool({ compact }: { compact?: boolean }) {
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const peakRef = useRef(0);
  const armedRef = useRef(false);
  const runningRef = useRef(false);
  const lockedRef = useRef(false);

  const [mode, setMode] = useState<Mode>("idle");
  const [modelReady, setModelReady] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [loadingModel, setLoadingModel] = useState(false);
  const [handedness, setHandedness] = useState<Handedness>("right");
  const [club, setClub] = useState<string>("PW");
  const [targetClock, setTargetClock] = useState<string>("9:00");
  const [unit, setUnit] = useState<DistanceUnit>("m");
  const [goalText, setGoalText] = useState("");
  const [carryText, setCarryText] = useState("");
  const [live, setLive] = useState<LiveReading | null>(null);
  const [locked, setLocked] = useState<{ degrees: number; label: string } | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<WedgeClockLogEntry[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>(
    "Log radar carry anytime. Optional camera measures clock length — nothing uploads.",
  );

  useEffect(() => {
    setUnit(loadDistanceUnit());
  }, []);

  const setUnitPersist = (next: DistanceUnit) => {
    setUnit(next);
    saveDistanceUnit(next);
  };

  const stopLoop = useCallback(() => {
    runningRef.current = false;
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const stopCamera = useCallback(() => {
    stopLoop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const v = videoRef.current;
    if (v) {
      v.srcObject = null;
      v.removeAttribute("src");
    }
  }, [stopLoop]);

  const clearObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const resetSession = useCallback(() => {
    stopCamera();
    clearObjectUrl();
    setMode("idle");
    setLive(null);
    setLocked(null);
    lockedRef.current = false;
    peakRef.current = 0;
    armedRef.current = false;
    lastVideoTimeRef.current = -1;
    setStatus("Log radar carry anytime. Optional camera measures clock length — nothing uploads.");
  }, [clearObjectUrl, stopCamera]);

  useEffect(() => () => resetSession(), [resetSession]);

  const loadHistory = useCallback(async () => {
    if (!user?.id) {
      setHistory([]);
      return;
    }
    const res = await fetchWedgeClockLogs(createClient(), { userId: user.id, limit: 16 });
    setHistory(res.rows);
    setHistoryError(res.error);
  }, [user?.id]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const ensureModel = useCallback(async () => {
    if (modelReady) return true;
    setLoadingModel(true);
    setModelError(null);
    try {
      await getPoseLandmarker();
      setModelReady(true);
      setLoadingModel(false);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't load pose model.";
      setModelError(msg);
      setLoadingModel(false);
      return false;
    }
  }, [modelReady]);

  const drawOverlay = useCallback(
    (
      landmarks: Array<{ x: number; y: number; visibility?: number }> | undefined,
      degrees: number | null,
    ) => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;
      const w = video.videoWidth || 0;
      const h = video.videoHeight || 0;
      if (!w || !h) return;
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      if (!landmarks) return;

      const pts = leadArmPoints(landmarks, handedness);
      if (!pts) return;

      const sx = pts.shoulder.x * w;
      const sy = pts.shoulder.y * h;
      const ex = pts.elbow.x * w;
      const ey = pts.elbow.y * h;
      const wx = pts.wrist.x * w;
      const wy = pts.wrist.y * h;

      const r = Math.min(w, h) * 0.18;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(sx, sy - r);
      ctx.lineTo(sx, sy + r);
      ctx.moveTo(sx - r, sy);
      ctx.lineTo(sx + r * 0.15, sy);
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.lineTo(wx, wy);
      ctx.strokeStyle = "#7CFFB2";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();

      for (const [x, y] of [
        [sx, sy],
        [ex, ey],
        [wx, wy],
      ] as const) {
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fillStyle = "#014421";
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      if (degrees != null) {
        const label = snapClockLabel(degrees);
        ctx.font = "bold 28px system-ui, sans-serif";
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(12, 12, 140, 44);
        ctx.fillStyle = "#fff";
        ctx.fillText(label, 24, 44);
      }
    },
    [handedness],
  );

  const processFrame = useCallback(async () => {
    if (!runningRef.current) return;
    const video = videoRef.current;
    if (!video || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(() => void processFrame());
      return;
    }

    if (video.currentTime === lastVideoTimeRef.current && mode === "camera") {
      rafRef.current = requestAnimationFrame(() => void processFrame());
      return;
    }
    lastVideoTimeRef.current = video.currentTime;

    try {
      const landmarker = await getPoseLandmarker();
      const result = landmarker.detectForVideo(video, performance.now());
      const landmarks = result.landmarks?.[0];
      const degrees = landmarks ? measureLeadArmDegrees(landmarks, handedness) : null;
      drawOverlay(landmarks, degrees);

      if (degrees != null) {
        if (!armedRef.current && degrees > 25) armedRef.current = true;
        if (armedRef.current && degrees > peakRef.current) {
          peakRef.current = degrees;
        }
        if (
          armedRef.current &&
          peakRef.current >= 40 &&
          degrees < peakRef.current - 25 &&
          !lockedRef.current
        ) {
          const peak = peakRef.current;
          lockedRef.current = true;
          setLocked({ degrees: peak, label: snapClockLabel(peak) });
          setStatus("Clock locked — enter radar carry below and save. Video was not uploaded.");
          trackToolUse("wedge-clock");
        }

        setLive({
          degrees,
          label: snapClockLabel(degrees),
          peakDegrees: peakRef.current,
          peakLabel: snapClockLabel(peakRef.current || degrees),
        });
      }
    } catch {
      /* frame skip */
    }

    if (mode === "video" && video.ended) {
      if (peakRef.current >= 30 && !lockedRef.current) {
        const peak = peakRef.current;
        lockedRef.current = true;
        setLocked({ degrees: peak, label: snapClockLabel(peak) });
        setStatus("Clock locked from video — add radar carry if you have it. Nothing uploaded.");
        trackToolUse("wedge-clock");
      }
      stopLoop();
      return;
    }

    rafRef.current = requestAnimationFrame(() => void processFrame());
  }, [drawOverlay, handedness, mode, stopLoop]);

  const startLoop = useCallback(() => {
    stopLoop();
    runningRef.current = true;
    peakRef.current = 0;
    armedRef.current = false;
    lockedRef.current = false;
    lastVideoTimeRef.current = -1;
    setLocked(null);
    setLive(null);
    setSaveMsg(null);
    rafRef.current = requestAnimationFrame(() => void processFrame());
  }, [processFrame, stopLoop]);

  const startCamera = async () => {
    const ok = await ensureModel();
    if (!ok) return;
    stopCamera();
    clearObjectUrl();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (!v) return;
      v.srcObject = stream;
      v.muted = true;
      v.playsInline = true;
      await v.play();
      setMode("camera");
      setStatus("Side-on view · swing when ready — peak backswing locks automatically.");
      startLoop();
      trackToolUse("wedge-clock");
    } catch {
      setModelError("Camera permission blocked. Allow camera, or analyse a video from your phone.");
    }
  };

  const onPickVideo = async (file: File | null) => {
    if (!file) return;
    const ok = await ensureModel();
    if (!ok) return;
    stopCamera();
    clearObjectUrl();
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    const v = videoRef.current;
    if (!v) return;
    v.srcObject = null;
    v.src = url;
    v.muted = true;
    v.playsInline = true;
    await new Promise<void>((resolve) => {
      v.onloadeddata = () => resolve();
    });
    await v.play();
    setMode("video");
    setStatus("Playing locally — measuring lead arm. Video never leaves this device.");
    startLoop();
    trackToolUse("wedge-clock");
  };

  const lockPeakNow = () => {
    const peak = peakRef.current || live?.degrees;
    if (peak == null || peak < 20) {
      setStatus("No clear backswing yet — take a swing or scrub a side-on clip.");
      return;
    }
    lockedRef.current = true;
    setLocked({ degrees: peak, label: snapClockLabel(peak) });
    setStatus("Clock locked — enter radar carry below and save.");
    trackToolUse("wedge-clock");
  };

  const clearLockedClock = () => {
    lockedRef.current = false;
    setLocked(null);
  };

  const saveShot = async () => {
    if (!user?.id) {
      setSaveMsg("Sign in to save shots.");
      return;
    }
    const goalRaw = parseDistText(goalText);
    const carryRaw = parseDistText(carryText);
    if (goalText.trim() && Number.isNaN(goalRaw as number)) {
      setSaveMsg("Goal distance must be a number.");
      return;
    }
    if (carryText.trim() && Number.isNaN(carryRaw as number)) {
      setSaveMsg("Carry distance must be a number.");
      return;
    }

    setSaving(true);
    setSaveMsg(null);
    const res = await insertWedgeClockLog(createClient(), {
      userId: user.id,
      club,
      measuredClock: locked?.label ?? null,
      measuredDegrees: locked?.degrees ?? null,
      targetClock: locked ? targetClock : null,
      goalDistance: goalRaw,
      carryDistance: carryRaw,
      distanceUnit: unit,
      note: note.trim() || null,
      handedness,
    });
    setSaving(false);
    if (res.error) {
      setSaveMsg(res.error);
      return;
    }
    setSaveMsg("Saved (numbers only — no video).");
    setCarryText("");
    setNote("");
    clearLockedClock();
    peakRef.current = 0;
    armedRef.current = false;
    trackToolUse("wedge-clock");
    void loadHistory();
  };

  const removeEntry = async (id: string) => {
    const res = await deleteWedgeClockLog(createClient(), id);
    if (res.error) {
      setHistoryError(res.error);
      return;
    }
    setHistory((rows) => rows.filter((r) => r.id !== id));
  };

  const displayLabel = locked?.label ?? live?.peakLabel ?? live?.label ?? "—";
  const displayDegrees = locked?.degrees ?? live?.peakDegrees ?? live?.degrees;
  const clockDelta = locked
    ? describeDelta(locked.label, targetClock)
    : live?.peakLabel
      ? describeDelta(live.peakLabel, targetClock)
      : null;

  const goalPreview = parseDistText(goalText);
  const carryPreview = parseDistText(carryText);
  const distPreview =
    goalPreview != null &&
    carryPreview != null &&
    !Number.isNaN(goalPreview) &&
    !Number.isNaN(carryPreview)
      ? formatDistanceDelta(goalPreview, carryPreview, unit)
      : null;

  const canSave = Boolean(locked || carryText.trim());

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <div className="rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-100">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-stone-900">Wedge Clock</p>
            <p className="mt-1 text-xs text-stone-500">
              Radar-friendly: club, goal, and carry. Optional on-device clock — no swing upload.
            </p>
          </div>
          <div className="flex shrink-0 rounded-full bg-stone-200/80 p-0.5" role="radiogroup" aria-label="Distance unit">
            {(
              [
                { id: "m" as const, label: "m" },
                { id: "yd" as const, label: "yd" },
              ] as const
            ).map((u) => (
              <button
                key={u.id}
                type="button"
                role="radio"
                aria-checked={unit === u.id}
                onClick={() => setUnitPersist(u.id)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                  unit === u.id ? "bg-[#014421] text-white" : "text-stone-600 hover:text-stone-900"
                }`}
              >
                {u.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="block text-xs font-medium text-stone-600">
            Club
            <select
              value={club}
              onChange={(e) => setClub(e.target.value)}
              className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900"
            >
              {WEDGE_CLOCK_CLUBS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-stone-600">
            Handedness
            <select
              value={handedness}
              onChange={(e) => setHandedness(e.target.value as Handedness)}
              className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900"
            >
              <option value="right">Right-handed</option>
              <option value="left">Left-handed</option>
            </select>
          </label>
          <label className="block text-xs font-medium text-stone-600">
            Goal ({unit})
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={400}
              step={1}
              value={goalText}
              onChange={(e) => setGoalText(e.target.value)}
              placeholder={unit === "yd" ? "e.g. 70" : "e.g. 60"}
              className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900"
            />
          </label>
          <label className="block text-xs font-medium text-stone-600">
            Carry ({unit})
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={400}
              step={0.1}
              value={carryText}
              onChange={(e) => setCarryText(e.target.value)}
              placeholder="From radar"
              className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-900"
            />
          </label>
          <label className="col-span-2 block text-xs font-medium text-stone-600">
            Target clock (if measuring)
            <select
              value={targetClock}
              onChange={(e) => setTargetClock(e.target.value)}
              className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900"
            >
              {WEDGE_CLOCK_TARGETS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>

        {distPreview && (
          <p className="mt-2 text-xs font-semibold text-[#014421]">
            vs goal: {distPreview}
            {locked ? ` · clock ${locked.label}` : ""}
          </p>
        )}

        <label className="mt-3 block text-xs font-medium text-stone-600">
          Note (optional)
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder="e.g. stock mid-height"
            className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900"
          />
        </label>

        <button
          type="button"
          onClick={() => void saveShot()}
          disabled={saving || !user?.id || !canSave}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#014421] py-3 text-sm font-bold text-white disabled:opacity-60"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Save className="h-4 w-4" aria-hidden />
          )}
          Save shot
          {locked ? ` · ${locked.label}` : ""}
        </button>
        {!user?.id && (
          <p className="mt-2 text-xs text-amber-700">Sign in to save shots across sessions.</p>
        )}
        {!canSave && user?.id && (
          <p className="mt-2 text-xs text-stone-500">Enter carry, or lock a clock reading, then save.</p>
        )}
        {saveMsg && <p className="mt-2 text-xs text-stone-600">{saveMsg}</p>}
      </div>

      <div className="rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-100">
        <p className="text-sm font-semibold text-stone-900">Optional · measure clock</p>
        <p className="mt-1 text-xs text-stone-500">
          Side-on camera or a local video. Pose stays on this phone.
        </p>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => void startCamera()}
            disabled={loadingModel}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-stone-900 py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            {loadingModel ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Camera className="h-4 w-4" aria-hidden />
            )}
            Use camera
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loadingModel}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white py-3 text-sm font-bold text-stone-900 ring-1 ring-stone-200 disabled:opacity-60"
          >
            <Upload className="h-4 w-4" aria-hidden />
            Analyse video
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => void onPickVideo(e.target.files?.[0] ?? null)}
          />
        </div>

        {locked && (
          <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-[#014421]/10 px-3 py-2">
            <p className="text-sm font-semibold text-[#014421]">
              Locked <span className="tabular-nums">{locked.label}</span>
              {clockDelta ? ` · ${clockDelta}` : ""}
            </p>
            <button
              type="button"
              onClick={clearLockedClock}
              className="text-xs font-semibold text-[#014421] underline"
            >
              Clear
            </button>
          </div>
        )}

        {modelError && <p className="mt-2 text-xs text-red-600">{modelError}</p>}
        <p className="mt-2 text-xs text-stone-500">{status}</p>
      </div>

      {(mode === "camera" || mode === "video") && (
        <div className="overflow-hidden rounded-2xl bg-black ring-1 ring-stone-200">
          <div className="relative aspect-[3/4] w-full bg-black sm:aspect-video">
            <video
              ref={videoRef}
              className="absolute inset-0 h-full w-full object-contain"
              playsInline
              muted
            />
            <canvas
              ref={canvasRef}
              className="pointer-events-none absolute inset-0 h-full w-full object-contain"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-white/10 bg-stone-950 px-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-2xl font-bold tabular-nums text-white">{displayLabel}</p>
              <p className="text-xs text-stone-400">
                {clockDelta ?? "vs target clock"}
                {displayDegrees != null ? ` · ${Math.round(displayDegrees)}°` : ""}
                {locked ? " · locked" : live ? " · tracking" : ""}
              </p>
            </div>
            {!locked && (
              <button
                type="button"
                onClick={lockPeakNow}
                className="rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white"
              >
                Lock peak
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                peakRef.current = 0;
                armedRef.current = false;
                lockedRef.current = false;
                setLocked(null);
                setSaveMsg(null);
                setStatus("Ready for another swing.");
                if (mode === "video" && videoRef.current) {
                  videoRef.current.currentTime = 0;
                  void videoRef.current.play();
                  startLoop();
                }
              }}
              className="inline-flex items-center gap-1 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Reset
            </button>
            <button
              type="button"
              onClick={resetSession}
              className="inline-flex items-center gap-1 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white"
            >
              <Square className="h-3.5 w-3.5" aria-hidden />
              Stop
            </button>
          </div>
        </div>
      )}

      {(history.length > 0 || historyError) && (
        <div className="rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-100">
          <p className="flex items-center gap-2 text-sm font-semibold text-stone-900">
            <Film className="h-4 w-4 text-stone-500" aria-hidden />
            Recent shots
          </p>
          {historyError && <p className="mt-2 text-xs text-amber-700">{historyError}</p>}
          <ul className="mt-2 divide-y divide-stone-200">
            {history.map((row) => {
              const unitLabel = row.distance_unit === "yd" ? "yd" : row.distance_unit === "m" ? "m" : "";
              const vsDist = formatDistanceDelta(row.goal_distance, row.carry_distance, row.distance_unit);
              const vsClock =
                row.measured_clock && row.target_clock
                  ? describeDelta(row.measured_clock, row.target_clock)
                  : null;
              return (
                <li key={row.id} className="flex items-start gap-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-stone-900">
                      {row.club}
                      {row.measured_clock ? (
                        <span className="tabular-nums"> · {row.measured_clock}</span>
                      ) : null}
                      {row.carry_distance != null ? (
                        <span className="tabular-nums font-normal text-stone-700">
                          {" "}
                          · {row.carry_distance}
                          {unitLabel}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-stone-500">
                      {new Date(row.logged_at).toLocaleString()}
                      {row.goal_distance != null
                        ? ` · goal ${row.goal_distance}${unitLabel}`
                        : ""}
                      {vsDist ? ` · ${vsDist}` : ""}
                      {vsClock ? ` · ${vsClock}` : ""}
                    </p>
                    {row.note && <p className="mt-0.5 text-xs text-stone-600">{row.note}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => void removeEntry(row.id)}
                    className="rounded-lg p-2 text-stone-400 hover:bg-stone-200 hover:text-stone-700"
                    aria-label="Delete shot"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
