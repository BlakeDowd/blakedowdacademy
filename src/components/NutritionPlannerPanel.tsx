"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildFuelScheduleRows,
  computePerformanceFuelMetrics,
  DEFAULT_PERFORMANCE_FUEL_SETTINGS,
  FUEL_DURATION_OPTIONS,
  FUEL_HUMIDITY_PCT,
  FUEL_ROUND_HOURS,
  FUEL_ROUND_TYPE_OPTIONS,
  FUEL_TEMP_C,
  FUEL_WEIGHT_KG,
  performanceFuelStorageKey,
  type FuelEventDuration,
  type FuelScheduleRow,
  type PerformanceFuelMetrics,
  type PerformanceFuelSettings,
  type TournamentShoppingManifest,
} from "@/lib/performanceFuelPlanner";

const TARGET_BADGE: Record<FuelScheduleRow["targetKind"], string> = {
  fluid: "border-sky-200 bg-sky-50 text-sky-900",
  carbs: "border-amber-200 bg-amber-50 text-amber-950",
  sodium: "border-violet-200 bg-violet-50 text-violet-900",
};

const NO_SPINNER =
  "[appearance:textfield] [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

const MULTI_DAY_ROW =
  "border-l-4 border-l-[hsl(var(--chart-4,199_89%_48%))] bg-[hsl(var(--chart-4,199_89%_48%)/0.08)]";

function TargetBadge({ kind, children }: { kind: FuelScheduleRow["targetKind"]; children: string }) {
  return (
    <span
      className={`inline-flex min-h-[1.625rem] max-w-full items-center rounded-md border px-2 py-0.5 text-[11px] font-bold leading-tight tabular-nums sm:text-xs ${TARGET_BADGE[kind]}`}
    >
      {children}
    </span>
  );
}

