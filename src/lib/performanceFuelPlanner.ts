/** Performance Fuel Planner — Australian climate metrics & sports-science fuel calculations. */

export type FuelRoundType = "walking" | "riding";

export const FUEL_ROUND_HOURS = 4.5;

export const FUEL_ROUND_TYPE_OPTIONS: { id: FuelRoundType; label: string }[] = [
  { id: "walking", label: "Walking" },
  { id: "riding", label: "Riding" },
];

export const FUEL_WEIGHT_KG = { default: 80, min: 50, max: 120 } as const;
export const FUEL_TEMP_C = { default: 24, min: 10, max: 42 } as const;
export const FUEL_HUMIDITY_PCT = { default: 60, min: 10, max: 100 } as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function safeWeight(weightKg: number): number {
  return Number.isFinite(weightKg) && weightKg > 0 ? weightKg : FUEL_WEIGHT_KG.default;
}

function safeTemp(tempC: number): number {
  return Number.isFinite(tempC)
    ? clamp(tempC, FUEL_TEMP_C.min, FUEL_TEMP_C.max)
    : FUEL_TEMP_C.default;
}

function safeHumidity(humidityPct: number): number {
  return Number.isFinite(humidityPct)
    ? clamp(humidityPct, FUEL_HUMIDITY_PCT.min, FUEL_HUMIDITY_PCT.max)
    : FUEL_HUMIDITY_PCT.default;
}

export function sodiumConcentrationMgPerL(tempC: number, humidityPct: number): number {
  const temp = safeTemp(tempC);
  const humidity = safeHumidity(humidityPct);
  if (temp > 30 && humidity > 60) return 950;
  if (temp > 30) return 850;
  return 750;
}

export function hourlyFluidLiters(
  tempC: number,
  humidityPct: number,
  roundType: FuelRoundType,
): number {
  const baseRate = roundType === "walking" ? 0.6 : 0.35;
  const tempFactor = Math.max(0, safeTemp(tempC) - 20) * 0.032;
  const humidityFactor = Math.max(0, safeHumidity(humidityPct) - 40) * 0.006;
  return clamp(baseRate + tempFactor + humidityFactor, 0.4, 1.8);
}

export type PerformanceFuelMetrics = {
  preRoundBaselineFluidL: number;
  carbLoadingTargetG: number;
  preRoundCarbsG: number;
  hourlyFluidL: number;
  hourlySodiumMg: number;
  sodiumConcentrationMgPerL: number;
  onCourseCarbsPerHr: number;
  recoveryCarbsG: number;
  totalOnCourseFluidL: number;
  totalOnCourseSodiumMg: number;
  totalOnCourseCarbsG: number;
  totalCarbsG: number;
};

export function computePerformanceFuelMetrics(
  weightKg: number,
  tempC: number,
  humidityPct: number,
  roundType: FuelRoundType,
): PerformanceFuelMetrics {
  const weight = safeWeight(weightKg);
  const temp = safeTemp(tempC);
  const humidity = safeHumidity(humidityPct);

  const heatSurcharge = temp > 25 ? (temp - 25) * 0.12 : 0;
  const preRoundBaselineFluidL = weight * 0.035 + heatSurcharge;
  const carbLoadingTargetG = Math.round(weight * 7.5);
  const preRoundCarbsG = Math.round(weight * 1.5);
  const hourlyFluidL = hourlyFluidLiters(temp, humidity, roundType);
  const sodiumMgPerL = sodiumConcentrationMgPerL(temp, humidity);
  const hourlySodiumMg = Math.round(hourlyFluidL * sodiumMgPerL);
  const onCourseCarbsPerHr = roundType === "walking" ? 45 : 30;
  const recoveryCarbsG = Math.round(weight * 1.2);

  const totalOnCourseFluidL = hourlyFluidL * FUEL_ROUND_HOURS;
  const totalOnCourseSodiumMg = Math.round(hourlySodiumMg * FUEL_ROUND_HOURS);
  const totalOnCourseCarbsG = Math.round(onCourseCarbsPerHr * FUEL_ROUND_HOURS);
  const totalCarbsG = preRoundCarbsG + totalOnCourseCarbsG + recoveryCarbsG;

  return {
    preRoundBaselineFluidL: Math.round(preRoundBaselineFluidL * 10) / 10,
    carbLoadingTargetG,
    preRoundCarbsG,
    hourlyFluidL: Math.round(hourlyFluidL * 100) / 100,
    hourlySodiumMg,
    sodiumConcentrationMgPerL: sodiumMgPerL,
    onCourseCarbsPerHr,
    recoveryCarbsG,
    totalOnCourseFluidL: Math.round(totalOnCourseFluidL * 10) / 10,
    totalOnCourseSodiumMg,
    totalOnCourseCarbsG,
    totalCarbsG,
  };
}

