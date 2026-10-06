"use client";

import { useId } from "react";
import {
  Activity,
  Award,
  Clover,
  Cloud,
  Compass,
  Crown,
  Dumbbell,
  Flag,
  Flame,
  Heart,
  MapPin,
  Medal,
  Star,
  Target,
  Timer,
  Trophy,
  Waves,
  Zap,
  type LucideIcon,
} from "lucide-react";

type EmblemShape = "shield" | "crest" | "hexagon" | "roundel";

export type Emblem = {
  id: string;
  name: string;
  icon: LucideIcon;
  shape: EmblemShape;
  /** Gradient from light (top) to dark (bottom). */
  colors: [string, string];
};

/** Ids match what's already stored in profiles.preferred_icon_id, so existing picks keep working. */
export const EMBLEMS: readonly Emblem[] = [
  { id: "golf-flag", name: "Pin High", icon: Flag, shape: "shield", colors: ["#1f9d55", "#014421"] },
  { id: "trophy", name: "Champion", icon: Trophy, shape: "crest", colors: ["#f8d34a", "#b7791f"] },
  { id: "target", name: "Dead Aim", icon: Target, shape: "roundel", colors: ["#f05252", "#9b1c1c"] },
  { id: "star", name: "All-Star", icon: Star, shape: "hexagon", colors: ["#ffb83d", "#d97706"] },
  { id: "medal", name: "Medallist", icon: Medal, shape: "roundel", colors: ["#d9965b", "#8a4b1c"] },
  { id: "crown", name: "Royal", icon: Crown, shape: "shield", colors: ["#9f7aea", "#4c1d95"] },
  { id: "zap", name: "Power", icon: Zap, shape: "hexagon", colors: ["#4fc3f7", "#1d4ed8"] },
  { id: "activity", name: "Grinder", icon: Activity, shape: "crest", colors: ["#2dd4bf", "#0f766e"] },
  { id: "award", name: "Honours", icon: Award, shape: "shield", colors: ["#60a5fa", "#1e3a8a"] },
  { id: "dumbbell", name: "Strength", icon: Dumbbell, shape: "hexagon", colors: ["#7c8ba1", "#1e293b"] },
  { id: "timer", name: "Tempo", icon: Timer, shape: "roundel", colors: ["#22d3ee", "#0e7490"] },
  { id: "clover", name: "Lucky Bounce", icon: Clover, shape: "roundel", colors: ["#4ade80", "#047857"] },
  { id: "waves", name: "Links", icon: Waves, shape: "crest", colors: ["#38bdf8", "#075985"] },
  { id: "cloud", name: "Sky High", icon: Cloud, shape: "roundel", colors: ["#a5c8ff", "#3b6fd8"] },
  { id: "fire", name: "On Fire", icon: Flame, shape: "shield", colors: ["#fb923c", "#c2410c"] },
  { id: "heart", name: "For the Love", icon: Heart, shape: "crest", colors: ["#fb7185", "#be123c"] },
  { id: "compass", name: "Course Manager", icon: Compass, shape: "hexagon", colors: ["#d8b878", "#8a6a2f"] },
  { id: "map-pin", name: "Home Course", icon: MapPin, shape: "shield", colors: ["#5bd68a", "#166534"] },
];

const SHAPE_PATHS: Record<EmblemShape, string> = {
  shield: "M50 4 L90 15 V47 C90 72 73 89 50 97 C27 89 10 72 10 47 V15 Z",
  crest: "M14 10 H86 V54 C86 76 70 91 50 97 C30 91 14 76 14 54 Z",
  hexagon: "M50 3 L91 26.5 V73.5 L50 97 L9 73.5 V26.5 Z",
  roundel: "M50 4 A46 46 0 1 1 49.99 4 Z",
};

/** Where the icon sits vertically, so it looks centred inside pointed-bottom shapes. */
const ICON_CENTER_Y: Record<EmblemShape, number> = { shield: 46, crest: 48, hexagon: 50, roundel: 50 };

export function getEmblem(id: string | null | undefined): Emblem | undefined {
  return id ? EMBLEMS.find((e) => e.id === id) : undefined;
}

export function EmblemBadge({ emblem, size = 48, className = "" }: { emblem: Emblem; size?: number; className?: string }) {
  const uid = useId().replace(/:/g, "");
  const path = SHAPE_PATHS[emblem.shape];
  const Icon = emblem.icon;
  const iconSize = Math.round(size * 0.46);

  return (
    <span className={`relative inline-block shrink-0 ${className}`} style={{ width: size, height: size }} role="img" aria-label={emblem.name}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full drop-shadow-sm" aria-hidden>
        <defs>
          <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={emblem.colors[0]} />
            <stop offset="100%" stopColor={emblem.colors[1]} />
          </linearGradient>
          <linearGradient id={`${uid}-shine`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="0.45" />
            <stop offset="55%" stopColor="white" stopOpacity="0" />
          </linearGradient>
          <clipPath id={`${uid}-clip`}>
            <path d={path} />
          </clipPath>
        </defs>
        <path d={path} fill={`url(#${uid}-fill)`} />
        <rect x="0" y="0" width="100" height="52" fill={`url(#${uid}-shine)`} clipPath={`url(#${uid}-clip)`} />
        <path d={path} fill="none" stroke="white" strokeOpacity="0.55" strokeWidth="3.5" transform="translate(9 9) scale(0.82)" />
        <path d={path} fill="none" stroke="black" strokeOpacity="0.18" strokeWidth="2" />
      </svg>
      <Icon
        className="absolute text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]"
        style={{
          width: iconSize,
          height: iconSize,
          left: (size - iconSize) / 2,
          top: (ICON_CENTER_Y[emblem.shape] / 100) * size - iconSize / 2,
        }}
        strokeWidth={2.4}
        aria-hidden
      />
    </span>
  );
}
