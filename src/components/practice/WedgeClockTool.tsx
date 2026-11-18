"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Film, Loader2, RotateCcw, Save, Square, Trash2, Upload } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { trackToolUse } from "@/lib/appUsage";
import { getPoseLandmarker } from "@/lib/poseLandmarker";
import {
  WEDGE_CLOCK_CLUB_OPTIONS,
  WEDGE_CLOCK_DEFAULT_CLUBS,
  WEDGE_CLOCK_TARGETS,
  isLikelyFaceOn,
  leadArmPoints,
  measureLeadArmDegrees,
  parseClockLabel,
  robustPeakDegrees,
  snapClockLabel,
  type Handedness,
  type WedgeClockClub,
} from "@/lib/wedgeClock";
import {
  chartDistance,
  loadSelectedWedgeClubs,
  loadWedgeClockChart,
  saveSelectedWedgeClubs,
  saveWedgeClockChart,
  setChartDistance,
  type WedgeClockChart,
} from "@/lib/wedgeClockChart";
import {
  deleteWedgeClockLog,
  fetchWedgeClockLogs,
  insertWedgeClockLog,
  loadDistanceUnit,
  saveDistanceUnit,
  type DistanceUnit,
  type WedgeClockLogEntry,
} from "@/lib/wedgeClockLog";
import WedgeClockDial from "@/components/practice/WedgeClockDial";

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
  const liveSamplesRef = useRef<number[]>([]);
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
  const [myClubs, setMyClubs] = useState<WedgeClockClub[]>([...WEDGE_CLOCK_DEFAULT_CLUBS]);
  const [editingClubs, setEditingClubs] = useState(false);
  const [club, setClub] = useState<string>("PW");
  const [targetClock, setTargetClock] = useState<string>("9:00");
  const [unit, setUnit] = useState<DistanceUnit>("m");
  const [chart, setChart] = useState<WedgeClockChart>({});
  const [carryText, setCarryText] = useState("");
  const [live, setLive] = useState<LiveReading | null>(null);
  const [locked, setLocked] = useState<{ degrees: number; label: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<WedgeClockLogEntry[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [flowStep, setFlowStep] = useState<1 | 2 | 3>(1);
  const [status, setStatus] = useState<string>(
    "Film side-on so the lead arm is clear. Walk in, hit, walk back — keep the phone still.",
  );

  modeRef.current = mode;

  useEffect(() => {
    setUnit(loadDistanceUnit());
    setChart(loadWedgeClockChart());
    const selected = loadSelectedWedgeClubs();
    setMyClubs(selected);
    setClub((prev) => (selected.includes(prev as WedgeClockClub) ? prev : selected[0] ?? "PW"));
  }, []);

  const toggleMyClub = (c: WedgeClockClub) => {
    setMyClubs((prev) => {
      const has = prev.includes(c);
      let next: WedgeClockClub[];
      if (has) {
        if (prev.length <= 1) return prev; // keep at least one
        next = prev.filter((x) => x !== c);
      } else {
        const set = new Set([...prev, c]);
        next = WEDGE_CLOCK_CLUB_OPTIONS.filter((x) => set.has(x));
      }
      saveSelectedWedgeClubs(next);
      if (!next.includes(club as WedgeClockClub)) setClub(next[0] ?? "PW");
      return next;
    });
  };

  const setUnitPersist = (next: DistanceUnit) => {
    setUnit(next);
    saveDistanceUnit(next);
  };

  const lockReading = useCallback((degrees: number, label: string) => {
    lockedRef.current = true;
    setLocked({ degrees, label });
    setTargetClock(label);
    setFlowStep(3);
    setStatus(`Backswing ${label}. Enter how far it carried.`);
  }, []);

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
    liveSamplesRef.current = [];
    // Keep lastTsRef — MediaPipe VIDEO mode never accepts a lower timestamp.
    setBusy(false);
    setStatus("Film side-on so the lead arm is clear. Walk in, hit, walk back — keep the phone still.");
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
    setStatus("Getting ready…");
    try {
      await getPoseLandmarker();
      setModelReady(true);
      setLoadingModel(false);
      return true;
    } catch {
      setModelError("Couldn't start measuring. Check your connection and try again.");
      setLoadingModel(false);
      setStatus("Couldn't start — check connection and try again.");
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
        if (armedRef.current && degrees > 18) {
          const buf = liveSamplesRef.current;
          buf.push(degrees);
          if (buf.length > 24) buf.shift();
          peakRef.current = robustPeakDegrees(buf);
        }
        if (
          armedRef.current &&
          peakRef.current >= 35 &&
          degrees < peakRef.current - 20 &&
          !lockedRef.current &&
          modeRef.current === "camera"
        ) {
          const peak = peakRef.current;
          lockReading(peak, snapClockLabel(peak));
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
    [drawOverlay, lockReading],
  );

  /** MediaPipe VIDEO mode requires strictly increasing timestamps across the whole session. */
  const nextDetectTs = useCallback(() => {
    const next = Math.max(performance.now(), lastTsRef.current + 33);
    lastTsRef.current = next;
    return next;
  }, []);

  const processLiveFrame = useCallback(async () => {
    if (!runningRef.current || analysingRef.current) return;
    const video = videoRef.current;
    if (!video || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(() => void processLiveFrame());
      return;
    }

    // Live camera often keeps currentTime at 0 — throttle by wall clock, not video time.
    const now = performance.now();
    if (now - lastTsRef.current < 33 && lastTsRef.current > 0) {
      rafRef.current = requestAnimationFrame(() => void processLiveFrame());
      return;
    }

    try {
      const landmarker = await getPoseLandmarker();
      const result = landmarker.detectForVideo(video, nextDetectTs());
      const landmarks = result.landmarks?.[0];
      if (landmarks && isLikelyFaceOn(landmarks)) {
        setStatus("Looks face-on — stand to the side so the lead arm is clear of the body.");
      }
      const degrees = landmarks ? measureLeadArmDegrees(landmarks, handedness) : null;
      applyDegrees(degrees, landmarks);
    } catch {
      /* skip bad frame */
    }

    if (modeRef.current === "camera" && runningRef.current) {
      rafRef.current = requestAnimationFrame(() => void processLiveFrame());
    }
  }, [applyDegrees, handedness, nextDetectTs]);

  const startLiveLoop = useCallback(() => {
    stopLoop();
    runningRef.current = true;
      peakRef.current = 0;
      armedRef.current = false;
      lockedRef.current = false;
      liveSamplesRef.current = [];
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
      liveSamplesRef.current = [];
      setLocked(null);
      setLive(null);

      try {
        if (!Number.isFinite(video.duration) || video.duration <= 0) {
          await waitForEvent(video, "loadedmetadata");
        }
        // Walk to the ball → hit → walk back: scan the whole clip (cap for phone work).
        const ANALYSE_MAX_SEC = 180;
        const ANALYSE_SAMPLES = 140;
        const fullLen = video.duration || 0;
        const duration = Math.min(fullLen, ANALYSE_MAX_SEC);
        if (duration < 0.2) throw new Error("Video is too short to analyse.");

        const landmarker = await getPoseLandmarker();
        // Even spacing across the clip so a mid-video swing isn’t missed (dense on short clips).
        const step = Math.max(1 / 12, duration / ANALYSE_SAMPLES);
        const degreeSamples: number[] = [];
        let faceOnVotes = 0;
        let poseFrames = 0;
        let peak = 0;

        if (fullLen > 25) {
          setStatus("Watching your clip for the top of the backswing…");
        }

        for (let t = 0; t <= duration; t += step) {
          if (!analysingRef.current) return;
          video.currentTime = Math.min(t, duration - 0.001);
          await waitForEvent(video, "seeked", 8000);
          // Tiny pause helps some mobile decoders present the frame
          await new Promise((r) => window.setTimeout(r, 12));

          let landmarks: Array<{ x: number; y: number; visibility?: number }> | undefined;
          try {
            const result = landmarker.detectForVideo(video, nextDetectTs());
            landmarks = result.landmarks?.[0];
          } catch (err) {
            // Timestamp / graph glitches — keep going with the next frame.
            const msg = err instanceof Error ? err.message : String(err);
            if (/timestamp|INVALID_ARGUMENT|norm_rect/i.test(msg)) {
              lastTsRef.current = Math.max(lastTsRef.current + 1000, performance.now() + 1000);
              continue;
            }
            throw err;
          }

          if (landmarks) {
            poseFrames += 1;
            if (isLikelyFaceOn(landmarks)) faceOnVotes += 1;
          }

          const degrees = landmarks ? measureLeadArmDegrees(landmarks, handedness) : null;
          if (degrees != null) {
            if (degrees > 18) {
              armedRef.current = true;
              degreeSamples.push(degrees);
            }
            peak = robustPeakDegrees(degreeSamples);
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

        const faceOn = poseFrames > 0 && faceOnVotes / poseFrames >= 0.45;
        peak = robustPeakDegrees(degreeSamples);
        peakRef.current = peak;

        if (faceOn) {
          setLocked(null);
          lockedRef.current = false;
          setModelError(
            "That looks face-on. Move the camera to your trail side so we can see the lead arm.",
          );
          setStatus("Stand the camera at trail-hip height, looking across the target line.");
        } else if (peak >= 25 && degreeSamples.length >= 3) {
          setModelError(null);
          lockReading(peak, snapClockLabel(peak));
          trackToolUse("wedge-clock");
        } else if (degreeSamples.length === 0 && poseFrames === 0) {
          setStatus("Couldn't see you — brighter light, full torso, camera side-on.");
          setModelError("No person found in that video.");
        } else {
          setStatus("No clear top of backswing. Film from address to the top, side-on.");
          setModelError(null);
        }
        setAnalyseProgress(100);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setModelError(
          /timestamp|INVALID_ARGUMENT|norm_rect/i.test(msg)
            ? "Couldn't read that clip — tap Analyse video again."
            : msg || "Couldn't read that clip — try another side-on video.",
        );
        setStatus("Try another side-on video from address to the top.");
      } finally {
        analysingRef.current = false;
        setAnalysing(false);
        setBusy(false);
      }
    },
    [drawOverlay, handedness, lockReading, nextDetectTs, stopLoop],
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
    setFlowStep(2);
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
      setStatus("Camera ready — stand side-on and swing. Backswing locks at the top.");
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
    setFlowStep(2);
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
      setStatus("Watching for the top of your backswing…");
      await analyseVideoFile(v);
      trackToolUse("wedge-clock");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't analyse that video.";
      setModelError(msg);
      setStatus("Try another side-on video from address to the top.");
      setBusy(false);
    }
  };

  const lockPeakNow = () => {
    const peak = peakRef.current || live?.degrees;
    if (peak == null || peak < 20) {
      setStatus("No clear top yet — swing side-on, or use a clip that shows address to the top.");
      return;
    }
    lockReading(peak, snapClockLabel(peak));
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
    const carryRaw = parseDistText(carryText);
    if (!carryText.trim() || carryRaw == null || Number.isNaN(carryRaw)) {
      setSaveMsg("Enter the carry distance.");
      return;
    }

    const clockLabel = locked?.label ?? targetClock;
    const goalRaw = chartDistance(chart, club, clockLabel);

    setSaving(true);
    setSaveMsg(null);
    const res = await insertWedgeClockLog(createClient(), {
      userId: user.id,
      club,
      measuredClock: locked?.label ?? null,
      measuredDegrees: locked?.degrees ?? null,
      targetClock: clockLabel,
      goalDistance: goalRaw,
      carryDistance: carryRaw,
      distanceUnit: unit,
      note: locked ? null : "practice (no film)",
      handedness,
    });
    setSaving(false);
    if (res.error) {
      setSaveMsg(res.error);
      return;
    }

    // Remember this club + clock distance on the dial
    const nextChart = setChartDistance(chart, club, clockLabel, carryRaw);
    setChart(nextChart);
    saveWedgeClockChart(nextChart);

    setSaveMsg("Saved to history.");
    setCarryText("");
    clearLockedClock();
    peakRef.current = 0;
    armedRef.current = false;
    resetSession();
    setFlowStep(1);
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
  const canSave = Boolean(carryText.trim());
  const previewActive = mode !== "idle";

  const steps = [
    { n: 1 as const, label: "Club" },
    { n: 2 as const, label: "Film" },
    { n: 3 as const, label: "Log" },
  ];

  const goLogWithoutFilm = () => {
    clearLockedClock();
    setCarryText("");
    setSaveMsg(null);
    setFlowStep(3);
  };

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <div className="rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-100">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-stone-900">
              Wedge Clock
              <span className="rounded bg-[#FFA500]/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#c77c00]">
                Beta
              </span>
            </p>
            <p className="mt-1 text-xs text-stone-500">
              Film a swing or just log clock + distance while you practice.
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

        <ol className="mt-3 flex gap-1">
          {steps.map((s) => (
            <li key={s.n} className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setFlowStep(s.n)}
                className={`flex w-full flex-col items-center rounded-xl px-1 py-2 text-center transition ${
                  flowStep === s.n
                    ? "bg-[#014421] text-white"
                    : flowStep > s.n
                      ? "bg-[#014421]/10 text-[#014421]"
                      : "bg-white text-stone-500 ring-1 ring-stone-200"
                }`}
              >
                <span className="text-[10px] font-bold uppercase tracking-wide">Step {s.n}</span>
                <span className="text-xs font-semibold">{s.label}</span>
              </button>
            </li>
          ))}
        </ol>

        {flowStep === 1 && (
          <div className="mt-4 space-y-3">
            <div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-stone-600">Club</p>
                <button
                  type="button"
                  onClick={() => setEditingClubs((v) => !v)}
                  className="text-[11px] font-semibold text-[#014421] underline"
                >
                  {editingClubs ? "Done" : "Choose my clubs"}
                </button>
              </div>

              {editingClubs ? (
                <div className="mt-2 rounded-xl bg-white p-3 ring-1 ring-stone-200">
                  <p className="text-[11px] text-stone-500">
                    Tick the wedges you carry — only these show when you practice.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {WEDGE_CLOCK_CLUB_OPTIONS.map((c) => {
                      const on = myClubs.includes(c);
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => toggleMyClub(c)}
                          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                            on
                              ? "bg-[#014421] text-white"
                              : "bg-stone-100 text-stone-500 ring-1 ring-stone-200"
                          }`}
                        >
                          {c}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-1">
                  {myClubs.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setClub(c)}
                      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                        club === c
                          ? "bg-[#014421] text-white"
                          : "bg-white text-stone-700 ring-1 ring-stone-200 hover:text-stone-900"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <WedgeClockDial
              club={club}
              selectedClock={locked?.label ?? targetClock}
              chart={chart}
              unit={unit}
              measuredHours={
                locked
                  ? parseClockLabel(locked.label)
                  : live
                    ? parseClockLabel(live.peakLabel)
                    : null
              }
              onSelectClock={setTargetClock}
            />

            <label className="block text-xs font-medium text-stone-600">
              Handedness
              <select
                value={handedness}
                onChange={(e) => {
                  const next = e.target.value as Handedness;
                  setHandedness(next);
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

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setFlowStep(2)}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-[#014421] py-3 text-sm font-bold text-white"
              >
                Next · Film swing
              </button>
              <button
                type="button"
                onClick={goLogWithoutFilm}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-white py-3 text-sm font-bold text-stone-900 ring-1 ring-stone-200"
              >
                Skip film · Log practice
              </button>
            </div>
          </div>
        )}

        {flowStep === 2 && (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-stone-500">
              Optional. Phone side-on at trail-hip height — we lock the clock at the top. Or skip and log by feel.
            </p>
            <p className="text-sm font-semibold text-stone-800">
              {club}
              <span className="font-normal text-stone-500"> · aiming {targetClock}</span>
            </p>

            <div className="flex flex-col gap-2 sm:flex-row">
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
              <div className="flex items-center justify-between gap-2 rounded-xl bg-[#014421]/10 px-3 py-2">
                <p className="text-sm font-semibold text-[#014421]">
                  Backswing <span className="tabular-nums">{locked.label}</span>
                </p>
                <button
                  type="button"
                  onClick={() => setFlowStep(3)}
                  className="text-xs font-bold text-[#014421] underline"
                >
                  Add distance →
                </button>
              </div>
            )}

            {modelError && <p className="text-xs text-red-600">{modelError}</p>}
            <p className="text-xs text-stone-500">{status}</p>
            {analysing && (
              <div>
                <div className="h-1.5 overflow-hidden rounded-full bg-stone-200">
                  <div
                    className="h-full rounded-full bg-[#014421] transition-all"
                    style={{ width: `${analyseProgress}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-stone-500">Finding top of swing… {analyseProgress}%</p>
              </div>
            )}

            <button
              type="button"
              onClick={goLogWithoutFilm}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-white py-3 text-sm font-bold text-stone-900 ring-1 ring-stone-200"
            >
              Skip film · Log {targetClock} practice
            </button>

            <button
              type="button"
              onClick={() => setFlowStep(1)}
              className="text-xs font-semibold text-stone-500 underline"
            >
              ← Back to club
            </button>
          </div>
        )}

        {flowStep === 3 && (
          <div className="mt-4 space-y-3">
            <div className="rounded-xl bg-white px-3 py-3 ring-1 ring-stone-200">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                {locked ? "Measured clock" : "Clock length"}
              </p>
              <p className="text-3xl font-bold tabular-nums text-stone-900">
                {locked?.label ?? targetClock}
              </p>
              <p className="text-xs text-stone-500">
                {club}
                {locked ? " · from video" : " · logged without film"}
              </p>
            </div>

            {!locked && (
              <div>
                <p className="text-xs font-medium text-stone-600">Change clock</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {WEDGE_CLOCK_TARGETS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTargetClock(t)}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${
                        targetClock === t
                          ? "bg-[#014421] text-white"
                          : "bg-white text-stone-700 ring-1 ring-stone-200"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <label className="block text-xs font-medium text-stone-600">
              How far did it go? ({unit})
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={400}
                step={0.1}
                value={carryText}
                onChange={(e) => setCarryText(e.target.value)}
                placeholder={unit === "yd" ? "e.g. 70" : "e.g. 60"}
                autoFocus
                className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-3 text-lg font-semibold text-stone-900"
              />
            </label>

            <button
              type="button"
              onClick={() => void saveShot()}
              disabled={saving || !user?.id || !canSave}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#014421] py-3 text-sm font-bold text-white disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Save className="h-4 w-4" aria-hidden />
              )}
              Save to history
            </button>
            {!user?.id && (
              <p className="text-xs text-amber-700">Sign in to save shots across sessions.</p>
            )}
            {saveMsg && <p className="text-xs text-stone-600">{saveMsg}</p>}

            <button
              type="button"
              onClick={() => setFlowStep(2)}
              className="text-xs font-semibold text-stone-500 underline"
            >
              ← Back to film
            </button>
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
              {club}
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
                setStatus("Ready — stand side-on and swing.");
                startLiveLoop();
              } else if (mode === "video" && objectUrlRef.current && videoRef.current) {
                setStatus("Watching for the top of your backswing…");
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
              return (
                <li key={row.id} className="flex items-start gap-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm font-semibold text-stone-900">
                        {row.club}
                        <span className="ml-2 tabular-nums text-stone-600">
                          {row.measured_clock ?? row.target_clock ?? "—"}
                        </span>
                      </p>
                      {row.carry_distance != null && (
                        <p className="text-base font-bold tabular-nums text-stone-900">
                          {row.carry_distance}
                          <span className="ml-0.5 text-xs font-semibold text-stone-500">{unitLabel}</span>
                        </p>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-stone-500">
                      {new Date(row.logged_at).toLocaleString()}
                      {!row.measured_clock && row.target_clock ? " · no film" : ""}
                    </p>
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