function TournamentScienceBreakdown({ metrics }: { metrics: PerformanceFuelMetrics }) {
  const manifest = metrics.tournamentManifest;
  if (!manifest) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4">
      <p className="text-sm font-semibold text-gray-900">The sports science behind your targets</p>
      <p className="mt-1 text-xs leading-snug text-gray-600 sm:text-sm">
        These totals are your full tournament inventory — not what you drink in one round. Here is
        how the numbers add up.
      </p>

      <div className="mt-3 space-y-3">
        <div className="rounded-lg border border-sky-100 bg-sky-50/60 p-2.5 sm:p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-sky-900">
            {metrics.totalWeeklyFluidsL} L hydration target
          </p>
          <ul className="mt-1.5 space-y-1 text-xs leading-snug text-sky-950 sm:text-sm">
            <li>
              <span className="font-semibold">Prep baseline ({manifest.prepBaselineFluidsL} L):</span>{" "}
              {manifest.prepDailyFluidL} L/day × 6 days to stay hyper-hydrated at rest before
              competition.
            </li>
            <li>
              <span className="font-semibold">
                On-course sweat replacement ({manifest.tournamentOnCourseFluidsL} L):
              </span>{" "}
              {metrics.hourlyFluidL} L/hr × {FUEL_ROUND_HOURS} hr × 4 rounds — replace what you sweat
              out while walking.
            </li>
          </ul>
        </div>

        <div className="rounded-lg border border-violet-100 bg-violet-50/60 p-2.5 sm:p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-violet-900">
            {metrics.totalWeeklySodiumG} g sodium target
          </p>
          <ul className="mt-1.5 space-y-1 text-xs leading-snug text-violet-950 sm:text-sm">
            <li>
              <span className="font-semibold">Hourly loss:</span> {metrics.hourlyFluidL} L/hr ×{" "}
              {metrics.sodiumConcentrationMgPerL} mg/L = {metrics.hourlySodiumMg.toLocaleString()}{" "}
              mg/hr in sweat.
            </li>
            <li>
              <span className="font-semibold">Per round:</span> {manifest.perRoundSodiumG} g × 4
              rounds = {manifest.tournamentOnCourseSodiumG} g on-course.
            </li>
            <li>
              <span className="font-semibold">Shopping buffer (+{manifest.prepElectrolyteSodiumG}{" "}
              g):</span> extra electrolyte mix for prep-day hydration and post-round recovery.
            </li>
          </ul>
        </div>

        <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-2.5 sm:p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-950">
            {metrics.totalWeeklyCarbPortions}× 100 g carb portions ({metrics.totalWeeklyCarbsG.toLocaleString()}{" "}
            g total)
          </p>
          <ul className="mt-1.5 space-y-1 text-xs leading-snug text-amber-950 sm:text-sm">
            <li>
              <span className="font-semibold">2 prep days:</span> {manifest.carbPrepTotalG.toLocaleString()}{" "}
              g ({metrics.carbLoadingTargetG} g/day intensive loading).
            </li>
            <li>
              <span className="font-semibold">4 tournament rounds:</span>{" "}
              {manifest.carbOnCourseTotalG.toLocaleString()} g on-course fueling (
              {Math.round(metrics.onCourseCarbsPerHr * FUEL_ROUND_HOURS)} g/round).
            </li>
            <li>
              <span className="font-semibold">3 overnight resets:</span>{" "}
              {manifest.carbOvernightTotalG.toLocaleString()} g ({metrics.tournamentOvernightReloadG}{" "}
              g/night between rounds).
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function TournamentShoppingManifestCard({ manifest }: { manifest: TournamentShoppingManifest }) {
  return (
    <div className="mt-2.5 space-y-2.5 rounded-lg border border-[hsl(var(--chart-4,199_89%_48%)/0.25)] bg-white/80 p-2.5 sm:p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-900">
        Tournament shopping manifest
      </p>

      <div className="rounded-md border border-gray-200 bg-gray-50/80 p-2.5">
        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-700">
          Hotel / base camp stash
        </p>
        <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs leading-snug text-gray-800 sm:text-sm">
          <li>{manifest.baseCampWaterL} L of fresh water (baseline hydration)</li>
          <li>
            {manifest.baseCampDryCarbsKg} kg of dry pasta, white rice, or sweet potatoes
          </li>
        </ul>
      </div>

      <div className="rounded-md border border-gray-200 bg-gray-50/80 p-2.5">
        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-700">
          On-course daily carry (per round)
        </p>
        <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs leading-snug text-gray-800 sm:text-sm">
          <li>
            {manifest.perRoundWaterBottles2L}× 2 L water bottles (or sports drinks) —{" "}
            {manifest.perRoundFluidL} L sweat replacement
          </li>
          <li>{manifest.perRoundCarbSnacks100g}× 100 g carbohydrate snacks (bars, gels, bananas)</li>
          <li>
            Electrolyte tablets containing ~{manifest.perRoundSodiumG} g of sodium total
          </li>
        </ul>
      </div>
    </div>
  );
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

type NumericFieldProps = {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
  hideSpinner?: boolean;
};

function NumericField({ id, label, value, min, max, onCommit, hideSpinner }: NumericFieldProps) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commitDraft = (raw: string) => {
    if (raw.trim() === "") {
      setDraft(String(value));
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      setDraft(String(value));
      return;
    }
    const clamped = clampNumber(Math.round(n), min, max);
    setDraft(String(clamped));
    onCommit(clamped);
  };

  return (
    <div className="min-w-0">
      <label
        htmlFor={id}
        className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-500 sm:text-[11px]"
      >
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={draft}
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(raw);
          if (raw.trim() === "") return;
          const n = Number(raw);
          if (Number.isFinite(n) && n >= min && n <= max) {
            onCommit(Math.round(n));
          }
        }}
        onBlur={() => commitDraft(draft)}
        className={`w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm font-bold tabular-nums text-gray-900 focus:border-[#FFA500] focus:outline-none${hideSpinner ? ` ${NO_SPINNER}` : ""}`}
      />
    </div>
  );
}

