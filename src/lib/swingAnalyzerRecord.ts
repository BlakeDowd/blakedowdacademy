/** Matches analyser shape coords (0–1). Kept local to avoid import cycles. */
type Pt = [number, number];
type Shape = { id: string; kind: string; color: string; pts: Pt[] };

/** Prefer free browser-native codecs; nothing is uploaded. */
export function pickRecorderMime(): string {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  for (const t of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

export function recorderSupported(): boolean {
  return typeof MediaRecorder !== "undefined" && Boolean(pickRecorderMime());
}

function px(p: Pt, w: number, h: number): [number, number] {
  return [p[0] * w, p[1] * h];
}

function angleDeg(v: Pt, a: Pt, b: Pt, h: number): number {
  const ax = (a[0] - v[0]) * 1000;
  const ay = (a[1] - v[1]) * h;
  const bx = (b[0] - v[0]) * 1000;
  const by = (b[1] - v[1]) * h;
  const mag = Math.hypot(ax, ay) * Math.hypot(bx, by);
  if (!mag) return 0;
  return (Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / mag))) * 180) / Math.PI;
}

/** Draw analyser shapes onto a 2D canvas (same 0–1 coords as the SVG overlay). */
export function paintShapes(
  ctx: CanvasRenderingContext2D,
  shapes: readonly Shape[],
  w: number,
  h: number,
) {
  const lw = Math.max(2.5, w * 0.0035);
  for (const s of shapes) {
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = lw;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (s.kind === "pen" && s.pts.length > 1) {
      ctx.beginPath();
      const [x0, y0] = px(s.pts[0]!, w, h);
      ctx.moveTo(x0, y0);
      for (let i = 1; i < s.pts.length; i++) {
        const [x, y] = px(s.pts[i]!, w, h);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      continue;
    }

    if (s.kind === "line" && s.pts.length >= 2) {
      const [a, b] = [px(s.pts[0]!, w, h), px(s.pts[1]!, w, h)];
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
      for (const p of [a, b]) {
        ctx.beginPath();
        ctx.arc(p[0], p[1], lw * 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      continue;
    }

    if (s.kind === "circle" && s.pts.length >= 2) {
      const [c, e] = [px(s.pts[0]!, w, h), px(s.pts[1]!, w, h)];
      ctx.beginPath();
      ctx.arc(c[0], c[1], Math.hypot(e[0] - c[0], e[1] - c[1]), 0, Math.PI * 2);
      ctx.stroke();
      continue;
    }

    if (s.kind === "angle" && s.pts.length >= 3) {
      const [v, a, b] = [px(s.pts[0]!, w, h), px(s.pts[1]!, w, h), px(s.pts[2]!, w, h)];
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(v[0], v[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(v[0], v[1], lw * 2, 0, Math.PI * 2);
      ctx.fill();
      const deg = Math.round(angleDeg(s.pts[0]!, s.pts[1]!, s.pts[2]!, h));
      ctx.font = `bold ${Math.max(14, w * 0.028)}px system-ui,sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = lw * 2;
      ctx.strokeStyle = "rgba(0,0,0,0.75)";
      const lx = v[0] + (a[0] + b[0] - 2 * v[0]) * 0.15;
      const ly = v[1] + (a[1] + b[1] - 2 * v[1]) * 0.15;
      ctx.strokeText(`${deg}°`, lx, ly);
      ctx.fillStyle = s.color;
      ctx.fillText(`${deg}°`, lx, ly);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = lw;
    }
  }
}

export type AnalyzerRecorder = {
  stop: () => Promise<Blob>;
  /** Call each animation frame while recording. */
  paintFrame: (video: HTMLVideoElement, shapes: readonly Shape[]) => void;
  mimeType: string;
};

/**
 * Records the swing view (video + drawings) with microphone audio.
 * Everything stays on-device — download the blob; no cloud upload.
 */
export async function startAnalyzerRecording(): Promise<AnalyzerRecorder> {
  if (!recorderSupported()) {
    throw new Error("This browser can't record video. Try Chrome or Edge on desktop.");
  }

  const mimeType = pickRecorderMime();
  const mic = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
    video: false,
  });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) {
    mic.getTracks().forEach((t) => t.stop());
    throw new Error("Couldn't start the recorder.");
  }

  const fps = 30;
  const canvasStream = canvas.captureStream(fps);
  const mixed = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...mic.getAudioTracks(),
  ]);

  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(mixed, {
    mimeType: mimeType || undefined,
    videoBitsPerSecond: 2_500_000,
  });
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  let stopResolve: ((b: Blob) => void) | null = null;
  const stopped = new Promise<Blob>((resolve) => {
    stopResolve = resolve;
  });
  recorder.onstop = () => {
    mic.getTracks().forEach((t) => t.stop());
    canvasStream.getTracks().forEach((t) => t.stop());
    const blob = new Blob(chunks, { type: mimeType || "video/webm" });
    stopResolve?.(blob);
  };

  recorder.start(250);

  return {
    mimeType: mimeType || "video/webm",
    paintFrame(video, shapes) {
      const vw = video.videoWidth || 720;
      const vh = video.videoHeight || 1280;
      const maxEdge = 1280;
      const scale = Math.min(1, maxEdge / Math.max(vw, vh));
      const w = Math.max(2, Math.round(vw * scale));
      const h = Math.max(2, Math.round(vh * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);
      if (video.readyState >= 2) ctx.drawImage(video, 0, 0, w, h);
      paintShapes(ctx, shapes, w, h);
    },
    stop() {
      if (recorder.state === "inactive") {
        return Promise.resolve(new Blob(chunks, { type: mimeType || "video/webm" }));
      }
      recorder.stop();
      return stopped;
    },
  };
}

export function downloadRecordingBlob(blob: Blob, mimeType: string) {
  const ext = mimeType.includes("mp4") ? "mp4" : "webm";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `swing-analysis-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.${ext}`;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
