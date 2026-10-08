"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  Circle,
  Loader2,
  Minus,
  Pause,
  PenLine,
  Play,
  Trash2,
  Undo2,
  X,
} from "lucide-react";

export type ShapeKind = "line" | "angle" | "circle" | "pen";
export type Pt = [number, number];
export type Shape = { id: string; kind: ShapeKind; color: string; pts: Pt[] };
export type AnalyzerSource = { url: string; type: "mp4" | "hls" };

const COLORS = ["#ef4444", "#facc15", "#38bdf8", "#ffffff"];
const FRAME_SEC = 1 / 30;
const SPEEDS = [1, 0.5, 0.25] as const;
const VB_W = 1000;
const MIN_LEN = 8;

function AngleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M4 20 L20 20 M4 20 L15 6" />
      <path d="M10 20 A6 6 0 0 0 8.6 14.6" />
    </svg>
  );
}

const TOOLS: { id: ShapeKind; label: string; icon: ReactNode }[] = [
  { id: "line", label: "Line", icon: <Minus className="h-5 w-5 -rotate-45" aria-hidden /> },
  { id: "angle", label: "Angle", icon: <AngleIcon className="h-5 w-5" /> },
  { id: "circle", label: "Circle", icon: <Circle className="h-5 w-5" aria-hidden /> },
  { id: "pen", label: "Pen", icon: <PenLine className="h-5 w-5" aria-hidden /> },
];

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec)) return "0:00.0";
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

function angleDegrees(v: Pt, a: Pt, b: Pt, vbH: number): number {
  const ax = (a[0] - v[0]) * VB_W;
  const ay = (a[1] - v[1]) * vbH;
  const bx = (b[0] - v[0]) * VB_W;
  const by = (b[1] - v[1]) * vbH;
  const dot = ax * bx + ay * by;
  const mag = Math.hypot(ax, ay) * Math.hypot(bx, by);
  if (mag === 0) return 0;
  return (Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180) / Math.PI;
}

function ShapeView({ shape, vbH }: { shape: Shape; vbH: number }) {
  const px = (p: Pt): [number, number] => [p[0] * VB_W, p[1] * vbH];
  const stroke = { stroke: shape.color, strokeWidth: 3, vectorEffect: "non-scaling-stroke" as const, fill: "none" };
  const label = { fill: shape.color, fontSize: 44, fontWeight: 800, stroke: "rgba(0,0,0,0.75)", strokeWidth: 10, paintOrder: "stroke" as const };

  if (shape.kind === "pen") {
    return <polyline points={shape.pts.map((p) => px(p).join(",")).join(" ")} strokeLinecap="round" strokeLinejoin="round" {...stroke} />;
  }
  if (shape.kind === "circle") {
    const [c, e] = [px(shape.pts[0]!), px(shape.pts[1]!)];
    return <circle cx={c[0]} cy={c[1]} r={Math.hypot(e[0] - c[0], e[1] - c[1])} {...stroke} />;
  }
  if (shape.kind === "line") {
    const [a, b] = [px(shape.pts[0]!), px(shape.pts[1]!)];
    return (
      <g>
        <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} strokeLinecap="round" {...stroke} />
        <circle cx={a[0]} cy={a[1]} r={7} fill={shape.color} />
        <circle cx={b[0]} cy={b[1]} r={7} fill={shape.color} />
      </g>
    );
  }
  const [v, a, b] = shape.pts.map(px) as [number, number][];
  const deg = shape.pts.length === 3 ? angleDegrees(shape.pts[0]!, shape.pts[1]!, shape.pts[2]!, vbH) : null;
  return (
    <g>
      <polyline points={[a, v, ...(b ? [b] : [])].map((p) => p!.join(",")).join(" ")} strokeLinecap="round" strokeLinejoin="round" {...stroke} />
      <circle cx={v![0]} cy={v![1]} r={8} fill={shape.color} />
      {deg != null && (
        <text x={v![0] + 18} y={v![1] - 18} {...label}>
          {Math.round(deg)}°
        </text>
      )}
    </g>
  );
}

function useAttachSource(videoRef: React.RefObject<HTMLVideoElement | null>, source: AnalyzerSource | null) {
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source) return;
    if (source.type === "mp4" || video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = source.url;
      return () => {
        video.removeAttribute("src");
        video.load();
      };
    }
    let destroyed = false;
    let hls: { destroy: () => void } | null = null;
    void import("hls.js").then(({ default: Hls }) => {
      if (destroyed || !Hls.isSupported()) return;
      const instance = new Hls();
      instance.loadSource(source.url);
      instance.attachMedia(video);
      hls = instance;
    });
    return () => {
      destroyed = true;
      hls?.destroy();
    };
  }, [videoRef, source]);
}

