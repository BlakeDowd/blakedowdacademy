"use client";

import { BRAND_ORANGE } from "@/components/combine/PuttingCombineUi";

/** Hero placement for any combine diagram: faded in the top-right corner of `CombineHero`. */
export const HERO_ART_CLASS = "absolute -right-3 -top-2 h-40 w-32 opacity-25";
/** Size for the diagram next to the current shot on the active screen. */
export const CARD_ART_CLASS = "h-28 w-[5.5rem] shrink-0";

function Flag({ x, y }: { x: number; y: number }) {
  return (
    <>
      <line x1={x} y1={y} x2={x} y2={y - 18} stroke="white" strokeWidth={1.5} />
      <path d={`M${x} ${y - 18} L${x + 12} ${y - 15} L${x} ${y - 12} Z`} fill={BRAND_ORANGE} />
      <circle cx={x} cy={y} r={3} fill="#0b2e18" />
    </>
  );
}

/** Bird's-eye chip: ball on the fringe, landing spot, roll out to the flag. `flop` lands it closer with less roll. */
export function ChipShotDiagram({ className = "", flop = false }: { className?: string; flop?: boolean }) {
  const land = flop ? 46 : 70;
  return (
    <svg viewBox="0 0 100 120" className={className} aria-hidden>
      <defs>
        <radialGradient id="chip-green" cx="50%" cy="35%" r="75%">
          <stop offset="0%" stopColor="#3fae62" />
          <stop offset="100%" stopColor="#1f7a3f" />
        </radialGradient>
      </defs>
      <rect x="2" y="2" width="96" height="116" rx="22" fill="#14592c" />
      <path d="M2 24 Q50 2 98 24 L98 92 Q50 104 2 92 Z" fill="url(#chip-green)" />
      <path d={`M50 106 Q50 ${land - 18} 50 ${land}`} fill="none" stroke="white" strokeOpacity={0.9} strokeWidth={3} strokeDasharray="1 6" strokeLinecap="round" />
      <path d={`M50 ${land} L50 34`} fill="none" stroke="white" strokeOpacity={0.55} strokeWidth={2} strokeLinecap="round" />
      <circle cx="50" cy={land} r="5" fill="none" stroke={BRAND_ORANGE} strokeWidth={2} />
      <Flag x={50} y={34} />
      <circle cx="50" cy="106" r="5" fill="white" />
    </svg>
  );
}

/** Bird's-eye bunker shot: ball in the sand at the bottom, splash out onto the green and the flag. */
export function BunkerShotDiagram({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 120" className={className} aria-hidden>
      <defs>
        <radialGradient id="bunker-green" cx="50%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#3fae62" />
          <stop offset="100%" stopColor="#1f7a3f" />
        </radialGradient>
      </defs>
      <rect x="2" y="2" width="96" height="116" rx="22" fill="#14592c" />
      <ellipse cx="50" cy="38" rx="40" ry="30" fill="url(#bunker-green)" />
      <path d="M10 92 Q22 74 50 78 Q80 74 90 92 Q84 112 50 112 Q16 112 10 92 Z" fill="#e8d3a0" stroke="#c9ad6d" strokeWidth={1.5} />
      <path d="M50 102 Q50 70 50 48" fill="none" stroke="white" strokeOpacity={0.9} strokeWidth={3} strokeDasharray="1 6" strokeLinecap="round" />
      <Flag x={50} y={40} />
      <circle cx="50" cy="102" r="5" fill="white" />
    </svg>
  );
}

/** Bird's-eye tee shot: tee box at the bottom, fairway corridor with a target line up the middle. */
export function TeeShotDiagram({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 120" className={className} aria-hidden>
      <rect x="2" y="2" width="96" height="116" rx="22" fill="#14592c" />
      <path d="M34 112 L22 8 L78 8 L66 112 Z" fill="#2f8f4e" />
      <path d="M30 70 L70 70 M27 44 L73 44 M24 20 L76 20" stroke="white" strokeOpacity={0.12} strokeWidth={8} />
      <path d="M50 104 L50 14" fill="none" stroke="white" strokeOpacity={0.9} strokeWidth={3} strokeDasharray="1 6" strokeLinecap="round" />
      <rect x="38" y="104" width="24" height="9" rx="2" fill="#3fae62" stroke="white" strokeOpacity={0.4} />
      <circle cx="50" cy="14" r="4" fill={BRAND_ORANGE} />
      <circle cx="50" cy="104" r="4" fill="white" />
    </svg>
  );
}
