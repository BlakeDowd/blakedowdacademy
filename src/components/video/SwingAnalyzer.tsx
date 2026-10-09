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
  ZoomIn,
  ZoomOut,
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
const MAX_ZOOM = 5;
const HANDLE_HIT_PX = 28;
const PAN_SLOP_PX = 6;

/** Zoom level plus pan offset, as fractions of the stage size so it survives resizes. */
type View = { z: number; x: number; y: number };
type Gesture =
  | { kind: "pinch"; view: View; mid: Pt; dist: number }
  | { kind: "pan"; view: View; start: [number, number] };

const NO_ZOOM: View = { z: 1, x: 0, y: 0 };

const clampZoom = (z: number) => Math.max(1, Math.min(MAX_ZOOM, z));

function clampView(v: View): View {
  const z = clampZoom(v.z);
  const edge = (n: number) => Math.max(1 - z, Math.min(0, n));
  return { z, x: edge(v.x), y: edge(v.y) };
}

/** Zooms to `z` while keeping stage point `p` (0–1) fixed on screen. */
function zoomAround(v: View, z: number, p: Pt): View {
  const nz = clampZoom(z);
  return clampView({ z: nz, x: p[0] - ((p[0] - v.x) / v.z) * nz, y: p[1] - ((p[1] - v.y) / v.z) * nz });
}

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

/** Default second arm for a new angle: straight up or down from the joint, same length as the first arm. */
function verticalArm(v: Pt, a: Pt, vbH: number): Pt {
  const len = Math.hypot((a[0] - v[0]) * VB_W, (a[1] - v[1]) * vbH) / vbH;
  const y = a[1] <= v[1] ? v[1] - len : v[1] + len;
  return [v[0], Math.max(0, Math.min(1, y))];
}

/**
 * `u` is viewBox units per screen pixel, so dots and labels stay finger-sized at any screen size or zoom.
 * `handles` shows the draggable points used to adjust a shape.
 */
