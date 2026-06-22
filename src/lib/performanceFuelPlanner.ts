/** Performance Fuel Planner — tournament hydration & fuel calculations. */

export type FuelWeather = "mild" | "hot" | "extreme";
export type FuelRoundType = "walking" | "riding";
export type FuelSex = "male" | "female";

export const FUEL_ROUND_HOURS = 4.5;

export const FUEL_SEX_OPTIONS: { id: FuelSex; label: string }[] = [
  { id: "male", label: "Male" },
  { id: "female", label: "Female" },
];

export const FUEL_WEATHER_OPTIONS: { id: FuelWeather; label: string }[] = [
  { id: "mild", label: "Mild" },
  { id: "hot", label: "Hot" },
  { id: "extreme", label: "Extreme" },
];

export const FUEL_ROUND_TYPE_OPTIONS: { id: FuelRoundType; label: string }[] = [
  { id: "walking", label: "Walking" },
  { id: "riding", label: "Riding" },
];

const FLUID_ML_PER_HR: Record<FuelWeather, number> = {
  mild: 500,
  hot: 750,
  extreme: 1000,
};

const SODIUM_MG_PER_HR: Record<FuelWeather, number> = {
  mild: 300,
  hot: 450,
  extreme: 600,
};

const CARBS_G_PER_HR_MALE: Record<FuelRoundType, number> = {
  walking: 45,
  riding: 30,
};

const CARBS_G_PER_HR_FEMALE: Record<FuelRoundType, number> = {
  walking: 40,
  riding: 25,
};

function baseFluidMlPerHr(weather: FuelWeather, sex: FuelSex): number {
  const base = FLUID_ML_PER_HR[weather];
  return sex === "female" ? Math.round(base * 0.85) : base;
}

function baseSodiumMgPerHr(weather: FuelWeather, sex: FuelSex): number {
  const base = SODIUM_MG_PER_HR[weather];
  return sex === "female" ? Math.round(base * 0.9) : base;
}

function baseCarbsGPerHr(roundType: FuelRoundType, sex: FuelSex): number {
  const table = sex === "female" ? CARBS_G_PER_HR_FEMALE : CARBS_G_PER_HR_MALE;
  return table[roundType];
}

export type PerformanceFuelMetrics = {
  preRoundCarbsG: number;
  fluidMlPerHr: number;
  sodiumMgPerHr: number;
  carbsGPerHr: number;
  totalFluidLiters: number;
  totalSodiumMg: number;
  totalOnCourseCarbsG: number;
  totalCarbsG: number;
};

export function computePerformanceFuelMetrics(
  weightKg: number,
  weather: FuelWeather,
  roundType: FuelRoundType,
  sex: FuelSex = "male",
): PerformanceFuelMetrics {
  const safeWeight = Number.isFinite(weightKg) && weightKg > 0 ? weightKg : 80;
  const preRoundCarbsG = Math.round(safeWeight * 1.5);
  const fluidMlPerHr = baseFluidMlPerHr(weather, sex);
  const sodiumMgPerHr = baseSodiumMgPerHr(weather, sex);
  const carbsGPerHr = baseCarbsGPerHr(roundType, sex);
  const totalFluidLiters = (fluidMlPerHr * FUEL_ROUND_HOURS) / 1000;
  const totalSodiumMg = Math.round(sodiumMgPerHr * FUEL_ROUND_HOURS);
  const totalOnCourseCarbsG = Math.round(carbsGPerHr * FUEL_ROUND_HOURS);
  const totalCarbsG = preRoundCarbsG + totalOnCourseCarbsG;

  return {
    preRoundCarbsG,
    fluidMlPerHr,
    sodiumMgPerHr,
    carbsGPerHr,
    totalFluidLiters: Math.round(totalFluidLiters * 10) / 10,
    totalSodiumMg,
    totalOnCourseCarbsG,
    totalCarbsG,
  };
}

export type PerformanceFuelNotes = {
  preRound: string;
  onCourse: string;
  hydration: string;
};

export type PerformanceFuelSettings = {
  weightKg: number;
  sex: FuelSex;
  weather: FuelWeather;
  roundType: FuelRoundType;
  notes: PerformanceFuelNotes;
};

export const DEFAULT_PERFORMANCE_FUEL_SETTINGS: PerformanceFuelSettings = {
  weightKg: 80,
  sex: "male",
  weather: "mild",
  roundType: "walking",
  notes: { preRound: "", onCourse: "", hydration: "" },
};

export function performanceFuelStorageKey(userId: string) {
  return `performanceFuelPlanner_${userId}`;
}
