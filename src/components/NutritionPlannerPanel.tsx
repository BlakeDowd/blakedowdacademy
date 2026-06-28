"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildFuelScheduleRows,
  computePerformanceFuelMetrics,
  DEFAULT_PERFORMANCE_FUEL_SETTINGS,
  FUEL_HUMIDITY_PCT,
  FUEL_ROUND_HOURS,
  FUEL_ROUND_TYPE_OPTIONS,
  FUEL_TEMP_C,
  FUEL_WEIGHT_KG,
  performanceFuelStorageKey,
  type FuelScheduleRow,
  type PerformanceFuelSettings,
} from "@/lib/performanceFuelPlanner";

const TARGET_BADGE: Record<FuelScheduleRow["targetKind"], string> = {
  fluid: "border-sky-200 bg-sky-50 text-sky-900",
  carbs: "border-amber-200 bg-amber-50 text-amber-950",
  sodium: "border-violet-200 bg-violet-50 text-violet-900",
};

const NO_SPINNER =
  "[appearance:textfield] [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

function TargetBadge({ kind, children }: { kind: FuelScheduleRow["targetKind"]; children: string }) {
  return (
    <span
      className={`inline-flex min-h-[1.625rem] max-w-full items-center rounded-md border px-2 py-0.5 text-[11px] font-bold leading-tight tabular-nums sm:text-xs ${TARGET_BADGE[kind]}`}
    >
      {children}
    </span>
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

  return { weightKg, tempC, humidityPct, roundType };
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
      ),
    [settings.weightKg, settings.tempC, settings.humidityPct, settings.roundType],
  );

  const scheduleRows = useMemo(() => buildFuelScheduleRows(metrics), [metrics]);

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
      </div>

      <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
        {scheduleRows.map((row) => (
          <li key={row.id} className="px-2.5 py-2.5 sm:px-3 sm:py-3">
            <div className="mb-1.5 flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-tight text-gray-900">{row.phase}</p>
                <p className="text-[11px] font-medium text-gray-500">{row.timing}</p>
              </div>
              <TargetBadge kind={row.targetKind}>{row.target}</TargetBadge>
            </div>
            <p className="text-xs leading-snug text-gray-700 sm:text-sm">{row.recommendation}</p>
          </li>
        ))}
      </ul>

      <div className="rounded-xl bg-[#014421] px-3 py-3 text-white shadow-md sm:px-4">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/70 sm:text-[11px]">
          Round totals · {FUEL_ROUND_HOURS} hr · {metrics.sodiumConcentrationMgPerL} mg/L sodium in sweat
        </p>
        <div className="grid grid-cols-3 gap-1.5 text-center sm:gap-2">
          <div className="rounded-lg bg-white/10 px-1.5 py-1.5 sm:px-2 sm:py-2">
            <p className="text-base font-bold tabular-nums sm:text-lg">{metrics.totalOnCourseFluidL} L</p>
            <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-white/75 sm:text-[10px]">
              Fluid
            </p>
          </div>
          <div className="rounded-lg bg-white/10 px-1.5 py-1.5 sm:px-2 sm:py-2">
            <p className="text-base font-bold tabular-nums sm:text-lg">
              {metrics.totalOnCourseSodiumMg.toLocaleString()}
            </p>
            <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-white/75 sm:text-[10px]">
              Sodium
            </p>
          </div>
          <div className="rounded-lg bg-white/10 px-1.5 py-1.5 sm:px-2 sm:py-2">
            <p className="text-base font-bold tabular-nums sm:text-lg">{metrics.totalCarbsG} g</p>
            <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-white/75 sm:text-[10px]">
              Carbs
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