function ShapeView({ shape, vbH, u, handles }: { shape: Shape; vbH: number; u: number; handles?: boolean }) {
  const px = (p: Pt): [number, number] => [p[0] * VB_W, p[1] * vbH];
  const stroke = { stroke: shape.color, strokeWidth: 3, vectorEffect: "non-scaling-stroke" as const, fill: "none" };
  const dot = (p: [number, number], key: string | number, big = false) => (
    <circle
      key={key}
      cx={p[0]}
      cy={p[1]}
      r={(handles ? 9 : big ? 5 : 4) * u}
      fill={shape.color}
      stroke="rgba(0,0,0,0.6)"
      strokeWidth={1.5}
      vectorEffect="non-scaling-stroke"
    />
  );

  if (shape.kind === "pen") {
    return <polyline points={shape.pts.map((p) => px(p).join(",")).join(" ")} strokeLinecap="round" strokeLinejoin="round" {...stroke} />;
  }
  if (shape.kind === "circle") {
    const [c, e] = [px(shape.pts[0]!), px(shape.pts[1]!)];
    return (
      <g>
        <circle cx={c[0]} cy={c[1]} r={Math.hypot(e[0] - c[0], e[1] - c[1])} {...stroke} />
        {handles && [dot(c, "c"), dot(e, "e")]}
      </g>
    );
  }
  if (shape.kind === "line") {
    const [a, b] = [px(shape.pts[0]!), px(shape.pts[1]!)];
    return (
      <g>
        <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} strokeLinecap="round" {...stroke} />
        {dot(a, "a")}
        {dot(b, "b")}
      </g>
    );
  }

  if (shape.pts.length < 3) return null;
  const [v, a, b] = shape.pts.map(px) as [[number, number], [number, number], [number, number]];
  const deg = angleDegrees(shape.pts[0]!, shape.pts[1]!, shape.pts[2]!, vbH);
  const a1 = Math.atan2(a[1] - v[1], a[0] - v[0]);
  const a2 = Math.atan2(b[1] - v[1], b[0] - v[0]);
  let delta = a2 - a1;
  if (delta > Math.PI) delta -= 2 * Math.PI;
  if (delta < -Math.PI) delta += 2 * Math.PI;
  const arcR = 26 * u;
  const at = (ang: number, r: number) => [v[0] + r * Math.cos(ang), v[1] + r * Math.sin(ang)] as const;
  const [sx, sy] = at(a1, arcR);
  const [ex, ey] = at(a2, arcR);
  const [lx, ly] = at(a1 + delta / 2, arcR + 22 * u);
  return (
    <g>
      <polyline points={[a, v, b].map((p) => p.join(",")).join(" ")} strokeLinecap="round" strokeLinejoin="round" {...stroke} />
      {Math.abs(delta) > 0.01 && (
        <path d={`M ${sx} ${sy} A ${arcR} ${arcR} 0 0 ${delta > 0 ? 1 : 0} ${ex} ${ey}`} {...stroke} strokeWidth={2} />
      )}
      {dot(v, "v", true)}
      {handles && [dot(a, "a"), dot(b, "b")]}
      <text
        x={lx}
        y={ly}
        textAnchor="middle"
        dominantBaseline="central"
        fill={shape.color}
        fontSize={18 * u}
        fontWeight={800}
        stroke="rgba(0,0,0,0.75)"
        strokeWidth={4 * u}
        paintOrder="stroke"
      >
        {Math.round(deg)}°
      </text>
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
  const [editing, setEditing] = useState<{ id: string; idx: number; start: Pt; before: Shape[] } | null>(null);
  const [history, setHistory] = useState<Shape[][]>([]);
  const [stageW, setStageW] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [view, setView] = useState<View>(NO_ZOOM);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointers = useRef(new Map<number, [number, number]>());
  const gesture = useRef<Gesture | null>(null);
  const panned = useRef(false);
  const vbH = VB_W / ratio;
  const u = VB_W / Math.max(1, stageW * view.z);

  useAttachSource(videoRef, source);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const ro = new ResizeObserver(([entry]) => setStageW(entry?.contentRect.width ?? 0));
    ro.observe(stage);
    return () => ro.disconnect();
  }, [source, error]);

  const stagePoint = (clientX: number, clientY: number): Pt => {
    const r = stageRef.current?.getBoundingClientRect();
    if (!r || !r.width || !r.height) return [0.5, 0.5];
    return [(clientX - r.left) / r.width, (clientY - r.top) / r.height];
  };

  // Native listener so ctrl/trackpad-pinch wheel events can be stopped from zooming the whole page.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onWheel = (e: WheelEvent) => {
      const stage = stageRef.current;
      if (!stage || !stage.contains(e.target as Node) || !e.deltaY) return;
      e.preventDefault();
      const r = stage.getBoundingClientRect();
      const p: Pt = [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
      setView((v) => zoomAround(v, v.z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), p));
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
  }, []);

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

  const commit = (next: Shape[], before: Shape[] = shapes) => {
    setHistory((h) => [...h.slice(-49), before]);
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

  /** The nearest draggable point of an existing shape under the finger, newest shapes first. */
  const findHandle = (e: ReactPointerEvent<SVGSVGElement>): { id: string; idx: number } | null => {
    const rect = e.currentTarget.getBoundingClientRect();
    for (let s = shapes.length - 1; s >= 0; s--) {
      const shape = shapes[s]!;
      if (shape.kind === "pen") continue;
      let idx = -1;
      let nearest: number = HANDLE_HIT_PX;
      for (let i = 0; i < shape.pts.length; i++) {
        const p = shape.pts[i]!;
        const d = Math.hypot(rect.left + p[0] * rect.width - e.clientX, rect.top + p[1] * rect.height - e.clientY);
        if (d <= nearest) {
          nearest = d;
          idx = i;
        }
      }
      if (idx >= 0) return { id: shape.id, idx };
    }
    return null;
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!tool || pointers.current.size > 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toPoint(e);
    const hit = findHandle(e);
    if (hit) {
      setEditing({ ...hit, start: p, before: shapes });
      return;
    }
    setDraft({ id: newId(), kind: tool, color, pts: tool === "pen" ? [p] : tool === "angle" ? [p, p, p] : [p, p] });
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (editing) {
      const p = toPoint(e);
      const clamp = (n: number) => Math.max(0, Math.min(1, n));
      setShapes(
        editing.before.map((s) => {
          if (s.id !== editing.id) return s;
          // Dragging a circle's centre moves the whole circle; every other dot moves on its own.
          if (s.kind === "circle" && editing.idx === 0) {
            const dx = p[0] - editing.start[0];
            const dy = p[1] - editing.start[1];
            return { ...s, pts: s.pts.map(([x, y]) => [clamp(x + dx), clamp(y + dy)] as Pt) };
          }
          return { ...s, pts: s.pts.map((q, i) => (i === editing.idx ? p : q)) };
        }),
      );
      return;
    }
    if (!draft) return;
    const p = toPoint(e);
    setDraft((d) => {
      if (!d) return d;
      if (d.kind === "pen") return { ...d, pts: [...d.pts, p] };
      if (d.kind === "angle") return { ...d, pts: [d.pts[0]!, p, verticalArm(d.pts[0]!, p, vbH)] };
      return { ...d, pts: [d.pts[0]!, p] };
    });
  };

  const onPointerUp = () => {
    if (editing) {
      const before = editing.before;
      setEditing(null);
      if (shapes !== before) commit(shapes, before);
      return;
    }
    if (!draft) return;
    const d = draft;
    setDraft(null);
    if (d.kind === "pen") {
      if (d.pts.length > 1) commit([...shapes, d]);
      return;
    }
    if (lengthPx(d.pts[0]!, d.pts[1]!) > MIN_LEN) commit([...shapes, d]);
  };

  /** A second finger turns a half-drawn shape or dot drag into a pinch. */
  const cancelDraft = () => {
    if (editing) {
      setShapes(editing.before);
      setEditing(null);
    }
    setDraft(null);
  };

  const pinchFrom = (list: [number, number][]) => {
    const [a, b] = [list[0]!, list[1]!];
    return { mid: stagePoint((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), dist: Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1])) };
  };

  const onStageDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pointers.current.size === 0) panned.current = false;
    pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    const list = [...pointers.current.values()];
    if (list.length === 2) {
      cancelDraft();
      panned.current = true;
      gesture.current = { kind: "pinch", view, ...pinchFrom(list) };
      e.currentTarget.setPointerCapture(e.pointerId);
    } else if (list.length === 1 && !tool && view.z > 1) {
      gesture.current = { kind: "pan", view, start: [e.clientX, e.clientY] };
    }
  };

  const onStageMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pinch") {
      const list = [...pointers.current.values()];
      if (list.length < 2) return;
      const { mid, dist } = pinchFrom(list);
      const z = clampZoom((g.view.z * dist) / g.dist);
      setView(
        clampView({
          z,
          x: mid[0] - ((g.mid[0] - g.view.x) / g.view.z) * z,
          y: mid[1] - ((g.mid[1] - g.view.y) / g.view.z) * z,
        }),
      );
      return;
    }
    const dx = e.clientX - g.start[0];
    const dy = e.clientY - g.start[1];
    if (!panned.current) {
      if (Math.hypot(dx, dy) < PAN_SLOP_PX) return;
      panned.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    const r = e.currentTarget.getBoundingClientRect();
    setView(clampView({ ...g.view, x: g.view.x + dx / r.width, y: g.view.y + dy / r.height }));
  };

  const onStageUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    gesture.current = null;
  };

  const zoomBy = (factor: number) => setView((v) => zoomAround(v, v.z * factor, [0.5, 0.5]));

  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setShapes(prev);
    setDirty(true);
    setSaveMsg(null);
  };

  const clearAll = () => {
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
    editing || draft
      ? null
      : tool === "angle"
        ? "Drag from the joint along one arm, then drag the dots to adjust"
        : tool
          ? shapes.some((s) => s.kind !== "pen")
            ? "Drag a dot to adjust a shape"
            : null
          : view.z > 1
          ? null
          : "Pick a tool to draw. Tap to play, pinch to zoom.";

  return createPortal(
    <div
      ref={rootRef}
      className="fixed inset-0 z-[120] flex flex-col bg-black text-white"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
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

      <div className="relative flex min-h-0 flex-1 touch-none items-center justify-center px-2 [container-type:size]">
        {error ? (
          <p className="max-w-xs text-center text-sm text-white/70">{error}</p>
        ) : !source ? (
          <Loader2 className="h-8 w-8 animate-spin text-white/60" aria-hidden />
        ) : (
          <div
            ref={stageRef}
            className="relative touch-none overflow-hidden"
            style={{ aspectRatio: ratio, width: `min(100cqw, calc(100cqh * ${ratio}))` }}
            onPointerDown={onStageDown}
            onPointerMove={onStageMove}
            onPointerUp={onStageUp}
            onPointerCancel={onStageUp}
          >
            <div
              className="absolute inset-0 origin-top-left"
              style={{ transform: `translate(${view.x * 100}%, ${view.y * 100}%) scale(${view.z})` }}
            >
              <video
                ref={videoRef}
                playsInline
                preload="auto"
                className="absolute inset-0 h-full w-full bg-black"
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  if (v.videoWidth && v.videoHeight) setRatio(v.videoWidth / v.videoHeight);
                  setView(NO_ZOOM);
                  setDuration(v.duration || 0);
                  v.playbackRate = speed;
                }}
                onDurationChange={(e) => setDuration(e.currentTarget.duration || 0)}
                onTimeUpdate={(e) => !playing && setCurrent(e.currentTarget.currentTime)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
                onClick={() => {
                  if (!panned.current) togglePlay();
                }}
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
                  <ShapeView key={s.id} shape={s} vbH={vbH} u={u} handles={Boolean(tool)} />
                ))}
                {draft && <ShapeView shape={draft} vbH={vbH} u={u} handles />}
              </svg>
            </div>
            {hint && (
              <p className="pointer-events-none absolute inset-x-0 top-2 mx-auto w-fit rounded-full bg-black/60 px-3 py-1 text-[11px] font-semibold">
                {hint}
              </p>
            )}
            <div
              className="absolute bottom-2 right-2 flex flex-col items-center gap-1 rounded-full bg-black/60 p-1"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => zoomBy(1.5)}
                disabled={view.z >= MAX_ZOOM}
                className="rounded-full p-1.5 hover:bg-white/15 disabled:opacity-30"
                aria-label="Zoom in"
              >
                <ZoomIn className="h-5 w-5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setView(NO_ZOOM)}
                disabled={view.z === 1}
                className="min-w-9 rounded-full px-1 py-0.5 text-[10px] font-bold tabular-nums hover:bg-white/15 disabled:opacity-60"
                aria-label="Reset zoom"
              >
                {view.z.toFixed(1)}x
              </button>
              <button
                type="button"
                onClick={() => zoomBy(1 / 1.5)}
                disabled={view.z <= 1}
                className="rounded-full p-1.5 hover:bg-white/15 disabled:opacity-30"
                aria-label="Zoom out"
              >
                <ZoomOut className="h-5 w-5" aria-hidden />
              </button>
            </div>
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
                onClick={() => setTool((cur) => (cur === t.id ? null : t.id))}
              >
                {t.icon}
              </ToolButton>
            ))}
          </div>
          <div className="flex gap-0.5">
            <ToolButton label="Undo" onClick={undo} disabled={!history.length}>
              <Undo2 className="h-5 w-5" aria-hidden />
            </ToolButton>
            <ToolButton label="Clear" onClick={clearAll} disabled={!shapes.length}>
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