export type FuelSchedulePhase =
  | "prepHydration"
  | "carbLoad"
  | "preRoundMeal"
  | "onCourseFluids"
  | "onCourseCarbs"
  | "recovery";

export type FuelScheduleRow = {
  id: FuelSchedulePhase;
  phase: string;
  timing: string;
  target: string;
  targetKind: "fluid" | "carbs" | "sodium";
  recommendation: string;
};

export function buildFuelScheduleRows(metrics: PerformanceFuelMetrics): FuelScheduleRow[] {
  return [
    {
      id: "prepHydration",
      phase: "Prep Hydration",
      timing: "48h before",
      target: `${metrics.preRoundBaselineFluidL} L baseline`,
      targetKind: "fluid",
      recommendation:
        "Aim for straw-coloured urine. Supplement with Hydralyte or Musashi electrolyte tablets.",
    },
    {
      id: "carbLoad",
      phase: "Glycogen Carb Load",
      timing: "48h prep",
      target: `${metrics.carbLoadingTargetG} g carbs/day`,
      targetKind: "carbs",
      recommendation:
        "Base meals on white rice, pasta, or potatoes. Snack on ripe bananas and honey crumpets.",
    },
    {
      id: "preRoundMeal",
      phase: "Pre-Round Meal",
      timing: "T-2.5h",
      target: `${metrics.preRoundCarbsG} g carbs`,
      targetKind: "carbs",
      recommendation:
        "3-4 Weet-Bix with milk, sliced banana & honey, or 2 pieces of toast with jam + an Up&Go.",
    },
    {
      id: "onCourseFluids",
      phase: "On-Course Fluids",
      timing: "Every hole",
      target: `${metrics.hourlyFluidL} L/hr fluid · ${metrics.hourlySodiumMg.toLocaleString()} mg sodium/hr`,
      targetKind: "fluid",
      recommendation:
        "Alternating sips of fresh water and sports drinks (Gatorade/Powerade) every second hole.",
    },
    {
      id: "onCourseCarbs",
      phase: "On-Course Carbs",
      timing: "Holes 1–18",
      target: `${metrics.onCourseCarbsPerHr} g/hr`,
      targetKind: "carbs",
      recommendation:
        "Holes 1-9: Uncle Tobys chewy bar or banana. Holes 10-18: Jam sandwich, Koda gel, or 4-5 Allen's Jelly Babies.",
    },
    {
      id: "recovery",
      phase: "Immediate Recovery",
      timing: "Post-round",
      target: `${metrics.recoveryCarbsG} g carbs`,
      targetKind: "carbs",
      recommendation:
        "750ml Chocolate Oak/Dare milk + a banana, or a chicken & salad roll from the pro shop.",
    },
  ];
}

export type PerformanceFuelSettings = {
  weightKg: number;
  tempC: number;
  humidityPct: number;
  roundType: FuelRoundType;
};

export const DEFAULT_PERFORMANCE_FUEL_SETTINGS: PerformanceFuelSettings = {
  weightKg: FUEL_WEIGHT_KG.default,
  tempC: FUEL_TEMP_C.default,
  humidityPct: FUEL_HUMIDITY_PCT.default,
  roundType: "walking",
};

export function performanceFuelStorageKey(userId: string) {
  return `performanceFuelPlanner_${userId}`;
}
