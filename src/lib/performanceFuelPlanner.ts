/** Performance Fuel Planner — Australian climate metrics & sports-science fuel calculations. */

export type FuelRoundType = "walking" | "riding";

export type FuelEventDuration = "single_round" | "four_day_tournament";

export const FUEL_ROUND_HOURS = 4.5;

export const FUEL_ROUND_TYPE_OPTIONS: { id: FuelRoundType; label: string }[] = [
  { id: "walking", label: "Walking" },
  { id: "riding", label: "Riding" },
];

export const FUEL_DURATION_OPTIONS: { id: FuelEventDuration; label: string }[] = [
  { id: "single_round", label: "Single Round" },
  { id: "four_day_tournament", label: "4-Day Tournament" },
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

/** Tournament prep baseline — hyper-hydration at rest in hot conditions (≈50 ml/kg/day floor). */
function tournamentPrepDailyFluidL(weightKg: number, preRoundBaselineFluidL: number, tempC: number): number {
  const hotFloor = weightKg * 0.05;
  return tempC > 25 ? Math.max(preRoundBaselineFluidL, hotFloor) : preRoundBaselineFluidL;
}

function buildTournamentShoppingManifest(
  weight: number,
  tempC: number,
  preRoundBaselineFluidL: number,
  hourlyFluidL: number,
  sodiumMgPerL: number,
  hourlySodiumMg: number,
  carbLoadingTargetG: number,
  onCourseCarbsPerHr: number,
  tournamentOvernightReloadG: number,
): TournamentShoppingManifest {
  const prepDailyFluidL = tournamentPrepDailyFluidL(weight, preRoundBaselineFluidL, tempC);
  const prepBaselineFluidsL = prepDailyFluidL * 6;
  const tournamentOnCourseFluidsL = hourlyFluidL * FUEL_ROUND_HOURS * 4;
  const perRoundFluidL = hourlyFluidL * FUEL_ROUND_HOURS;
  const perRoundSodiumG =
    Math.round(((hourlySodiumMg * FUEL_ROUND_HOURS) / 1000) * 10) / 10;
  const tournamentOnCourseSodiumG =
    Math.round(((hourlySodiumMg * FUEL_ROUND_HOURS * 4) / 1000) * 10) / 10;
  const prepElectrolyteSodiumG =
    Math.round(((sodiumMgPerL * prepBaselineFluidsL * 0.78) / 1000) * 10) / 10;

  const carbPrepTotalG = carbLoadingTargetG * 2;
  const carbOnCourseTotalG = Math.round(onCourseCarbsPerHr * FUEL_ROUND_HOURS * 4);
  const carbOvernightTotalG = tournamentOvernightReloadG * 3;
  const baseCampDryCarbsKg =
    Math.round(((carbPrepTotalG + carbOvernightTotalG) * 0.61) / 1000 * 10) / 10;

  return {
    prepBaselineFluidsL: Math.round(prepBaselineFluidsL * 10) / 10,
    tournamentOnCourseFluidsL: Math.round(tournamentOnCourseFluidsL * 10) / 10,
    prepDailyFluidL: Math.round(prepDailyFluidL * 10) / 10,
    baseCampWaterL: Math.round(prepBaselineFluidsL * 10) / 10,
    baseCampDryCarbsKg,
    perRoundFluidL: Math.round(perRoundFluidL * 10) / 10,
    perRoundWaterBottles2L: Math.max(1, Math.ceil(perRoundFluidL / 2)),
    perRoundCarbSnacks100g: Math.max(1, Math.ceil((onCourseCarbsPerHr * FUEL_ROUND_HOURS) / 100)),
    perRoundSodiumG,
    tournamentOnCourseSodiumG,
    prepElectrolyteSodiumG,
    carbPrepTotalG,
    carbOnCourseTotalG,
    carbOvernightTotalG,
  };
}

export type TournamentShoppingManifest = {
  prepBaselineFluidsL: number;
  tournamentOnCourseFluidsL: number;
  prepDailyFluidL: number;
  baseCampWaterL: number;
  baseCampDryCarbsKg: number;
  perRoundFluidL: number;
  perRoundWaterBottles2L: number;
  perRoundCarbSnacks100g: number;
  perRoundSodiumG: number;
  tournamentOnCourseSodiumG: number;
  prepElectrolyteSodiumG: number;
  carbPrepTotalG: number;
  carbOnCourseTotalG: number;
  carbOvernightTotalG: number;
};

export type PerformanceFuelMetrics = {
  eventDuration: FuelEventDuration;
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
  tournamentOvernightReloadG: number;
  totalWeeklyFluidsL: number;
  totalWeeklyCarbsG: number;
  totalWeeklySodiumG: number;
  totalWeeklyCarbPortions: number;
  tournamentManifest?: TournamentShoppingManifest;
};

export function computePerformanceFuelMetrics(
  weightKg: number,
  tempC: number,
  humidityPct: number,
  roundType: FuelRoundType,
  eventDuration: FuelEventDuration = "single_round",
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

  const tournamentOvernightReloadG = Math.round(weight * 8.0);

  const tournamentManifest =
    eventDuration === "four_day_tournament"
      ? buildTournamentShoppingManifest(
          weight,
          temp,
          preRoundBaselineFluidL,
          hourlyFluidL,
          sodiumMgPerL,
          hourlySodiumMg,
          carbLoadingTargetG,
          onCourseCarbsPerHr,
          tournamentOvernightReloadG,
        )
      : undefined;

  const totalWeeklyFluidsL = tournamentManifest
    ? tournamentManifest.prepBaselineFluidsL + tournamentManifest.tournamentOnCourseFluidsL
    : preRoundBaselineFluidL * 6 + hourlyFluidL * FUEL_ROUND_HOURS * 4;
  const totalWeeklyCarbsG =
    carbLoadingTargetG * 2 +
    onCourseCarbsPerHr * FUEL_ROUND_HOURS * 4 +
    tournamentOvernightReloadG * 3;
  const totalWeeklySodiumG = tournamentManifest
    ? Math.round(
        (tournamentManifest.tournamentOnCourseSodiumG +
          tournamentManifest.prepElectrolyteSodiumG) *
          10,
      ) / 10
    : Math.round(
        ((hourlySodiumMg * FUEL_ROUND_HOURS * 4 +
          sodiumMgPerL * preRoundBaselineFluidL * 6) /
          1000) *
          10,
      ) / 10;
  const totalWeeklyCarbPortions = Math.max(1, Math.round(totalWeeklyCarbsG / 100));

  return {
    eventDuration,
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
    tournamentOvernightReloadG,
    totalWeeklyFluidsL: Math.round(totalWeeklyFluidsL * 10) / 10,
    totalWeeklyCarbsG: Math.round(totalWeeklyCarbsG),
    totalWeeklySodiumG,
    totalWeeklyCarbPortions,
    tournamentManifest,
  };
}

export type FuelSchedulePhase =
  | "prepHydration"
  | "carbLoad"
  | "preRoundMeal"
  | "onCourseFluids"
  | "onCourseCarbs"
  | "recovery"
  | "multiDayOvernightReload"
  | "multiDayShoppingList";

export type FuelScheduleRow = {
  id: FuelSchedulePhase;
  phase: string;
  timing: string;
  target: string;
  targetKind: "fluid" | "carbs" | "sodium";
  recommendation: string;
  multiDay?: boolean;
  showShoppingManifest?: boolean;
};

const CORE_FUEL_SCHEDULE_ROWS = (
  metrics: PerformanceFuelMetrics,
): FuelScheduleRow[] => [
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
];

export function buildFuelScheduleRows(metrics: PerformanceFuelMetrics): FuelScheduleRow[] {
  const coreRows = CORE_FUEL_SCHEDULE_ROWS(metrics);

  if (metrics.eventDuration === "four_day_tournament") {
    return [
      ...coreRows,
      {
        id: "multiDayOvernightReload",
        phase: "Phase 4: Multi-Day Reload",
        timing: "Overnight Glycogen Reset",
        target: `${metrics.tournamentOvernightReloadG} g`,
        targetKind: "carbs",
        multiDay: true,
        recommendation:
          "Critical between Rounds 1, 2, and 3. Consume large portions of white rice, pasta, or sweet potato. Supplement with juice or sports drinks if feeling too full to eat.",
      },
      {
        id: "multiDayShoppingList",
        phase: "Phase 4: Multi-Day Reload",
        timing: "Tournament Shopping Manifest",
        target: "4-Day Load",
        targetKind: "carbs",
        multiDay: true,
        showShoppingManifest: true,
        recommendation:
          "Your total inventory for the 6-day tournament cycle (2 prep days + 4 competitive rounds). Pack by category so you know what stays at base camp vs what goes in the bag each morning.",
      },
    ];
  }

  return [
    ...coreRows,
    {
      id: "recovery",
      phase: "Phase 4: Post-Round",
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
  duration: FuelEventDuration;
};

export const DEFAULT_PERFORMANCE_FUEL_SETTINGS: PerformanceFuelSettings = {
  weightKg: FUEL_WEIGHT_KG.default,
  tempC: FUEL_TEMP_C.default,
  humidityPct: FUEL_HUMIDITY_PCT.default,
  roundType: "walking",
  duration: "single_round",
};

export function performanceFuelStorageKey(userId: string) {
  return `performanceFuelPlanner_${userId}`;
}