function parseStoredSettings(raw: Partial<PerformanceFuelSettings> & Record<string, unknown>): PerformanceFuelSettings {
  const weightKg =
    typeof raw.weightKg === "number" && raw.weightKg > 0
      ? clampNumber(raw.weightKg, FUEL_WEIGHT_KG.min, FUEL_WEIGHT_KG.max)
      : DEFAULT_PERFORMANCE_FUEL_SETTINGS.weightKg;

  const tempC =
    typeof raw.tempC === "number"
      ? clampNumber(raw.tempC, FUEL_TEMP_C.min, FUEL_TEMP_C.max)
      : DEFAULT_PERFORMANCE_FUEL_SETTINGS.tempC;

  const humidityPct =
    typeof raw.humidityPct === "number"
      ? clampNumber(raw.humidityPct, FUEL_HUMIDITY_PCT.min, FUEL_HUMIDITY_PCT.max)
      : DEFAULT_PERFORMANCE_FUEL_SETTINGS.humidityPct;

  const roundType =
    raw.roundType === "walking" || raw.roundType === "riding"
      ? raw.roundType
      : DEFAULT_PERFORMANCE_FUEL_SETTINGS.roundType;

  const duration =
    raw.duration === "single_round" || raw.duration === "four_day_tournament"
      ? raw.duration
      : DEFAULT_PERFORMANCE_FUEL_SETTINGS.duration;

  return { weightKg, tempC, humidityPct, roundType, duration };
}

