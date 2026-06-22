"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Clock, Droplets, Flame } from "lucide-react";
import {
  computePerformanceFuelMetrics,
  DEFAULT_PERFORMANCE_FUEL_SETTINGS,
  FUEL_ROUND_HOURS,
  FUEL_ROUND_TYPE_OPTIONS,
  FUEL_SEX_OPTIONS,
  FUEL_WEATHER_OPTIONS,
  performanceFuelStorageKey,
  type FuelRoundType,
  type FuelSex,
  type FuelWeather,
  type PerformanceFuelSettings,
} from "@/lib/performanceFuelPlanner";

function MetricBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-[#014421]/20 bg-[#014421]/8 px-2.5 py-0.5 text-xs font-bold tabular-nums text-[#014421]">
      {children}
    </span>
  );
}

function IntervalSection({
  icon: Icon,
  title,
  badge,
  badgeSecondary,
  value,
  onChange,
  placeholder,
}: {
  icon: typeof Clock;
  title: string;
  badge: string;
  badgeSecondary?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-[#014421]" aria-hidden />
          <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <MetricBadge>{badge}</MetricBadge>
          {badgeSecondary ? <MetricBadge>{badgeSecondary}</MetricBadge> : null}
        </div>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full resize-y rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-[#FFA500] focus:outline-none"
      />
    </div>
  );
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
      const parsed = JSON.parse(raw) as Partial<PerformanceFuelSettings>;
      setSettings({
        weightKg:
          typeof parsed.weightKg === "number" && parsed.weightKg > 0
            ? parsed.weightKg
            : DEFAULT_PERFORMANCE_FUEL_SETTINGS.weightKg,
        sex: parsed.sex ?? DEFAULT_PERFORMANCE_FUEL_SETTINGS.sex,
        weather: parsed.weather ?? DEFAULT_PERFORMANCE_FUEL_SETTINGS.weather,
        roundType: parsed.roundType ?? DEFAULT_PERFORMANCE_FUEL_SETTINGS.roundType,
        notes: {
          preRound: parsed.notes?.preRound ?? "",
          onCourse: parsed.notes?.onCourse ?? "",
          hydration: parsed.notes?.hydration ?? "",
        },
      });
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

  const metrics = useMemo(
    () =>
      computePerformanceFuelMetrics(
        settings.weightKg,
        settings.weather,
        settings.roundType,
        settings.sex,
      ),
    [settings.weightKg, settings.weather, settings.roundType, settings.sex],
  );

  const updateNote = (field: keyof PerformanceFuelSettings["notes"], value: string) => {
    persist({
      ...settings,
      notes: { ...settings.notes, [field]: value },
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 rounded-xl border border-gray-200 bg-white p-3 sm:grid-cols-4">
        <div>
          <label
            htmlFor="fuel-weight-kg"
            className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500"
          >
            Player weight
          </label>
          <div className="flex items-center gap-1.5">
            <input
              id="fuel-weight-kg"
              type="number"
              min={40}
              max={150}
              step={0.5}
              value={settings.weightKg}
              onChange={(e) => {
                const n = Number(e.target.value);
                persist({
                  ...settings,
                  weightKg: Number.isFinite(n) && n > 0 ? n : settings.weightKg,
                });
              }}
              className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm font-semibold tabular-nums text-gray-900 focus:border-[#FFA500] focus:outline-none"
            />
            <span className="shrink-0 text-xs font-medium text-gray-500">kg</span>
          </div>
        </div>
        <div>
          <label
            htmlFor="fuel-sex"
            className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500"
          >
            Sex
          </label>
          <select
            id="fuel-sex"
            value={settings.sex}
            onChange={(e) => persist({ ...settings, sex: e.target.value as FuelSex })}
            className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm font-medium text-gray-900 focus:border-[#FFA500] focus:outline-none"
          >
            {FUEL_SEX_OPTIONS.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="fuel-weather"
            className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500"
          >
            Weather
          </label>
          <select
            id="fuel-weather"
            value={settings.weather}
            onChange={(e) =>
              persist({ ...settings, weather: e.target.value as FuelWeather })
            }
            className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm font-medium text-gray-900 focus:border-[#FFA500] focus:outline-none"
          >
            {FUEL_WEATHER_OPTIONS.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="fuel-round-type"
            className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500"
          >
            Round type
          </label>
          <select
            id="fuel-round-type"
            value={settings.roundType}
            onChange={(e) =>
              persist({ ...settings, roundType: e.target.value as FuelRoundType })
            }
            className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm font-medium text-gray-900 focus:border-[#FFA500] focus:outline-none"
          >
            {FUEL_ROUND_TYPE_OPTIONS.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <IntervalSection
        icon={Clock}
        title="Pre-Round Meal"
        badge={`${metrics.preRoundCarbsG}g carbs`}
        value={settings.notes.preRound}
        onChange={(v) => updateNote("preRound", v)}
        placeholder="e.g. Oats + banana, 2 hours before tee — hit your carb target"
      />

      <IntervalSection
        icon={Flame}
        title="On-Course Fuel"
        badge={`${metrics.carbsGPerHr}g/hr`}
        value={settings.notes.onCourse}
        onChange={(v) => updateNote("onCourse", v)}
        placeholder="e.g. Half bar at 4, gel at 10, banana at 14"
      />

      <IntervalSection
        icon={Droplets}
        title="Hydration Plan"
        badge={`${metrics.fluidMlPerHr} ml/hr`}
        badgeSecondary={`${metrics.sodiumMgPerHr} mg Na/hr`}
        value={settings.notes.hydration}
        onChange={(v) => updateNote("hydration", v)}
        placeholder="e.g. Electrolyte mix in bottle 1, water in bottle 2 — sip every tee box"
      />

      <div className="rounded-xl bg-[#014421] px-4 py-4 text-white shadow-md">
        <p className="mb-3 text-xs font-bold uppercase tracking-wider text-white/70">
          Pack your bag · {FUEL_ROUND_HOURS} hr tournament
        </p>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-lg font-bold tabular-nums sm:text-xl">
              {metrics.totalFluidLiters}L
            </p>
            <p className="mt-0.5 text-[11px] font-medium text-white/75">Total fluid</p>
          </div>
          <div>
            <p className="text-lg font-bold tabular-nums sm:text-xl">
              {metrics.totalSodiumMg.toLocaleString()}
            </p>
            <p className="mt-0.5 text-[11px] font-medium text-white/75">Sodium (mg)</p>
          </div>
          <div>
            <p className="text-lg font-bold tabular-nums sm:text-xl">
              {metrics.totalCarbsG}g
            </p>
            <p className="mt-0.5 text-[11px] font-medium text-white/75">Total carbs</p>
          </div>
        </div>
        <p className="mt-3 text-center text-[10px] leading-snug text-white/60">
          On-course: {metrics.totalOnCourseCarbsG}g carbs · Pre-round target:{" "}
          {metrics.preRoundCarbsG}g
        </p>
      </div>
    </div>
  );
}
