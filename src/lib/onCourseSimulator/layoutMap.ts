import type { HoleData, Vec2 } from "./types";

export type Uv = { u: number; v: number };

export type LayoutBasis = {
  tee: Uv;
  /** Metres per unit of UV along the tee→pin axis. */
  mPerUv: number;
  fU: number;
  fV: number;
  rU: number;
  rV: number;
};

export type LayoutDraw = {
  dx: number;
  dy: number;
  drawW: number;
  drawH: number;
  srcW: number;
  srcH: number;
  basis: LayoutBasis;
};

/** True when this hole has calibrated map anchors. */
export function hasLayoutAnchors(hole: HoleData): boolean {
  return Boolean(hole.layoutImage && hole.layoutTeeUv && hole.layoutPinUv);
}

export function layoutBasis(hole: HoleData): LayoutBasis | null {
  const tee = hole.layoutTeeUv;
  const pin = hole.layoutPinUv;
  if (!tee || !pin) return null;
  const du = pin.u - tee.u;
  const dv = pin.v - tee.v;
  const uvLen = Math.hypot(du, dv);
  if (uvLen < 1e-6) return null;
  const fU = du / uvLen;
  const fV = dv / uvLen;
  // Image (u right, v down): right-of-play when facing the pin.
  const rU = -fV;
  const rV = fU;
  const playM = Math.hypot(hole.pin.x - hole.tee.x, hole.pin.y - hole.tee.y) || hole.yardageM;
  return { tee, mPerUv: playM / uvLen, fU, fV, rU, rV };
}

export function uvToWorld(basis: LayoutBasis, uv: Uv, teeWorld: Vec2 = { x: 0, y: 0 }): Vec2 {
  const relU = uv.u - basis.tee.u;
  const relV = uv.v - basis.tee.v;
  const along = (relU * basis.fU + relV * basis.fV) * basis.mPerUv;
  const across = (relU * basis.rU + relV * basis.rV) * basis.mPerUv;
  return { x: teeWorld.x + across, y: teeWorld.y + along };
}

export function worldToUv(basis: LayoutBasis, p: Vec2, teeWorld: Vec2 = { x: 0, y: 0 }): Uv {
  const x = p.x - teeWorld.x;
  const y = p.y - teeWorld.y;
  return {
    u: basis.tee.u + (y / basis.mPerUv) * basis.fU + (x / basis.mPerUv) * basis.rU,
    v: basis.tee.v + (y / basis.mPerUv) * basis.fV + (x / basis.mPerUv) * basis.rV,
  };
}

/** Contain the map crop in the canvas (letterbox). */
export function layoutDrawRect(
  img: HTMLImageElement,
  mapFrac: number,
  viewW: number,
  viewH: number,
  pad = 0,
): Omit<LayoutDraw, "basis"> | null {
  if (!img.complete || img.naturalWidth <= 0) return null;
  const srcW = img.naturalWidth;
  const srcH = Math.max(1, Math.floor(img.naturalHeight * mapFrac));
  // Contain: keep full tee→green map visible (letterbox sides on wide canvases).
  const scale = Math.min(viewW / srcW, viewH / srcH) * (1 - pad);
  const drawW = srcW * scale;
  const drawH = srcH * scale;
  return {
    dx: (viewW - drawW) / 2,
    dy: (viewH - drawH) / 2,
    drawW,
    drawH,
    srcW,
    srcH,
  };
}

export function makeLayoutDraw(
  hole: HoleData,
  img: HTMLImageElement,
  viewW: number,
  viewH: number,
): LayoutDraw | null {
  const basis = layoutBasis(hole);
  if (!basis) return null;
  const rect = layoutDrawRect(img, hole.layoutMapFraction ?? 0.62, viewW, viewH);
  if (!rect) return null;
  return { ...rect, basis };
}

export function worldToScreenLayout(p: Vec2, hole: HoleData, layout: LayoutDraw): Vec2 {
  const uv = worldToUv(layout.basis, p, hole.tee);
  return {
    x: layout.dx + uv.u * layout.drawW,
    y: layout.dy + uv.v * layout.drawH,
  };
}

export function screenToWorldLayout(p: Vec2, hole: HoleData, layout: LayoutDraw): Vec2 {
  const u = (p.x - layout.dx) / layout.drawW;
  const v = (p.y - layout.dy) / layout.drawH;
  return uvToWorld(layout.basis, { u, v }, hole.tee);
}

/** Bounds in metres that cover the full map crop. */
export function boundsFromLayout(hole: HoleData): HoleData["bounds"] | null {
  const basis = layoutBasis(hole);
  if (!basis) return null;
  const corners: Uv[] = [
    { u: 0, v: 0 },
    { u: 1, v: 0 },
    { u: 0, v: 1 },
    { u: 1, v: 1 },
  ];
  const pts = corners.map((uv) => uvToWorld(basis, uv, hole.tee));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

export function ovalPoly(c: Vec2, rx: number, ry: number, n = 20): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push({ x: c.x + Math.cos(a) * rx, y: c.y + Math.sin(a) * ry });
  }
  return out;
}

/** Convert a UV polygon (map crop) into world metres for zones. */
export function uvPolyToWorld(hole: HoleData, uvs: Uv[]): Vec2[] {
  const basis = layoutBasis(hole);
  if (!basis) return [];
  return uvs.map((uv) => uvToWorld(basis, uv, hole.tee));
}