function ToolButton({
  active,
  onClick,
  label,
  children,
  disabled,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      className={`flex flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[10px] font-semibold transition disabled:opacity-30 ${
        active ? "bg-white text-stone-950" : "text-white/80 hover:bg-white/10"
      }`}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}

/**
 * Full-screen swing review: frame scrubber, frame stepping, slow motion, and line / angle / circle / pen
 * drawing over the video. Shapes are stored in 0–1 coordinates so they line up at any size.
 */
export function SwingAnalyzer({
  source,
  error,
  initialShapes,
  canSave,
  onSave,
  onClose,
  title = "Swing analysis",
}: {
  source: AnalyzerSource | null;
  error?: string | null;
  initialShapes?: Shape[];
  canSave?: boolean;
  onSave?: (shapes: Shape[]) => Promise<string | null>;
  onClose: () => void;
  title?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [ratio, setRatio] = useState(9 / 16);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [tool, setTool] = useState<ShapeKind | null>(null);
  const [color, setColor] = useState(COLORS[0]!);
  const [shapes, setShapes] = useState<Shape[]>(initialShapes ?? []);
  const [draft, setDraft] = useState<Shape | null>(null);
  const [pendingAngle, setPendingAngle] = useState<Shape | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const vbH = VB_W / ratio;

  useAttachSource(videoRef, source);

  const [loadedInitial, setLoadedInitial] = useState(initialShapes);
  if (initialShapes !== loadedInitial) {
    setLoadedInitial(initialShapes);
    if (!dirty) setShapes(initialShapes ?? []);
  }

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      if (v) setCurrent(v.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const close = () => {
    if (canSave && dirty && !window.confirm("Close without saving your drawings?")) return;
    onClose();
  };

  const onCloseRef = useRef(close);
  useEffect(() => {
    onCloseRef.current = close;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  };

  const seek = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    const next = Math.max(0, Math.min(duration || v.duration || 0, t));
    v.currentTime = next;
    setCurrent(next);
  };

  const step = (dir: 1 | -1) => {
    videoRef.current?.pause();
    seek((videoRef.current?.currentTime ?? current) + dir * FRAME_SEC);
  };

  const changeSpeed = (s: (typeof SPEEDS)[number]) => {
    setSpeed(s);
    if (videoRef.current) videoRef.current.playbackRate = s;
  };

  const commit = (next: Shape[]) => {
    setShapes(next);
    setDirty(true);
    setSaveMsg(null);
  };

  const toPoint = (e: ReactPointerEvent<SVGSVGElement>): Pt => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    return [Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y))];
  };

  const lengthPx = (a: Pt, b: Pt) => Math.hypot((b[0] - a[0]) * VB_W, (b[1] - a[1]) * vbH);

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!tool) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toPoint(e);
    if (tool === "angle" && pendingAngle) {
      setDraft({ ...pendingAngle, pts: [...pendingAngle.pts, p] });
      setPendingAngle(null);
      return;
    }
    setDraft({ id: newId(), kind: tool, color, pts: tool === "pen" ? [p] : [p, p] });
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!draft) return;
    const p = toPoint(e);
    setDraft((d) => (d ? { ...d, pts: d.kind === "pen" ? [...d.pts, p] : [...d.pts.slice(0, -1), p] } : d));
  };

  const onPointerUp = () => {
    if (!draft) return;
    const d = draft;
    setDraft(null);
    if (d.kind === "pen") {
      if (d.pts.length > 1) commit([...shapes, d]);
      return;
    }
    if (d.kind === "angle" && d.pts.length === 2) {
      if (lengthPx(d.pts[0]!, d.pts[1]!) > MIN_LEN) setPendingAngle(d);
      return;
    }
    if (lengthPx(d.pts[0]!, d.pts[d.pts.length - 1]!) > MIN_LEN) commit([...shapes, d]);
  };

  const undo = () => {
    if (pendingAngle) {
      setPendingAngle(null);
      return;
    }
    if (shapes.length) commit(shapes.slice(0, -1));
  };

  const clearAll = () => {
    setPendingAngle(null);
    if (shapes.length) commit([]);
  };

  const save = async () => {
    if (!onSave || saving) return;
    setSaving(true);
    const err = await onSave(shapes);
    setSaving(false);
    if (err) setSaveMsg(err);
    else {
      setDirty(false);
      setSaveMsg("Saved. Your player can see these drawings.");
    }
  };

  const hint =
    tool === "angle"
      ? pendingAngle
        ? "Now tap where the second arm ends"
        : "Drag from the joint along the first arm"
      : tool
        ? null
        : "Pick a tool to draw. Tap the video to play or pause.";

  return createPortal(
    <div className="fixed inset-0 z-[120] flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button type="button" onClick={close} className="rounded-full p-2 hover:bg-white/10" aria-label="Close">
          <X className="h-5 w-5" aria-hidden />
        </button>
        <p className="min-w-0 flex-1 truncate text-sm font-bold">{title}</p>
        {canSave && (
          <button
            type="button"
            onClick={() => void save()}
            disabled={!dirty || saving}
            className="rounded-full bg-[#FFA500] px-4 py-1.5 text-xs font-bold text-[#3d2600] disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save drawings"}
          </button>
        )}
      </div>
      {saveMsg && <p className="shrink-0 px-4 pb-1 text-center text-xs text-white/70">{saveMsg}</p>}

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 [container-type:size]">
        {error ? (
          <p className="max-w-xs text-center text-sm text-white/70">{error}</p>
        ) : !source ? (
          <Loader2 className="h-8 w-8 animate-spin text-white/60" aria-hidden />
        ) : (
          <div
            className="relative"
            style={{ aspectRatio: ratio, width: `min(100cqw, calc(100cqh * ${ratio}))` }}
          >
            <video
              ref={videoRef}
              playsInline
              preload="auto"
              className="absolute inset-0 h-full w-full bg-black"
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                if (v.videoWidth && v.videoHeight) setRatio(v.videoWidth / v.videoHeight);
                setDuration(v.duration || 0);
                v.playbackRate = speed;
              }}
              onDurationChange={(e) => setDuration(e.currentTarget.duration || 0)}
              onTimeUpdate={(e) => !playing && setCurrent(e.currentTarget.currentTime)}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
              onClick={togglePlay}
            />
            <svg
              viewBox={`0 0 ${VB_W} ${vbH}`}
              className={`absolute inset-0 h-full w-full touch-none ${tool ? "cursor-crosshair" : "pointer-events-none"}`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              {shapes.map((s) => (
                <ShapeView key={s.id} shape={s} vbH={vbH} />
              ))}
              {pendingAngle && <ShapeView shape={pendingAngle} vbH={vbH} />}
              {draft && <ShapeView shape={draft} vbH={vbH} />}
            </svg>
            {hint && (
              <p className="pointer-events-none absolute inset-x-0 top-2 mx-auto w-fit rounded-full bg-black/60 px-3 py-1 text-[11px] font-semibold">
                {hint}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 space-y-2 bg-stone-950 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={togglePlay}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-stone-950"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause className="h-5 w-5" aria-hidden /> : <Play className="ml-0.5 h-5 w-5" aria-hidden />}
          </button>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.001}
            value={Math.min(current, duration || 0)}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="Scrub through the video"
            className="h-2 min-w-0 flex-1 cursor-pointer accent-[#FFA500]"
          />
          <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-white/70">{formatTime(current)}</span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => step(-1)} className="rounded-full bg-white/10 p-2 hover:bg-white/20" aria-label="Back one frame">
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
            <span className="px-1 text-[10px] font-semibold uppercase tracking-wide text-white/50">Frame</span>
            <button type="button" onClick={() => step(1)} className="rounded-full bg-white/10 p-2 hover:bg-white/20" aria-label="Forward one frame">
              <ChevronRight className="h-5 w-5" aria-hidden />
            </button>
          </div>
          <div className="flex rounded-full bg-white/10 p-0.5">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => changeSpeed(s)}
                aria-pressed={speed === s}
                className={`rounded-full px-3 py-1 text-xs font-bold ${speed === s ? "bg-white text-stone-950" : "text-white/70"}`}
              >
                {s === 1 ? "1x" : s === 0.5 ? "½x" : "¼x"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-1 border-t border-white/10 pt-2">
          <div className="flex gap-0.5">
            {TOOLS.map((t) => (
              <ToolButton
                key={t.id}
                label={t.label}
                active={tool === t.id}
                onClick={() => {
                  setPendingAngle(null);
                  setTool((cur) => (cur === t.id ? null : t.id));
                }}
              >
                {t.icon}
              </ToolButton>
            ))}
          </div>
          <div className="flex gap-0.5">
            <ToolButton label="Undo" onClick={undo} disabled={!shapes.length && !pendingAngle}>
              <Undo2 className="h-5 w-5" aria-hidden />
            </ToolButton>
            <ToolButton label="Clear" onClick={clearAll} disabled={!shapes.length && !pendingAngle}>
              <Trash2 className="h-5 w-5" aria-hidden />
            </ToolButton>
          </div>
        </div>

        <div className="flex items-center justify-center gap-3">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`Colour ${c}`}
              aria-pressed={color === c}
              className={`h-7 w-7 rounded-full ring-2 ring-offset-2 ring-offset-stone-950 ${color === c ? "ring-white" : "ring-transparent"}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
