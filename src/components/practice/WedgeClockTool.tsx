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

function waitForEvent(el: HTMLVideoElement, event: string, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error("Video failed to load"));
    };
    const cleanup = () => {
      window.clearTimeout(t);
      el.removeEventListener(event, onOk);
      el.removeEventListener("error", onErr);
    };
    el.addEventListener(event, onOk, { once: true });
    el.addEventListener("error", onErr, { once: true });
  });
}

export default function WedgeClockTool({ compact }: { compact?: boolean }) {
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef(0);
  const peakRef = useRef(0);
  const armedRef = useRef(false);
  const runningRef = useRef(false);
  const lockedRef = useRef(false);
  const modeRef = useRef<Mode>("idle");
  const analysingRef = useRef(false);

  const [mode, setMode] = useState<Mode>("idle");
  const [modelReady, setModelReady] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [loadingModel, setLoadingModel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const [analyseProgress, setAnalyseProgress] = useState(0);
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
    "Side-on to the swing. Camera or a phone video — pose stays on this device.",
  );

  modeRef.current = mode;

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

  const stopCameraTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const clearObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const detachVideo = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.srcObject = null;
    v.removeAttribute("src");
    v.load();
  }, []);

  const resetSession = useCallback(() => {
    stopLoop();
    analysingRef.current = false;
    setAnalysing(false);
    setAnalyseProgress(0);
    stopCameraTracks();
    clearObjectUrl();
    detachVideo();
    setMode("idle");
    setLive(null);
    setLocked(null);
    lockedRef.current = false;
    peakRef.current = 0;
    armedRef.current = false;
    lastTsRef.current = 0;
    setBusy(false);
    setStatus("Side-on to the swing. Camera or a phone video — pose stays on this device.");
  }, [clearObjectUrl, detachVideo, stopCameraTracks, stopLoop]);

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
    setStatus("Loading pose model on this device…");
    try {
      await getPoseLandmarker();
      setModelReady(true);
      setLoadingModel(false);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't load pose model.";
      setModelError(msg);
      setLoadingModel(false);
      setStatus("Pose model failed to load. Check connection and try again.");
      return false;
    }
  }, [modelReady]);

  const drawOverlay = useCallback(
    (
      landmarks: Array<{ x: number; y: number; visibility?: number }> | undefined,
      degrees: number | null,
      peakDegrees: number,
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

      // Always show live / peak clock so the player knows it's working
      const liveLabel = degrees != null ? snapClockLabel(degrees) : null;
      const peakLabel = peakDegrees >= 20 ? snapClockLabel(peakDegrees) : null;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(12, 12, Math.min(w - 24, 220), peakLabel ? 78 : 48);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 28px system-ui, sans-serif";
      ctx.fillText(liveLabel ?? "—", 24, 44);
      if (peakLabel) {
        ctx.font = "600 16px system-ui, sans-serif";
        ctx.fillStyle = "#7CFFB2";
        ctx.fillText(`Backswing ${peakLabel}`, 24, 72);
      }

      if (!landmarks) return;
      const pts = leadArmPoints(landmarks, handedness);
      if (!pts) return;

      const sx = pts.shoulder.x * w;
      const sy = pts.shoulder.y * h;
      const ex = pts.elbow.x * w;
      const ey = pts.elbow.y * h;
      const wx = pts.wrist.x * w;
      const wy = pts.wrist.y * h;

      const r = Math.min(w, h) * 0.16;
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
      ctx.strokeStyle = pts.ok ? "#7CFFB2" : "#FFA500";
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
    },
    [handedness],
  );

  const applyDegrees = useCallback(
    (degrees: number | null, landmarks?: Array<{ x: number; y: number; visibility?: number }>) => {
      if (degrees != null) {
        if (!armedRef.current && degrees > 20) armedRef.current = true;
        if (armedRef.current && degrees > peakRef.current) peakRef.current = degrees;
        if (
          armedRef.current &&
          peakRef.current >= 35 &&
          degrees < peakRef.current - 20 &&
          !lockedRef.current &&
          modeRef.current === "camera"
        ) {
          const peak = peakRef.current;
          lockedRef.current = true;
          setLocked({ degrees: peak, label: snapClockLabel(peak) });
          setStatus(`Backswing locked at ${snapClockLabel(peak)}. Nothing uploaded.`);
          trackToolUse("wedge-clock");
        }
        setLive({
          degrees,
          label: snapClockLabel(degrees),
          peakDegrees: peakRef.current,
          peakLabel: snapClockLabel(peakRef.current || degrees),
        });
      }
      drawOverlay(landmarks, degrees, peakRef.current);
    },
    [drawOverlay],
  );

  const processLiveFrame = useCallback(async () => {
    if (!runningRef.current || analysingRef.current) return;
    const video = videoRef.current;
    if (!video || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(() => void processLiveFrame());
      return;
    }

    // Live camera often keeps currentTime at 0 — throttle by wall clock, not video time.
    const now = performance.now();
    if (now - lastTsRef.current < 33) {
      rafRef.current = requestAnimationFrame(() => void processLiveFrame());
      return;
    }
    lastTsRef.current = now;

    try {
      const landmarker = await getPoseLandmarker();
      const result = landmarker.detectForVideo(video, now);
      const landmarks = result.landmarks?.[0];
      const degrees = landmarks ? measureLeadArmDegrees(landmarks, handedness) : null;
      applyDegrees(degrees, landmarks);
    } catch {
      /* skip bad frame */
    }

    if (modeRef.current === "camera" && runningRef.current) {
      rafRef.current = requestAnimationFrame(() => void processLiveFrame());
    }
  }, [applyDegrees, handedness]);

  const startLiveLoop = useCallback(() => {
    stopLoop();
    runningRef.current = true;
    peakRef.current = 0;
    armedRef.current = false;
    lockedRef.current = false;
    lastTsRef.current = 0;
    setLocked(null);
    setLive(null);
    setSaveMsg(null);
    rafRef.current = requestAnimationFrame(() => void processLiveFrame());
  }, [processLiveFrame, stopLoop]);

  const scrollPreview = () => {
    window.setTimeout(() => {
      previewRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 50);
  };

  /** Sample a local video file frame-by-frame (reliable vs realtime playback). */
  const analyseVideoFile = useCallback(
    async (video: HTMLVideoElement) => {
      analysingRef.current = true;
      setAnalysing(true);
      setAnalyseProgress(0);
      stopLoop();
      peakRef.current = 0;
      armedRef.current = false;
      lockedRef.current = false;
      setLocked(null);
      setLive(null);

      try {
        if (!Number.isFinite(video.duration) || video.duration <= 0) {
          await waitForEvent(video, "loadedmetadata");
        }
        const duration = Math.min(video.duration || 0, 20);
        if (duration < 0.2) throw new Error("Video is too short to analyse.");

        const landmarker = await getPoseLandmarker();
        // ~15 samples/sec across the clip (cap work on long phones)
        const step = Math.max(1 / 15, duration / 90);
        let peak = 0;
        let samples = 0;
        let timestamp = 1;

        for (let t = 0; t <= duration; t += step) {
          if (!analysingRef.current) return;
          video.currentTime = Math.min(t, duration - 0.001);
          await waitForEvent(video, "seeked", 8000);
          // Tiny pause helps some mobile decoders present the frame
          await new Promise((r) => window.setTimeout(r, 16));

          const result = landmarker.detectForVideo(video, timestamp);
          timestamp += 66;
          const landmarks = result.landmarks?.[0];
          const degrees = landmarks ? measureLeadArmDegrees(landmarks, handedness) : null;
          if (degrees != null) {
            samples += 1;
            if (degrees > 20) armedRef.current = true;
            if (armedRef.current && degrees > peak) peak = degrees;
            peakRef.current = peak;
            setLive({
              degrees,
              label: snapClockLabel(degrees),
              peakDegrees: peak,
              peakLabel: snapClockLabel(peak || degrees),
            });
            drawOverlay(landmarks, degrees, peak);
          } else {
            drawOverlay(landmarks, null, peak);
          }
          setAnalyseProgress(Math.min(99, Math.round((t / duration) * 100)));
        }

        if (peak >= 25) {
          lockedRef.current = true;
          setLocked({ degrees: peak, label: snapClockLabel(peak) });
          setStatus(`Backswing length ${snapClockLabel(peak)}. Video stayed on this device.`);
          trackToolUse("wedge-clock");
        } else if (samples === 0) {
          setStatus("Couldn't see a person — try a brighter side-on clip of the full torso.");
          setModelError("No pose detected in that video.");
        } else {
          setStatus("Saw movement but no clear backswing. Use a side-on clip from address to the top.");
        }
        setAnalyseProgress(100);
      } finally {
        analysingRef.current = false;
        setAnalysing(false);
        setBusy(false);
      }
    },
    [drawOverlay, handedness, stopLoop],
  );

  const startCamera = async () => {
    setBusy(true);
    setModelError(null);
    const ok = await ensureModel();
    if (!ok) {
      setBusy(false);
      return;
    }

    stopLoop();
    stopCameraTracks();
    clearObjectUrl();
    detachVideo();

    // Mount the preview first so videoRef exists
    setMode("camera");
    scrollPreview();
    setStatus("Starting camera…");

    await new Promise((r) => window.requestAnimationFrame(() => r(undefined)));

    const v = videoRef.current;
    if (!v) {
      setModelError("Couldn't open camera preview.");
      setBusy(false);
      setMode("idle");
      return;
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: true,
        });
      }
      streamRef.current = stream;
      v.srcObject = stream;
      v.muted = true;
      v.playsInline = true;
      v.setAttribute("playsinline", "true");
      v.setAttribute("webkit-playsinline", "true");
      await v.play();
      // Wait until we have pixels
      if (v.videoWidth === 0) {
        await waitForEvent(v, "loadeddata", 10000);
      }
      setStatus("Recording live · side-on · swing when ready — peak backswing locks automatically.");
      startLiveLoop();
      trackToolUse("wedge-clock");
    } catch (err) {
      const msg =
        err instanceof Error && /Permission|NotAllowed/i.test(err.message)
          ? "Camera permission blocked. Allow camera, or use Analyse video instead."
          : "Couldn't start the camera. Try Analyse video with a clip from your phone.";
      setModelError(msg);
      setMode("idle");
      stopCameraTracks();
    } finally {
      setBusy(false);
    }
  };

  const onPickVideo = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setModelError(null);
    const ok = await ensureModel();
    if (!ok) {
      setBusy(false);
      return;
    }

    stopLoop();
    stopCameraTracks();
    clearObjectUrl();
    detachVideo();

    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setMode("video");
    scrollPreview();
    setStatus(`Loading ${file.name}…`);

    await new Promise((r) => window.requestAnimationFrame(() => r(undefined)));

    const v = videoRef.current;
    if (!v) {
      setModelError("Couldn't open video preview.");
      setBusy(false);
      setMode("idle");
      return;
    }

    try {
      v.srcObject = null;
      v.src = url;
      v.muted = true;
      v.playsInline = true;
      v.setAttribute("playsinline", "true");
      v.load();
      await waitForEvent(v, "loadeddata");
      setStatus("Scanning backswing on this device…");
      await analyseVideoFile(v);
      trackToolUse("wedge-clock");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't analyse that video.";
      setModelError(msg);
      setStatus("Analyse failed — try another side-on clip.");
      setBusy(false);
    }
  };

  const lockPeakNow = () => {
    const peak = peakRef.current || live?.degrees;
    if (peak == null || peak < 20) {
      setStatus("No clear backswing yet — take a swing side-on, or analyse a longer clip.");
      return;
    }
    lockedRef.current = true;
    setLocked({ degrees: peak, label: snapClockLabel(peak) });
    setStatus(`Backswing locked at ${snapClockLabel(peak)}.`);
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
  const previewActive = mode !== "idle";

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <div className="rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-100">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-stone-900">Wedge Clock</p>
            <p className="mt-1 text-xs text-stone-500">
              Measure backswing arm length (clock face). Optional radar carry — no swing upload.
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
              onChange={(e) => {
                const next = e.target.value as Handedness;
                setHandedness(next);
                // Don't mix peaks from the other lead arm
                peakRef.current = 0;
                armedRef.current = false;
                lockedRef.current = false;
                setLocked(null);
                setLive(null);
              }}
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
            Target clock
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
        <p className="text-sm font-semibold text-stone-900">Measure backswing</p>
        <p className="mt-1 text-xs text-stone-500">
          Side-on so the lead arm is clear. Reports clock length at the top (e.g. 9:00 / 10:30).
        </p>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => void startCamera()}
            disabled={loadingModel || busy || analysing}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-stone-900 py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            {loadingModel || (busy && mode !== "video") ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Camera className="h-4 w-4" aria-hidden />
            )}
            Record swing
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loadingModel || busy || analysing}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white py-3 text-sm font-bold text-stone-900 ring-1 ring-stone-200 disabled:opacity-60"
          >
            {analysing ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Upload className="h-4 w-4" aria-hidden />
            )}
            Analyse video
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              e.target.value = "";
              void onPickVideo(f);
            }}
          />
        </div>

        {locked && (
          <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-[#014421]/10 px-3 py-2">
            <p className="text-sm font-semibold text-[#014421]">
              Backswing <span className="tabular-nums">{locked.label}</span>
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
        {analysing && (
          <div className="mt-2">
            <div className="h-1.5 overflow-hidden rounded-full bg-stone-200">
              <div
                className="h-full rounded-full bg-[#014421] transition-all"
                style={{ width: `${analyseProgress}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-stone-500">Scanning… {analyseProgress}%</p>
          </div>
        )}
      </div>

      {/* Kept mounted (hidden when idle) so camera/video can attach to the ref */}
      <div
        ref={previewRef}
        className={
          previewActive
            ? "overflow-hidden rounded-2xl bg-black ring-1 ring-stone-200"
            : "hidden"
        }
        aria-hidden={!previewActive}
      >
        <div className="relative aspect-[3/4] w-full bg-black sm:aspect-video">
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full bg-black object-contain"
            playsInline
            muted
            autoPlay={mode === "camera"}
          />
          <canvas
            ref={canvasRef}
            className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          />
          {mode === "camera" && !locked && (
            <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-lg">
              <span className="h-2 w-2 animate-pulse rounded-full bg-white" aria-hidden />
              Rec
            </div>
          )}
          {mode === "video" && analysing && (
            <div className="absolute left-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-bold text-white">
              Analysing…
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 bg-stone-950 px-3 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">
              {locked ? "Backswing length" : "Live / peak"}
            </p>
            <p className="text-3xl font-bold tabular-nums text-white">{displayLabel}</p>
            <p className="text-xs text-stone-400">
              {clockDelta ?? `Target ${targetClock}`}
              {displayDegrees != null ? ` · ${Math.round(displayDegrees)}° from address` : ""}
              {locked ? " · locked" : live ? " · tracking" : ""}
            </p>
          </div>
          {!locked && (
            <button
              type="button"
              onClick={lockPeakNow}
              disabled={analysing}
              className="rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
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
              setModelError(null);
              if (mode === "camera") {
                setStatus("Ready — swing when ready.");
                startLiveLoop();
              } else if (mode === "video" && objectUrlRef.current && videoRef.current) {
                setStatus("Re-scanning…");
                void analyseVideoFile(videoRef.current);
              }
            }}
            disabled={analysing}
            className="inline-flex items-center gap-1 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
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
