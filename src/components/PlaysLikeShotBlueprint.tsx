"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Crosshair,
  Loader2,
  Mountain,
  Target,
  Wind,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { resolveAuthUserId } from "@/lib/resolveAuthUserId";
import {
  calculateDispersionWindow,
  calculatePlaysLikeTarget,
  clubsToCarryList,
  clubsToStrategicBag,
  DISPERSION_SKILL_LEVEL_OPTIONS,
  generateStrategicMenu,
  PLAYER_SHAPE_OPTIONS,
  SWING_LENGTH_LABELS,
  WIND_DIRECTION_OPTIONS,
  type DispersionSkillLevel,
  type PlayerShape,
  type StrategicMenu,
  type SwingLength,
  type TacticalShot,
  type WindDirection,
} from "@/lib/playsLikeCalculator";
import { fetchUserClubs } from "@/lib/playsLikeBag";
import type { PlaysLikeClubFormState } from "@/lib/playsLikeBag";

function parseInputNumber(value: string): number | null {
  const t = value.trim();
  if (t === "" || t === "." || t === "-") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex rounded-xl border border-gray-200 bg-gray-50 p-1">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={`flex-1 rounded-lg px-2 py-2.5 text-xs font-bold uppercase tracking-wide transition ${
            value === opt.id
              ? "bg-[#014421] text-white shadow-sm"
              : "text-gray-500 hover:text-gray-800"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function SkillAccuracyToggle({
  value,
  onChange,
}: {
  value: DispersionSkillLevel;
  onChange: (level: DispersionSkillLevel) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1">
      {DISPERSION_SKILL_LEVEL_OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={`rounded-lg px-1 py-2 text-[11px] font-bold uppercase tracking-wide transition sm:text-xs ${
            value === opt.id
              ? "bg-[#014421] text-white shadow-sm"
              : "text-gray-500 hover:text-gray-800"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function WindDirectionControl({
  value,
  onChange,
}: {
  value: WindDirection;
  onChange: (v: WindDirection) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1 sm:grid-cols-5">
      {WIND_DIRECTION_OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={`rounded-lg px-2 py-2.5 text-xs font-bold uppercase tracking-wide transition ${
            value === opt.id
              ? "bg-[#014421] text-white shadow-sm"
              : "text-gray-500 hover:text-gray-800"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function clampSlope(value: number): number {
  return Math.max(-20, Math.min(20, value));
}

const INPUT_CLASS =
  "w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold tabular-nums text-gray-900 outline-none focus:border-[#014421]/40 focus:ring-2 focus:ring-[#014421]/15";

type OptionSetKind = "standard" | "flight" | "grip" | "shape" | "tempo" | "swingLength";

const OPTION_SET_META: Record<
  OptionSetKind,
  { title: string; shortTitle: string; accent: string }
> = {
  standard: {
    title: "Standard shot",
    shortTitle: "Standard shot",
    accent: "border-[#014421]/20 bg-[#014421]/[0.04]",
  },
  flight: {
    title: "Option Set 2: Flight Control",
    shortTitle: "Flight",
    accent: "border-sky-100 bg-sky-50/30",
  },
  grip: {
    title: "Option Set 3: Grip Control",
    shortTitle: "Grip",
    accent: "border-cyan-100 bg-cyan-50/30",
  },
  shape: {
    title: "Option Set 4: Curvature & Shape Selection",
    shortTitle: "Shape",
    accent: "border-violet-100 bg-violet-50/30",
  },
  tempo: {
    title: "Option Set 5: Smooth Tempo Alternatives",
    shortTitle: "Tempo",
    accent: "border-amber-100 bg-amber-50/30",
  },
  swingLength: {
    title: "Option Set 6: Swing Length",
    shortTitle: "Swing length",
    accent: "border-emerald-100 bg-emerald-50/30",
  },
};

function buildExecutionBadges(shot: TacticalShot, kind: OptionSetKind): string[] {
  const badges: string[] = [];

  if (kind === "flight") {
    if (shot.flight !== "STANDARD") badges.push(`${shot.flight} flight`);
    if (shot.tempo !== "100%") badges.push(shot.tempo);
  }

  if (kind === "grip") {
    if (shot.grip !== "Full Grip") badges.push(shot.grip);
    if (shot.flight !== "STANDARD") badges.push(`${shot.flight} flight`);
  }

  if (kind === "shape") {
    if (shot.shape !== "Straight") badges.push(shot.shape);
    if (shot.flight !== "STANDARD") badges.push(`${shot.flight} flight`);
  }

  if (kind === "tempo") {
    const pctMatch = shot.tempo.match(/^(\d+)%/);
    if (pctMatch) {
      if (pctMatch[1] !== "100") {
        badges.push(`${pctMatch[1]}% tempo`);
        badges.push("Controlled");
      }
    } else {
      badges.push(shot.tempo);
      badges.push("Controlled");
    }
  }

  if (kind === "swingLength" && shot.swingLength) {
    badges.push("Tighter dispersion");
  }

  return badges.slice(0, 3);
}

function getPrimaryShotKind(shot: TacticalShot, kind: OptionSetKind): string {
  if (kind === "standard") {
    return shot.split ? "Split yardage" : "Full swing";
  }
  if (kind === "shape" && shot.shape !== "Straight") return shot.shape;
  if (kind === "swingLength" && shot.swingLength) {
    return SWING_LENGTH_LABELS[shot.swingLength];
  }
  if (kind === "tempo") {
    if (shot.split) return "Split yardage";
    const pctMatch = shot.tempo.match(/^(\d+)%/);
    if (pctMatch && pctMatch[1] === "100" && shot.flight === "STANDARD") return "Standard";
    if (pctMatch) return `${pctMatch[1]}% tempo`;
    return shot.tempo;
  }
  if (kind === "flight") {
    if (shot.split) return "Split yardage";
    if (shot.flight !== "STANDARD") return `${shot.flight} flight`;
    return "Standard flight";
  }
  if (kind === "grip") {
    if (shot.grip !== "Full Grip") return shot.grip;
    return "Full grip";
  }
  return buildExecutionBadges(shot, kind)[0] ?? "Standard";
}

function ShotKindBadge({ children, primary }: { children: string; primary?: boolean }) {
  if (primary) {
    return (
      <span className="inline-flex items-center rounded-md border border-[#014421]/25 bg-[#014421]/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[#014421]">
        {children}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-md border border-[#FFA500]/35 bg-[#FFA500]/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#b45309]">
      {children}
    </span>
  );
}

function formatShotCoachingNote(shot: TacticalShot, kind: OptionSetKind): string {
  if (shot.split) {
    return `${shot.distance}m Plays Like sits in the gap — take more club with a smooth swing, or less club with a firm strike.`;
  }
  const detail = shot.label.replace(/^[A-Z\s]+:\s*/i, "").trim();
  if (kind === "tempo" && detail.toLowerCase().includes("spin")) {
    return detail;
  }
  if (kind === "flight" && detail.toLowerCase().includes("stopping")) {
    return detail;
  }
  if (kind === "grip" && detail.toLowerCase().includes("choke")) {
    return detail;
  }
  if (kind === "shape") {
    if (shot.shape === "Draw") {
      return "Draw starts right and works back — useful when the pin is tucked on the left.";
    }
    if (shot.shape === "Fade") {
      return "Fade holds its line left-to-right — ideal when the flag is cut on the right side.";
    }
  }
  return detail || shot.label;
}

function StrategicShotPick({ shot, kind }: { shot: TacticalShot; kind: OptionSetKind }) {
  const primaryKind = getPrimaryShotKind(shot, kind);
  const badges = buildExecutionBadges(shot, kind).filter((b) => b !== primaryKind);
  const note = formatShotCoachingNote(shot, kind);

  return (
    <article className="rounded-lg border border-gray-100 bg-white px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold leading-tight text-gray-900">{shot.clubName}</p>
          {shot.split ? (
            <div className="mt-2 space-y-1.5">
              <p className="text-sm font-bold tabular-nums text-[#014421]">
                {shot.distance}m Plays Like target
              </p>
              <div className="space-y-1 text-xs sm:text-sm">
                <div className="flex items-baseline justify-between gap-3 rounded-md bg-gray-50 px-2.5 py-1.5">
                  <span className="font-semibold text-gray-800">{shot.split.lowerClubName}</span>
                  <span className="font-bold tabular-nums text-[#014421]">{shot.split.lowerDistance}m</span>
                </div>
                <div className="flex items-baseline justify-between gap-3 rounded-md bg-gray-50 px-2.5 py-1.5">
                  <span className="font-semibold text-gray-800">{shot.split.upperClubName}</span>
                  <span className="font-bold tabular-nums text-[#014421]">{shot.split.upperDistance}m</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-0.5 text-sm font-bold tabular-nums text-[#014421]">{shot.distance}m carry</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <ShotKindBadge primary>{primaryKind}</ShotKindBadge>
          {badges.map((badge) => (
            <ShotKindBadge key={`${shot.clubName}-${badge}`}>{badge}</ShotKindBadge>
          ))}
        </div>
      </div>
      {note ? (
        <p className="mt-2 line-clamp-2 text-[11px] leading-snug text-stone-500">{note}</p>
      ) : null}
    </article>
  );
}

function StrategicOptionSetColumn({
  kind,
  shots,
}: {
  kind: OptionSetKind;
  shots: TacticalShot[];
}) {
  const meta = OPTION_SET_META[kind];

  return (
    <div className={`rounded-xl border p-3 ${meta.accent}`}>
      <h4 className="text-[11px] font-bold uppercase tracking-wide text-gray-700">
        {meta.shortTitle}
      </h4>

      {shots.length === 0 ? (
        <p className="mt-2 text-[11px] leading-snug text-stone-500">
          No match — adjust inputs or bag carries.
        </p>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          {shots.map((shot, i) => (
            <StrategicShotPick
              key={`${kind}-${shot.clubName}-${shot.grip}-${shot.flight}-${shot.tempo}-${i}`}
              shot={shot}
              kind={kind}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StrategicDecisionMatrix({
  menu,
  playsLikeBase,
  dispersionSwingLength,
  windSpeed,
  windDirection,
  skillLevel,
  onSkillLevelChange,
}: {
  menu: StrategicMenu;
  playsLikeBase: number | null;
  dispersionSwingLength: SwingLength;
  windSpeed: number;
  windDirection: WindDirection;
  skillLevel: DispersionSkillLevel;
  onSkillLevelChange: (level: DispersionSkillLevel) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <StrategicOptionSetColumn kind="standard" shots={menu.standardOptions} />
      <StrategicOptionSetColumn kind="flight" shots={menu.flightOptions} />
      <StrategicOptionSetColumn kind="grip" shots={menu.gripOptions} />
      <StrategicOptionSetColumn kind="shape" shots={menu.shapeOptions} />
      <StrategicOptionSetColumn kind="tempo" shots={menu.tempoOptions} />
      <StrategicOptionSetColumn kind="swingLength" shots={menu.swingLengthOptions} />
      <DispersionWindow
        playsLikeBase={playsLikeBase}
        swingLength={dispersionSwingLength}
        windSpeed={windSpeed}
        windDirection={windDirection}
        skillLevel={skillLevel}
        onSkillLevelChange={onSkillLevelChange}
      />
    </div>
  );
}

function DispersionAxisArrow({
  direction,
  label,
  className,
}: {
  direction: "left" | "right" | "up" | "down";
  label: string;
  className?: string;
}) {
  const Icon =
    direction === "left"
      ? ArrowLeft
      : direction === "right"
        ? ArrowRight
        : direction === "up"
          ? ArrowUp
          : ArrowDown;

  return (
    <div
      className={`flex items-center gap-0.5 whitespace-nowrap rounded-md bg-white px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-600 shadow-sm ring-1 ring-slate-200 sm:text-[11px] ${className ?? ""}`}
    >
      {direction === "left" || direction === "up" ? (
        <>
          <Icon className="h-3 w-3 shrink-0" aria-hidden />
          <span>{label}</span>
        </>
      ) : (
        <>
          <span>{label}</span>
          <Icon className="h-3 w-3 shrink-0" aria-hidden />
        </>
      )}
    </div>
  );
}

function DispersionWindow({
  playsLikeBase,
  swingLength,
  windSpeed,
  windDirection,
  skillLevel,
  onSkillLevelChange,
}: {
  playsLikeBase: number | null;
  swingLength: SwingLength;
  windSpeed: number;
  windDirection: WindDirection;
  skillLevel: DispersionSkillLevel;
  onSkillLevelChange: (level: DispersionSkillLevel) => void;
}) {
  const dispersion = useMemo(() => {
    if (playsLikeBase == null || playsLikeBase <= 0) return null;
    return calculateDispersionWindow({
      playsLikeBase,
      windSpeed,
      windDirection,
      skillLevel,
      swingLength,
    });
  }, [playsLikeBase, windSpeed, windDirection, skillLevel, swingLength]);

  if (dispersion == null) return null;

  const {
    optimalTargetDisplay,
    longLeftDistance,
    shortRightDistance,
    avgSideMeters,
    totalLateralDispersion,
    totalVerticalDispersion,
    longCarrySpread,
    shortCarrySpread,
    shortRightLateral,
  } = dispersion;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <h3 className="text-sm font-semibold text-gray-900">Dispersion window</h3>

      <div className="mt-3">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          Skill accuracy
        </p>
        <SkillAccuracyToggle value={skillLevel} onChange={onSkillLevelChange} />
      </div>

      <div className="mt-4">
        <div className="flex justify-start">
          <div className="whitespace-nowrap rounded-lg border border-red-200 bg-red-100 px-3 py-2 text-red-700 shadow-md">
            <p className="whitespace-nowrap text-xs font-bold uppercase tracking-wider">
              Long-Left Miss
            </p>
            <p className="mt-0.5 whitespace-nowrap text-lg font-bold tabular-nums">
              {longLeftDistance}m Carry
            </p>
            <p className="mt-0.5 whitespace-nowrap text-xs font-medium tabular-nums">
              Avg Left: {avgSideMeters}m
            </p>
          </div>
        </div>

        <div className="relative mx-auto mt-3 h-48 w-full max-w-xl sm:mt-4 sm:h-52">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 h-28 w-[88%] -translate-x-1/2 -translate-y-1/2 rotate-[30deg] rounded-[50%] border-2 border-dashed border-slate-300 bg-gradient-to-b from-slate-50 to-slate-100/80 sm:h-32"
          />

          <div className="absolute left-0 top-1/2 flex -translate-y-1/2 flex-col items-center gap-1.5 sm:left-1">
            <DispersionAxisArrow direction="up" label={`${longCarrySpread}m`} />
            <div className="flex flex-col items-center gap-1">
              <div className="h-6 w-px bg-slate-300" aria-hidden />
              <span className="whitespace-nowrap rounded-md bg-white px-2.5 py-1 text-xs font-bold tabular-nums text-slate-800 shadow-sm ring-1 ring-slate-200 sm:text-sm">
                {totalVerticalDispersion}m
              </span>
              <div className="h-6 w-px bg-slate-300" aria-hidden />
            </div>
            <DispersionAxisArrow direction="down" label={`${shortCarrySpread}m`} />
          </div>

          <div className="absolute bottom-0 left-1/2 flex -translate-x-1/2 items-center gap-2 pb-0.5 sm:gap-2.5">
            <DispersionAxisArrow direction="left" label={`${avgSideMeters}m`} />
            <div className="flex items-center gap-1.5">
              <div className="h-px w-8 bg-slate-300 sm:w-12" aria-hidden />
              <span className="whitespace-nowrap rounded-md bg-white px-2.5 py-1 text-xs font-bold tabular-nums text-slate-800 shadow-sm ring-1 ring-slate-200 sm:text-sm">
                {totalLateralDispersion}m
              </span>
              <div className="h-px w-8 bg-slate-300 sm:w-12" aria-hidden />
            </div>
            <DispersionAxisArrow direction="right" label={`${avgSideMeters}m`} />
          </div>

          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="flex flex-col items-center justify-center rounded-full bg-white/95 px-5 py-4 text-center shadow-sm ring-1 ring-[#014421]/15">
              <p className="whitespace-nowrap text-xl font-bold tabular-nums tracking-tight text-[#014421] sm:text-2xl">
                {optimalTargetDisplay}m
              </p>
              <p className="mt-1 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-[#014421]/70">
                Plays Like
              </p>
            </div>
          </div>
        </div>

        <div className="mt-3 flex justify-end sm:mt-4">
          <div className="whitespace-nowrap rounded-lg border border-orange-200 bg-orange-100 px-3 py-2 text-orange-800 shadow-md">
            <p className="whitespace-nowrap text-xs font-bold uppercase tracking-wider">
              Short-Right Miss
            </p>
            <p className="mt-0.5 whitespace-nowrap text-lg font-bold tabular-nums">
              {shortRightDistance}m Carry
            </p>
            <p className="mt-0.5 whitespace-nowrap text-xs font-medium tabular-nums">
              Avg Right: {avgSideMeters}m
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-2.5 rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-3 text-[11px] leading-relaxed text-gray-600 sm:px-4 sm:py-3.5 sm:text-xs">
        <p>
          <span className="font-semibold text-gray-800">💡 WHY THIS HAPPENS:</span>{" "}
          Dynamic changes in spin loft shape this grid. A closed face lowers dynamic loft,
          spiking distance long-left. An open face creates a high-spin wipe that stalls out
          short-right.
        </p>
        <p>
          <span className="font-semibold text-gray-800">🎯 AIMING RULE:</span> If the hazard
          is right, shift your target center {shortRightLateral}m left to protect your score.
        </p>
      </div>
    </section>
  );
}

export function PlaysLikeCalculator({
  liveBagClubs,
}: {
  liveBagClubs?: PlaysLikeClubFormState[];
} = {}) {
  const { user } = useAuth();
  const useLiveBag = liveBagClubs != null;
  const [loadingClubs, setLoadingClubs] = useState(!useLiveBag);
  const [carryClubs, setCarryClubs] = useState<
    ReturnType<typeof clubsToCarryList>
  >(() => (useLiveBag ? clubsToCarryList(liveBagClubs) : []));

  const [targetText, setTargetText] = useState("150");
  const [slopeText, setSlopeText] = useState("0");
  const [windSpeedText, setWindSpeedText] = useState("0");
  const [windDirection, setWindDirection] = useState<WindDirection>("none");
  const [playerShape, setPlayerShape] = useState<PlayerShape>("straight");
  const [skillLevel, setSkillLevel] = useState<DispersionSkillLevel>("bGrade");

  useEffect(() => {
    if (useLiveBag) {
      setCarryClubs(clubsToCarryList(liveBagClubs));
      setLoadingClubs(false);
      return;
    }

    let cancelled = false;
    async function load() {
      if (!user?.id) {
        setLoadingClubs(false);
        return;
      }
      setLoadingClubs(true);
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const uid = await resolveAuthUserId(supabase);
        if (!uid || cancelled) return;
        const rows = await fetchUserClubs(supabase, uid);
        if (cancelled) return;
        setCarryClubs(clubsToCarryList(rows));
      } catch (err) {
        console.warn("[ShotBlueprint] load clubs:", err);
      } finally {
        if (!cancelled) setLoadingClubs(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user?.id, useLiveBag, liveBagClubs]);

  const targetDistance = parseInputNumber(targetText) ?? 0;
  const slopeMetres = clampSlope(parseInputNumber(slopeText) ?? 0);
  const windSpeed = Math.max(0, parseInputNumber(windSpeedText) ?? 0);

  const shotInputs = useMemo(
    () => ({
      targetDistanceMetres: targetDistance,
      slopeMetres,
      windSpeed,
      windDirection,
    }),
    [targetDistance, slopeMetres, windSpeed, windDirection],
  );

  const playsLikeTarget = useMemo(
    () => calculatePlaysLikeTarget(shotInputs),
    [shotInputs],
  );

  const strategicMenu = useMemo(() => {
    if (targetDistance <= 0) {
      return {
        standardOptions: [],
        flightOptions: [],
        gripOptions: [],
        shapeOptions: [],
        tempoOptions: [],
        swingLengthOptions: [],
      };
    }
    return generateStrategicMenu(
      targetDistance,
      slopeMetres,
      windSpeed,
      windDirection,
      clubsToStrategicBag(carryClubs),
      { playerShape },
    );
  }, [targetDistance, slopeMetres, windSpeed, windDirection, carryClubs, playerShape]);

  const dispersionSwingLength =
    strategicMenu.swingLengthOptions[0]?.swingLength ?? ("full" as SwingLength);

  const slopeClamped = slopeMetres;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 pb-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
          Shot shape
        </p>
        <SegmentedToggle
          options={PLAYER_SHAPE_OPTIONS}
          value={playerShape}
          onChange={setPlayerShape}
        />
      </section>

      <div className="space-y-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#014421]/80">
          Shot blueprint
        </p>
        <h2 className="text-lg font-bold tracking-tight text-stone-900 sm:text-xl">
          Plays Like calculator
        </h2>
        <p className="text-sm leading-relaxed text-stone-600">
          Enter pin distance, slope, and wind — get flight, shape, and tempo options from your bag.
        </p>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex items-center gap-2">
          <Crosshair className="h-4 w-4 text-[#014421]" aria-hidden />
          <h3 className="text-sm font-semibold text-gray-900">Shot inputs</h3>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="pl-target"
              className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500"
            >
              <Target className="h-3.5 w-3.5" aria-hidden />
              Target distance
            </label>
            <div className="relative">
              <input
                id="pl-target"
                type="number"
                inputMode="decimal"
                min={1}
                value={targetText}
                onChange={(e) => setTargetText(e.target.value)}
                className={`${INPUT_CLASS} pr-12`}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase text-gray-400">
                m
              </span>
            </div>
          </div>

          <div>
            <label
              htmlFor="pl-wind-speed"
              className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500"
            >
              <Wind className="h-3.5 w-3.5" aria-hidden />
              Wind speed
            </label>
            <div className="relative">
              <input
                id="pl-wind-speed"
                type="number"
                inputMode="decimal"
                min={0}
                value={windSpeedText}
                onChange={(e) => setWindSpeedText(e.target.value)}
                className={`${INPUT_CLASS} pr-14`}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase text-gray-400">
                km/h
              </span>
            </div>
          </div>

          <div className="sm:col-span-2">
            <label
              htmlFor="pl-slope"
              className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500"
            >
              <Mountain className="h-3.5 w-3.5" aria-hidden />
              Slope / elevation change
            </label>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                id="pl-slope"
                type="range"
                min={-20}
                max={20}
                step={1}
                value={slopeClamped}
                onChange={(e) => setSlopeText(e.target.value)}
                className="h-2 min-w-0 flex-1 cursor-pointer accent-[#014421]"
              />
              <div className="relative w-full sm:w-28">
                <input
                  id="pl-slope-value"
                  type="number"
                  inputMode="decimal"
                  min={-20}
                  max={20}
                  value={slopeText}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setSlopeText(raw);
                    const n = parseInputNumber(raw);
                    if (n != null && n > 20) setSlopeText("20");
                    if (n != null && n < -20) setSlopeText("-20");
                  }}
                  onBlur={() => {
                    const n = parseInputNumber(slopeText);
                    if (n == null) return;
                    setSlopeText(String(clampSlope(n)));
                  }}
                  className={`${INPUT_CLASS} pr-10`}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase text-gray-400">
                  m
                </span>
              </div>
            </div>
            <p className="mt-1.5 text-[10px] text-gray-500">
              Positive = uphill to the target (max 20m) · negative = downhill
            </p>
          </div>

          <div className="sm:col-span-2">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              Wind direction
            </p>
            <WindDirectionControl value={windDirection} onChange={setWindDirection} />
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-gradient-to-br from-[#014421]/[0.07] to-transparent px-4 py-4 text-center sm:px-5 sm:py-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">
            Plays Like target
          </p>
          {playsLikeTarget != null ? (
            <p className="mt-1.5 text-4xl font-bold tabular-nums tracking-tight text-[#014421] sm:text-5xl">
              {playsLikeTarget}
              <span className="ml-1.5 text-xl font-semibold text-gray-400 sm:text-2xl">m</span>
            </p>
          ) : (
            <p className="mt-1.5 text-xl font-semibold text-gray-400">—</p>
          )}
          {targetDistance > 0 && playsLikeTarget != null ? (
            <p className="mt-2 text-xs text-gray-500">
              From {targetDistance}m pin
              {slopeMetres !== 0 ? ` · ${slopeMetres > 0 ? "+" : ""}${slopeMetres}m slope` : ""}
              {windDirection !== "none" && windSpeed > 0
                ? ` · ${windSpeed} km/h ${windDirection}`
                : ""}
            </p>
          ) : null}
        </div>

        <div className="p-4 sm:p-5">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-gray-900">Your options</h3>
            <p className="text-[11px] text-gray-500">
              Flight &amp; grip, shape, or tempo — pick the trade-off that fits the hole.
            </p>
          </div>

          {loadingClubs ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-7 w-7 animate-spin text-[#014421]" aria-hidden />
            </div>
          ) : carryClubs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center">
              <p className="text-sm text-stone-600">
                Add carry distances in your bag profile to see club recommendations.
              </p>
              <Link
                href="/virtual-caddie/bag"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#014421] hover:underline"
              >
                Set up my bag
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          ) : (
            <StrategicDecisionMatrix
              menu={strategicMenu}
              playsLikeBase={playsLikeTarget}
              dispersionSwingLength={dispersionSwingLength}
              windSpeed={windSpeed}
              windDirection={windDirection}
              skillLevel={skillLevel}
              onSkillLevelChange={setSkillLevel}
            />
          )}
        </div>
      </section>
    </div>
  );
}