export function NutritionPlannerPanel({ userId }: { userId: string | undefined }) {
  const [settings, setSettings] = useState<PerformanceFuelSettings>(
    DEFAULT_PERFORMANCE_FUEL_SETTINGS,
  );

  useEffect(() => {
    if (!userId || typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(performanceFuelStorageKey(userId));
      if (!raw) return;
      setSettings(parseStoredSettings(JSON.parse(raw)));
    } catch {
      /* ignore */
    }
  }, [userId]);

  const persist = (next: PerformanceFuelSettings) => {
    setSettings(next);
    if (userId && typeof window !== "undefined") {
      localStorage.setItem(performanceFuelStorageKey(userId), JSON.stringify(next));
    }
  };

  const persistField = <K extends keyof PerformanceFuelSettings>(
    key: K,
    value: PerformanceFuelSettings[K],
  ) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      if (userId && typeof window !== "undefined") {
        localStorage.setItem(performanceFuelStorageKey(userId), JSON.stringify(next));
      }
      return next;
    });
  };

  const metrics = useMemo(
    () =>
      computePerformanceFuelMetrics(
        settings.weightKg,
        settings.tempC,
        settings.humidityPct,
        settings.roundType,
        settings.duration,
      ),
    [settings.weightKg, settings.tempC, settings.humidityPct, settings.roundType, settings.duration],
  );

  const scheduleRows = useMemo(() => buildFuelScheduleRows(metrics), [metrics]);
  const isTournament = settings.duration === "four_day_tournament";

  const hudPrimary = isTournament
    ? {
        value: `${metrics.totalWeeklyFluidsL} L`,
        label: "Total Week Fluids",
      }
    : {
        value: `${metrics.preRoundBaselineFluidL} L`,
        label: "Daily Prep Fluid",
      };

  const hudSecondary = isTournament
    ? {
        value: `${metrics.totalWeeklyCarbsG.toLocaleString()} g`,
        label: "Total Week Carbs",
      }
    : {
        value: `${metrics.carbLoadingTargetG.toLocaleString()} g`,
        label: "Carb Load Target",
      };

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2 rounded-xl border border-gray-200 bg-white p-2.5 sm:gap-3 sm:p-3">
        <NumericField
          id="fuel-weight-kg"
          label="Player weight (kg)"
          value={settings.weightKg}
          min={FUEL_WEIGHT_KG.min}
          max={FUEL_WEIGHT_KG.max}
          onCommit={(weightKg) => persistField("weightKg", weightKg)}
        />
        <NumericField
          id="fuel-temp-c"
          label="Air temp (°C)"
          value={settings.tempC}
          min={FUEL_TEMP_C.min}
          max={FUEL_TEMP_C.max}
          onCommit={(tempC) => persistField("tempC", tempC)}
          hideSpinner
        />
        <NumericField
          id="fuel-humidity"
          label="Humidity (%)"
          value={settings.humidityPct}
          min={FUEL_HUMIDITY_PCT.min}
          max={FUEL_HUMIDITY_PCT.max}
          onCommit={(humidityPct) => persistField("humidityPct", humidityPct)}
          hideSpinner
        />

        <div className="min-w-0 sm:col-span-1">
          <label
            htmlFor="fuel-round-type"
            className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-500 sm:text-[11px]"
          >
            Round type
          </label>
          <select
            id="fuel-round-type"
            value={settings.roundType}
            onChange={(e) =>
              persist({
                ...settings,
                roundType: e.target.value as PerformanceFuelSettings["roundType"],
              })
            }
            className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm font-semibold text-gray-900 focus:border-[#FFA500] focus:outline-none"
          >
            {FUEL_ROUND_TYPE_OPTIONS.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-0 sm:col-span-2">
          <label
            htmlFor="fuel-event-duration"
            className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-500 sm:text-[11px]"
          >
            Event format
          </label>
          <select
            id="fuel-event-duration"
            value={settings.duration}
            onChange={(e) =>
              persist({
                ...settings,
                duration: e.target.value as FuelEventDuration,
              })
            }
            className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm font-semibold text-gray-900 focus:border-[#FFA500] focus:outline-none"
          >
            {FUEL_DURATION_OPTIONS.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isTournament && metrics.tournamentManifest && (
        <TournamentScienceBreakdown metrics={metrics} />
      )}

      <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
        {scheduleRows.map((row) => (
          <li
            key={row.id}
            className={`px-2.5 py-2.5 sm:px-3 sm:py-3${row.multiDay ? ` ${MULTI_DAY_ROW}` : ""}`}
          >
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-x-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-tight text-gray-900">{row.phase}</p>
                <p className="text-[11px] font-medium text-gray-500">{row.timing}</p>
              </div>
              <div className="sm:justify-self-end">
                <TargetBadge kind={row.targetKind}>{row.target}</TargetBadge>
              </div>
            </div>
            <p className="mt-1.5 text-xs leading-snug text-gray-700 sm:text-sm">{row.recommendation}</p>
            {row.showShoppingManifest && metrics.tournamentManifest && (
              <TournamentShoppingManifestCard manifest={metrics.tournamentManifest} />
            )}
          </li>
        ))}
      </ul>

      <div className="rounded-xl bg-[#014421] px-3 py-3 text-white shadow-md sm:px-4">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/70 sm:text-[11px]">
          {isTournament ? "Tournament week totals" : `Round totals · ${FUEL_ROUND_HOURS} hr`} ·{" "}
          {metrics.sodiumConcentrationMgPerL} mg/L sodium in sweat
        </p>
        <div className="grid grid-cols-3 gap-1.5 text-center sm:gap-2">
          <div className="rounded-lg bg-white/10 px-1.5 py-1.5 sm:px-2 sm:py-2">
            <p className="text-base font-bold tabular-nums sm:text-lg">{hudPrimary.value}</p>
            <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-white/75 sm:text-[10px]">
              {hudPrimary.label}
            </p>
          </div>
          <div className="rounded-lg bg-white/10 px-1.5 py-1.5 sm:px-2 sm:py-2">
            <p className="text-base font-bold tabular-nums sm:text-lg">{hudSecondary.value}</p>
            <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-white/75 sm:text-[10px]">
              {hudSecondary.label}
            </p>
          </div>
          <div className="rounded-lg bg-white/10 px-1.5 py-1.5 sm:px-2 sm:py-2">
            <p className="text-base font-bold tabular-nums sm:text-lg">
              {isTournament
                ? `${metrics.totalWeeklySodiumG} g`
                : metrics.totalOnCourseSodiumMg.toLocaleString()}
            </p>
            <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-white/75 sm:text-[10px]">
              {isTournament ? "Week Sodium" : "Sodium"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
