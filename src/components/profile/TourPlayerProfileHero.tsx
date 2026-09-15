"use client";

import { GOLF_ICONS } from "@/components/IconPicker";
import { User } from "lucide-react";

type TourPlayerProfileHeroProps = {
  playerName: string;
  rank: number | null;
  handicap: number | null | undefined;
  trophies: number;
  practiceHours: number;
  preferredIconId?: string | null;
};

function formatHandicap(h: number | null | undefined): string {
  if (h == null || !Number.isFinite(h)) return "—";
  if (h < 0) return `+${Math.abs(h).toFixed(1)}`;
  return h.toFixed(1);
}

function formatRank(rank: number | null): string {
  if (rank == null || rank <= 0) return "—";
  return `#${rank}`;
}

export function TourPlayerProfileHero({
  playerName,
  rank,
  handicap,
  trophies,
  practiceHours,
  preferredIconId,
}: TourPlayerProfileHeroProps) {
  const iconId = preferredIconId === "flame" ? null : preferredIconId;
  const SelectedIcon = iconId
    ? GOLF_ICONS.find((icon) => icon.id === iconId)?.icon
    : undefined;

  const stats = [
    { label: "Handicap", value: formatHandicap(handicap) },
    { label: "Trophies", value: String(trophies) },
    { label: "Rank", value: formatRank(rank) },
    {
      label: "Practice Hours",
      value: practiceHours > 0 ? practiceHours.toFixed(1) : "0",
    },
  ];

  return (
    <section
      className="relative overflow-hidden rounded-3xl text-white shadow-lg"
      style={{
        background:
          "linear-gradient(145deg, #013320 0%, #014421 42%, #0a5c32 78%, #146b3a 100%)",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 80% 60% at 100% -10%, rgba(255,165,0,0.35), transparent 55%), radial-gradient(ellipse 50% 40% at 0% 100%, rgba(255,255,255,0.08), transparent 50%)",
        }}
        aria-hidden
      />

      <div className="relative px-5 pb-5 pt-6 sm:px-6">
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/15 ring-2 ring-white/25 shadow-inner">
            {SelectedIcon ? (
              <SelectedIcon className="h-10 w-10 text-[#FFA500]" strokeWidth={2.25} />
            ) : (
              <User className="h-10 w-10 text-white/80" strokeWidth={2} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
              Player profile
            </p>
            <h1 className="mt-1 truncate text-2xl font-bold tracking-tight text-white sm:text-[1.75rem]">
              {playerName}
            </h1>
            <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-black/20 px-3 py-1 text-xs font-semibold text-[#FFA500] ring-1 ring-white/10">
              <span className="h-1.5 w-1.5 rounded-full bg-[#FFA500]" aria-hidden />
              Rank {formatRank(rank)}
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-4 gap-1 rounded-2xl bg-black/20 p-2 ring-1 ring-white/10 backdrop-blur-[2px] sm:gap-2 sm:p-3">
          {stats.map((stat) => (
            <div key={stat.label} className="flex min-w-0 flex-col items-center px-0.5 py-2 text-center">
              <span className="text-base font-bold tabular-nums tracking-tight text-white sm:text-lg">
                {stat.value}
              </span>
              <span className="mt-1 text-[9px] font-semibold uppercase leading-tight tracking-wide text-white/55 sm:text-[10px]">
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

type ProfileTab = "stats" | "practice" | "swings" | "feedback";

const PROFILE_TABS: { id: ProfileTab; label: string }[] = [
  { id: "stats", label: "Stats" },
  { id: "practice", label: "Practice" },
  { id: "swings", label: "Swings" },
  { id: "feedback", label: "Feedback" },
];

export function ProfileSegmentedTabs({
  value,
  onChange,
}: {
  value: ProfileTab;
  onChange: (tab: ProfileTab) => void;
}) {
  return (
    <div
      className="grid grid-cols-2 gap-1 rounded-2xl bg-stone-200/80 p-1 sm:grid-cols-4"
      role="tablist"
      aria-label="Profile sections"
    >
      {PROFILE_TABS.map((tab) => {
        const active = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={`rounded-xl px-2 py-2.5 text-xs font-semibold transition-all sm:px-3 sm:text-sm ${
              active
                ? "bg-white text-[#014421] shadow-sm"
                : "text-stone-600 hover:text-stone-900"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export type { ProfileTab };
