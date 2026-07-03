export type WindDirection = "head" | "tail" | "none" | "leftToRight" | "rightToLeft";

export const WIND_DIRECTION_OPTIONS: { id: WindDirection; label: string }[] = [
  { id: "head", label: "Head" },
  { id: "tail", label: "Tail" },
  { id: "none", label: "None" },
  { id: "leftToRight", label: "L→R" },
  { id: "rightToLeft", label: "R→L" },
];

export type Trajectory = "low" | "standard" | "high";

export type PlayerShape = "draw" | "straight" | "fade";

export type SwingLength = "full" | "three_quarter" | "half";

export const PLAYER_SHAPE_OPTIONS: { id: PlayerShape; label: string }[] = [
  { id: "straight", label: "Straight" },
  { id: "draw", label: "Draw" },
  { id: "fade", label: "Fade" },
];

export const SWING_LENGTH_OPTIONS: { id: SwingLength; label: string }[] = [
  { id: "full", label: "Full Swing" },
  { id: "three_quarter", label: "3/4 Swing" },
  { id: "half", label: "Half Swing" },
];

export const SWING_LENGTH_LABELS: Record<SwingLength, string> = {
  full: "Full Swing",
  three_quarter: "3/4 Swing",
  half: "Half Swing",
};

export type SwingLengthModifiers = {
  lengthMod: number;
  dispersionTightener: number;
};

export function getSwingLengthModifiers(swingLength: SwingLength = "full"): SwingLengthModifiers {
  switch (swingLength) {
    case "three_quarter":
      return { lengthMod: 0.92, dispersionTightener: 0.8 };
    case "half":
      return { lengthMod: 0.85, dispersionTightener: 0.6 };
    default:
      return { lengthMod: 1, dispersionTightener: 1 };
  }
}

export type DispersionMatrixColumn = {
  id: "left" | "center" | "right";
  label: string;
  distPercent: number;
  sideMeters: number;
};

/** Base horizontal miss dispersion for a stock full-swing iron (before swing-length tightening). */
export const SKILL_DISPERSION_COLUMNS: DispersionMatrixColumn[] = [
  { id: "left", label: "Left miss", distPercent: 5, sideMeters: 12 },
  { id: "center", label: "On line", distPercent: 3, sideMeters: 4 },
  { id: "right", label: "Right miss", distPercent: 5, sideMeters: 12 },
];

export function adjustDispersionColumns(
  dispersionTightener: number,
): DispersionMatrixColumn[] {
  const scale = Number.isFinite(dispersionTightener) ? dispersionTightener : 1;
  return SKILL_DISPERSION_COLUMNS.map((col) => ({
    ...col,
    distPercent: Math.round(col.distPercent * scale * 10) / 10,
    sideMeters: Math.round(col.sideMeters * scale * 10) / 10,
  }));
}

export type DispersionSkillLevel = "professional" | "aGrade" | "bGrade" | "cGrade";

export const DISPERSION_SKILL_PROFILES: Record<
  DispersionSkillLevel,
  { distPercent: number; sideMeters: number }
> = {
  professional: { distPercent: 0.06, sideMeters: 8 },
  aGrade: { distPercent: 0.09, sideMeters: 13 },
  bGrade: { distPercent: 0.14, sideMeters: 20 },
  cGrade: { distPercent: 0.2, sideMeters: 28 },
};

export const DISPERSION_SKILL_LEVEL_OPTIONS: { id: DispersionSkillLevel; label: string }[] = [
  { id: "professional", label: "Pro" },
  { id: "aGrade", label: "A" },
  { id: "bGrade", label: "B" },
  { id: "cGrade", label: "C" },
];

export type DispersionWindowInputs = {
  playsLikeBase: number;
  windSpeed: number;
  windDirection: WindDirection;
  skillLevel: DispersionSkillLevel;
  swingLength: SwingLength;
};

export type DispersionWindowResult = {
  optimalTarget: number;
  optimalTargetDisplay: string;
  longLeftDistance: number;
  shortRightDistance: number;
  longLeftLateral: number;
  shortRightLateral: number;
  avgSideMeters: number;
  totalLateralDispersion: number;
  longCarrySpread: number;
  shortCarrySpread: number;
  totalVerticalDispersion: number;
};

export function calculateDispersionWindow(
  inputs: DispersionWindowInputs,
): DispersionWindowResult | null {
  const { playsLikeBase, windSpeed, windDirection, skillLevel, swingLength } = inputs;
  if (!Number.isFinite(playsLikeBase) || playsLikeBase <= 0) return null;

  const skill = DISPERSION_SKILL_PROFILES[skillLevel];
  const swingThrottle = getSwingLengthModifiers(swingLength).dispersionTightener;
  const adjustedDistPercent = skill.distPercent * swingThrottle;
  const adjustedSideMeters = skill.sideMeters * swingThrottle;

  let longLeftDistFactor = 1 + adjustedDistPercent;
  let shortRightDistFactor = 1 - adjustedDistPercent;
  let longLeftLateral = adjustedSideMeters;
  let shortRightLateral = adjustedSideMeters;

  const wind = Math.max(0, windSpeed);

  if (windDirection === "head") {
    shortRightDistFactor -= wind * 0.0035;
    longLeftDistFactor -= wind * 0.001;
  } else if (windDirection === "tail") {
    shortRightDistFactor += wind * 0.0015;
    longLeftDistFactor += wind * 0.0025;
  } else if (windDirection === "leftToRight") {
    shortRightLateral += wind * 0.5;
  } else if (windDirection === "rightToLeft") {
    longLeftLateral += wind * 0.5;
  }

  const optimalTarget = Math.round(playsLikeBase);
  const longLeftDistance = Math.round(playsLikeBase * longLeftDistFactor);
  const shortRightDistance = Math.round(playsLikeBase * shortRightDistFactor);
  const longCarrySpread = longLeftDistance - optimalTarget;
  const shortCarrySpread = optimalTarget - shortRightDistance;

  return {
    optimalTarget,
    optimalTargetDisplay: (Math.round(playsLikeBase * 10) / 10).toFixed(1),
    longLeftDistance,
    shortRightDistance,
    longLeftLateral: Math.round(longLeftLateral),
    shortRightLateral: Math.round(shortRightLateral),
    avgSideMeters: Math.round(adjustedSideMeters),
    totalLateralDispersion: Math.round(adjustedSideMeters * 2),
    longCarrySpread,
    shortCarrySpread,
    totalVerticalDispersion: longCarrySpread + shortCarrySpread,
  };
}

export type StrategicMenuParams = {
  playerShape?: PlayerShape;
};

export function playerShapeToStockLabel(playerShape: PlayerShape): string {
  if (playerShape === "draw") return "Draw";
  if (playerShape === "fade") return "Fade";
  return "Straight";
}

export const PLAYER_SHAPE_LABELS: Record<PlayerShape, string> = {
  draw: "DRAW",
  straight: "STRAIGHT",
  fade: "FADE",
};

/** Elite API alias for 80% effort. */
export type EliteSwingEffort = "full" | "eighty_percent";

export type SwingEffort = "full" | "smooth80";

export const TRAJECTORY_OPTIONS: { id: Trajectory; label: string }[] = [
  { id: "low", label: "Low" },
  { id: "standard", label: "Standard" },
  { id: "high", label: "High" },
];

export const SWING_EFFORT_OPTIONS: { id: SwingEffort; label: string }[] = [
  { id: "full", label: "Full Swing" },
  { id: "smooth80", label: "80% Smooth" },
];

export const TRAJECTORY_LABELS: Record<Trajectory, string> = {
  low: "LOW",
  standard: "STANDARD",
  high: "HIGH",
};

export const SWING_EFFORT_LABELS: Record<SwingEffort, string> = {
  full: "Full Swing",
  smooth80: "80% Swing",
};

export type EliteGripProfile = {
  name: string;
  modifier: number;
  chokeInches: number;
  bias: string;
};

export const ULTIMATE_GRIP_PROFILES: EliteGripProfile[] = [
  { name: "Full Grip", modifier: 1, chokeInches: 0, bias: "Stock" },
  { name: 'Choked 1"', modifier: 0.96, chokeInches: 1, bias: "Fade Bias" },
  { name: 'Choked 2"', modifier: 0.92, chokeInches: 2, bias: "More Fade Bias" },
  { name: 'Choked 3"', modifier: 0.88, chokeInches: 3, bias: "Heavy Fade Bias" },
];

export const ELITE_GRIP_PROFILES = ULTIMATE_GRIP_PROFILES;

/** @deprecated Legacy grip list — prefer ELITE_GRIP_PROFILES */
export const GRIP_PROFILES = ELITE_GRIP_PROFILES.map((g, i) => ({
  id: ["full", "choke1", "choke2", "choke3"][i],
  label: g.name,
  factor: g.modifier,
}));

export type ClubMetrics = {
  launch: number;
  spin: number;
  descent: number;
};

export const CLUB_BASELINES: Record<string, ClubMetrics> = {
  Wedge: { launch: 24, spin: 9000, descent: 48 },
  "9 Iron": { launch: 20, spin: 7500, descent: 45 },
  "8 Iron": { launch: 20, spin: 7500, descent: 45 },
  "7 Iron": { launch: 17, spin: 6500, descent: 43 },
  "6 Iron": { launch: 17, spin: 6500, descent: 43 },
  "5 Iron": { launch: 14, spin: 5200, descent: 41 },
  "4 Iron": { launch: 14, spin: 4800, descent: 40 },
  Hybrid: { launch: 13, spin: 4500, descent: 39 },
  Wood: { launch: 11, spin: 3200, descent: 37 },
  Driver: { launch: 11, spin: 2500, descent: 36 },
};

const BASELINE_MATCH_ORDER = Object.keys(CLUB_BASELINES).sort(
  (a, b) => b.length - a.length,
);

const ELITE_7I_DESCENT_DEG = 43;
const GRAVITY_LOSS_MODIFIER = 1.3;
const DOWNHILL_SLOPE_FACTOR = 0.6;

export type ClubMetricsSource = {
  label: string;
  launchAngleDeg?: number | null;
  spinRateRpm?: number | null;
};

export type Club = {
  id: string;
  name: string;
  shortLabel: string;
  baseCarry: number;
};

export type PlaysLikeClubCarry = ClubMetricsSource & {
  id: string;
  shortLabel: string;
  baseCarryMetres: number;
};

export type ShotBlueprintInputs = {
  targetDistanceMetres: number;
  slopeMetres: number;
  windSpeed: number;
  windDirection: WindDirection;
};

export type ShotOption = {
  clubId: string;
  clubName: string;
  shortLabel: string;
  gripPosition: string;
  swingEffort: string;
  trajectory: string;
  shotShape: string;
  calculatedDistance: number;
  variance: number;
  notes: string;
  playsLikeTargetMetres: number;
};

export type ShotBlueprintOption = {
  clubId: string;
  clubName: string;
  shortLabel: string;
  gripLabel: string;
  gripFactor: number;
  trajectory: Trajectory;
  swingEffort: SwingEffort;
  playerShape: PlayerShape;
  shotShape: string;
  shotLabel: string;
  notes: string;
  playsLikeTargetMetres: number;
  effectiveCarryMetres: number;
  deltaMetres: number;
};

const MATCH_TOLERANCE_METRES = 3;

function isWithinShotTolerance(variance: number, elevationInput: number): boolean {
  const maxShortMiss = elevationInput > 0 ? 3 : 5;
  const maxLongMiss = 4;
  return variance >= -maxShortMiss && variance <= maxLongMiss;
}

export type BuildShotBlueprintOptionsParams = {
  toleranceMetres?: number;
  trajectory?: Trajectory;
  swingEffort?: SwingEffort;
  playerShape?: PlayerShape;
  swingLength?: SwingLength;
};

/** Bag carries are stock fade distances at standard flight. */
export function flightShapeModifier(
  playerShape: PlayerShape,
  shotTrajectory: Trajectory,
): number {
  if (playerShape === "fade") {
    if (shotTrajectory === "low") return 0.94;
    if (shotTrajectory === "high") return 0.93;
    return 1.0;
  }
  if (playerShape === "straight") return 1.03;
  if (playerShape === "draw") {
    if (shotTrajectory === "high") return 1.01;
    if (shotTrajectory === "low") return 1.02;
    return 1.03;
  }
  return 1.0;
}

function playerShapeBaselineMultiplier(playerShape: PlayerShape): number {
  return flightShapeModifier(playerShape, "standard");
}

export function shapeDistanceMultiplier(
  playerShape: PlayerShape,
  shotTrajectory: Trajectory = "standard",
): number {
  return flightShapeModifier(playerShape, shotTrajectory);
}

function shapeNameToPlayerShape(shapeName: string): PlayerShape {
  if (shapeName === "Draw") return "draw";
  if (shapeName === "Fade") return "fade";
  return "straight";
}

function shouldApplyLowHeadwindHangPenalty(
  trajectory: Trajectory,
  windDirection: WindDirection,
  shapeName: string,
): boolean {
  return trajectory === "low" && windDirection === "head" && shapeName !== "Fade";
}

function buildExecutionNote(
  playerShape: PlayerShape,
  chokeInches: number,
  shotTrajectory: Trajectory,
): string {
  if (playerShape === "draw" && chokeInches > 0) {
    return "Choking down straightens out your natural draw.";
  }
  if (playerShape === "fade" && chokeInches > 0) {
    return "Warning: Choking down will highly accentuate your fade. Play for extra cut.";
  }
  return `${TRAJECTORY_LABELS[shotTrajectory]} flight window.`;
}

function normalizeClubName(name: string): string {
  return name.toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ").trim();
}

export function getClubMetrics(club: ClubMetricsSource): ClubMetrics {
  const launchAngle = club.launchAngleDeg;
  const spinRate = club.spinRateRpm;

  if (
    launchAngle != null &&
    Number.isFinite(Number(launchAngle)) &&
    spinRate != null &&
    Number.isFinite(Number(spinRate))
  ) {
    const launch = Number(launchAngle);
    return {
      launch,
      spin: Number(spinRate),
      descent: launch > 18 ? 45 : 41,
    };
  }

  const normalized = normalizeClubName(club.label);
  const key = BASELINE_MATCH_ORDER.find((k) =>
    normalized.includes(normalizeClubName(k)),
  );

  return CLUB_BASELINES[key ?? "7 Iron"];
}

export function toEliteSwingEffort(effort: SwingEffort): EliteSwingEffort {
  return effort === "smooth80" ? "eighty_percent" : "full";
}

export function clampElevationInput(elevationInput: number): number {
  if (elevationInput > 20) return 20;
  if (elevationInput < -20) return -20;
  return elevationInput;
}

function resolveWindModel(
  windSpeedKmh: number,
  windDirection: WindDirection,
  shotTrajectory: Trajectory,
): { windMultiplier: number; hangTimePenalty: number; windMph: number } {
  const windKmh = Math.max(0, windSpeedKmh);
  const windMph = windKmh * 0.621371;

  let windMultiplier = 0.012;
  let hangTimePenalty = 1.0;

  if (shotTrajectory === "high") {
    windMultiplier = 0.016;
  } else if (shotTrajectory === "low") {
    windMultiplier = 0.008;
    if (windDirection === "head" && windKmh > 5) {
      hangTimePenalty = 1 - windMph * 0.003;
    }
  }

  return { windMultiplier, hangTimePenalty, windMph };
}

function getHangTimePenalty(
  windSpeedKmh: number,
  windDirection: WindDirection,
  shotTrajectory: Trajectory,
): number {
  return resolveWindModel(windSpeedKmh, windDirection, shotTrajectory).hangTimePenalty;
}

function applyWindAdjustment(
  playsLikeDistance: number,
  windSpeedKmh: number,
  windDirection: WindDirection,
  shotTrajectory: Trajectory = "standard",
): number {
  if (windDirection === "none" || windSpeedKmh <= 0) return playsLikeDistance;

  const { windMultiplier, windMph } = resolveWindModel(
    windSpeedKmh,
    windDirection,
    shotTrajectory,
  );

  if (windDirection === "head") {
    return playsLikeDistance * (1 + windMph * windMultiplier);
  }
  if (windDirection === "tail") {
    return playsLikeDistance * (1 - windMph * 0.005);
  }
  return playsLikeDistance;
}

/** Elite Plays Like: pin → elevation (7i + gravity loss) → wind. */
export function calculateElitePlaysLikeTarget(
  realDistance: number,
  elevationInput: number,
  windSpeed: number,
  windDirection: WindDirection,
  shotTrajectory: Trajectory = "standard",
): number | null {
  if (!Number.isFinite(realDistance) || realDistance <= 0) return null;

  const elevationChange = clampElevationInput(elevationInput);
  let playsLikeDistance = realDistance;

  if (elevationChange > 0) {
    const descentRad = (ELITE_7I_DESCENT_DEG * Math.PI) / 180;
    playsLikeDistance +=
      (elevationChange / Math.tan(descentRad)) * GRAVITY_LOSS_MODIFIER;
  } else if (elevationChange < 0) {
    playsLikeDistance += elevationChange * DOWNHILL_SLOPE_FACTOR;
  }

  playsLikeDistance = applyWindAdjustment(
    playsLikeDistance,
    windSpeed,
    windDirection,
    shotTrajectory,
  );
  return Math.round(playsLikeDistance * 10) / 10;
}

export function calculatePlaysLikeTarget(inputs: ShotBlueprintInputs): number | null {
  return calculateElitePlaysLikeTarget(
    inputs.targetDistanceMetres,
    inputs.slopeMetres,
    inputs.windSpeed,
    inputs.windDirection,
  );
}

function parseIronNumber(clubName: string): number | null {
  const match = clubName.replace(/\D/g, "");
  if (!match) return null;
  const n = parseInt(match, 10);
  return Number.isFinite(n) ? n : null;
}

function isMidLongIron(clubName: string): boolean {
  if (!clubName.toLowerCase().includes("iron")) return false;
  const ironNumber = parseIronNumber(clubName);
  return ironNumber != null && ironNumber <= 7;
}

export function clubsToEliteBag(clubs: PlaysLikeClubCarry[]): Club[] {
  return clubs.map((c) => ({
    id: c.id,
    name: c.label,
    shortLabel: c.shortLabel,
    baseCarry: c.baseCarryMetres,
  }));
}

export function generateUltimateShotOptions(
  realDistance: number,
  elevationInput: number,
  windSpeed: number,
  windDirection: WindDirection,
  shotTrajectory: Trajectory,
  swingEffort: EliteSwingEffort,
  playerShape: PlayerShape,
  clubBag: Club[],
  tolerance: number = MATCH_TOLERANCE_METRES,
  swingLength: SwingLength = "full",
): ShotOption[] {
  const elevationChange = clampElevationInput(elevationInput);
  const playsLikeTarget =
    calculateElitePlaysLikeTarget(
      realDistance,
      elevationInput,
      windSpeed,
      windDirection,
      shotTrajectory,
    ) ?? 0;

  const options: ShotOption[] = [];
  const effortMultiplier = swingEffort === "eighty_percent" ? 0.89 : 1;
  const { lengthMod } = getSwingLengthModifiers(swingLength);
  const trajectoryLabel = TRAJECTORY_LABELS[shotTrajectory];
  const swingLabel = swingEffort === "eighty_percent" ? "80%" : "Full";

  for (const club of clubBag) {
    if (!Number.isFinite(club.baseCarry) || club.baseCarry <= 0) continue;

    for (const grip of ULTIMATE_GRIP_PROFILES) {
      if (
        elevationChange > 10 &&
        isMidLongIron(club.name) &&
        grip.chokeInches > 1
      ) {
        continue;
      }

      const actualShotDistance = computeShapeTrajectoryCarry(
        club.baseCarry,
        playerShape,
        shotTrajectory,
        windSpeed,
        windDirection,
        grip.modifier * effortMultiplier,
        lengthMod,
      );
      const variance = actualShotDistance - playsLikeTarget;

      if (isWithinShotTolerance(variance, elevationChange)) {
        options.push({
          clubId: club.id,
          clubName: club.name,
          shortLabel: club.shortLabel,
          gripPosition: grip.name,
          swingEffort: swingLabel,
          trajectory: trajectoryLabel,
          shotShape: PLAYER_SHAPE_LABELS[playerShape],
          calculatedDistance: actualShotDistance,
          variance: Math.round(variance),
          notes: buildExecutionNote(playerShape, grip.chokeInches, shotTrajectory),
          playsLikeTargetMetres: playsLikeTarget,
        });
      }
    }
  }

  return options.sort(
    (a, b) => Math.abs(a.variance) - Math.abs(b.variance),
  );
}

/** @deprecated Use generateUltimateShotOptions */
export function generateEliteShotOptions(
  realDistance: number,
  elevationInput: number,
  windSpeed: number,
  windDirection: WindDirection,
  shotTrajectory: Trajectory,
  swingEffort: EliteSwingEffort,
  clubBag: Club[],
  tolerance: number = MATCH_TOLERANCE_METRES,
): ShotOption[] {
  return generateUltimateShotOptions(
    realDistance,
    elevationInput,
    windSpeed,
    windDirection,
    shotTrajectory,
    swingEffort,
    "straight",
    clubBag,
    tolerance,
  );
}

function ultimateToBlueprintOption(
  row: ShotOption,
  trajectory: Trajectory,
  swingEffort: SwingEffort,
  playerShape: PlayerShape,
): ShotBlueprintOption {
  const grip = ULTIMATE_GRIP_PROFILES.find((g) => g.name === row.gripPosition);
  return {
    clubId: row.clubId,
    clubName: row.clubName,
    shortLabel: row.shortLabel,
    gripLabel: row.gripPosition,
    gripFactor: grip?.modifier ?? 1,
    trajectory,
    swingEffort,
    playerShape,
    shotShape: row.shotShape,
    shotLabel: `${row.gripPosition} · ${row.swingEffort} · ${row.shotShape}`,
    notes: row.notes,
    playsLikeTargetMetres: row.playsLikeTargetMetres,
    effectiveCarryMetres: row.calculatedDistance,
    deltaMetres: Math.abs(row.variance),
  };
}

export function buildShotBlueprintOptions(
  inputs: ShotBlueprintInputs,
  clubs: PlaysLikeClubCarry[],
  params: BuildShotBlueprintOptionsParams = {},
): ShotBlueprintOption[] {
  const toleranceMetres = params.toleranceMetres ?? MATCH_TOLERANCE_METRES;
  const trajectory = params.trajectory ?? "standard";
  const swingEffort = params.swingEffort ?? "full";
  const playerShape = params.playerShape ?? "straight";
  const swingLength = params.swingLength ?? "full";

  const ultimate = generateUltimateShotOptions(
    inputs.targetDistanceMetres,
    inputs.slopeMetres,
    inputs.windSpeed,
    inputs.windDirection,
    trajectory,
    toEliteSwingEffort(swingEffort),
    playerShape,
    clubsToEliteBag(clubs),
    toleranceMetres,
    swingLength,
  );

  return ultimate.map((row) =>
    ultimateToBlueprintOption(row, trajectory, swingEffort, playerShape),
  );
}

export type TacticalShot = {
  clubName: string;
  grip: string;
  tempo: string;
  flight: string;
  shape: string;
  distance: number;
  label: string;
  gear?: "1 Club Up" | "2 Clubs Up";
  swingLength?: SwingLength;
  split?: {
    lowerClubName: string;
    lowerDistance: number;
    upperClubName: string;
    upperDistance: number;
  };
};

export type StrategicMenu = {
  standardOptions: TacticalShot[];
  flightOptions: TacticalShot[];
  gripOptions: TacticalShot[];
  shapeOptions: TacticalShot[];
  tempoOptions: TacticalShot[];
  swingLengthOptions: TacticalShot[];
};

export function clubsToStrategicBag(clubs: PlaysLikeClubCarry[]): Pick<Club, "name" | "baseCarry">[] {
  return clubs.map((c) => ({
    name: c.label,
    baseCarry: c.baseCarryMetres,
  }));
}

function computeShapeTrajectoryCarry(
  baseCarry: number,
  playerShape: PlayerShape,
  shotTrajectory: Trajectory,
  windSpeed: number,
  windDirection: WindDirection,
  gripMod = 1,
  lengthMod = 1,
): number {
  const flightShapeMod = flightShapeModifier(playerShape, shotTrajectory);
  let modifier = gripMod * flightShapeMod * lengthMod;
  const shapeName = playerShapeToStockLabel(playerShape);
  if (shouldApplyLowHeadwindHangPenalty(shotTrajectory, windDirection, shapeName)) {
    modifier *= getHangTimePenalty(windSpeed, windDirection, shotTrajectory);
  }
  return Math.round(baseCarry * modifier);
}

function shapeOptionLabel(shapeName: string, flight: "LOW" | "STANDARD" | "HIGH"): string {
  if (shapeName === "Fade" && flight === "HIGH") {
    return "HIGH FADE: High launch and spin stalls the ball — expect shorter carry.";
  }
  if (shapeName === "Fade" && flight === "LOW") {
    return "LOW FADE: Squeezed launch loses hang time on standard lies.";
  }
  if (shapeName === "Fade") {
    return "STANDARD FADE: Uses your entered bag carry — stock fade baseline.";
  }
  if (shapeName === "Draw" && flight === "HIGH") {
    return "HIGH FLIGHTED DRAW: Higher apex trades some forward distance for a softer landing.";
  }
  if (shapeName === "Draw" && flight === "LOW") {
    return "LOW DRAW: Penetrating flight holds line with a flatter, running trajectory.";
  }
  if (shapeName === "Draw") {
    return "STANDARD DRAW: Lower dynamic loft adds forward distance on a penetrating flight.";
  }
  return `${flight} ${shapeName.toUpperCase()}: Shape matched to your plays-like window.`;
}

function buildShapeOptions(
  clubBag: Pick<Club, "name" | "baseCarry">[],
  playsLikeBase: number,
  windSpeed: number,
  windDirection: WindDirection,
  elevationInput: number,
  lengthMod: number,
): TacticalShot[] {
  const candidates: TacticalShot[] = [];
  const shapeNames = ["Draw", "Fade"] as const;
  const trajectoryVariants: { flight: "LOW" | "STANDARD" | "HIGH"; trajectory: Trajectory }[] = [
    { flight: "STANDARD", trajectory: "standard" },
    { flight: "HIGH", trajectory: "high" },
    { flight: "LOW", trajectory: "low" },
  ];

  for (const club of clubBag) {
    if (!Number.isFinite(club.baseCarry) || club.baseCarry <= 0) continue;

    for (const shapeName of shapeNames) {
      const shapePlayerShape = shapeNameToPlayerShape(shapeName);

      for (const { flight, trajectory } of trajectoryVariants) {
        const dist = computeShapeTrajectoryCarry(
          club.baseCarry,
          shapePlayerShape,
          trajectory,
          windSpeed,
          windDirection,
          1,
          lengthMod,
        );
        const variance = dist - playsLikeBase;

        if (!isWithinShotTolerance(variance, elevationInput)) continue;

        candidates.push({
          clubName: club.name,
          grip: "Full Grip",
          tempo: "100%",
          flight,
          shape: shapeName,
          distance: dist,
          label: shapeOptionLabel(shapeName, flight),
        });
      }
    }
  }

  return candidates;
}

function isFullTempo(tempo: string): boolean {
  return tempo === "100%" || tempo.toLowerCase().includes("full");
}

function chokeGripRank(grip: string): number {
  if (grip === "Full Grip") return 0;
  const match = grip.match(/Choked (\d+)/);
  if (match) return Number(match[1]);
  return 99;
}

function flightEaseRank(flight: string): number {
  if (flight === "STANDARD") return 0;
  if (flight === "CONTROLLED") return 1;
  if (flight === "LOW") return 2;
  if (flight === "HIGH") return 3;
  return 4;
}

function executionEaseScore(shot: TacticalShot, playerShape: PlayerShape): number {
  const baselineShape = playerShapeToStockLabel(playerShape);
  const naturalShape = shot.shape === baselineShape;
  const fullTempo = isFullTempo(shot.tempo);

  if (naturalShape && fullTempo) {
    return chokeGripRank(shot.grip) * 10 + flightEaseRank(shot.flight);
  }
  if (naturalShape && !fullTempo) {
    return 100 + chokeGripRank(shot.grip) * 10 + flightEaseRank(shot.flight);
  }
  if (!naturalShape && fullTempo) {
    return 200 + chokeGripRank(shot.grip) * 10 + flightEaseRank(shot.flight);
  }
  return 300 + chokeGripRank(shot.grip) * 10 + flightEaseRank(shot.flight);
}

export function sortShotsByExecutionEase(
  shots: TacticalShot[],
  playerShape: PlayerShape,
): TacticalShot[] {
  return [...shots].sort(
    (a, b) => executionEaseScore(a, playerShape) - executionEaseScore(b, playerShape),
  );
}

const TEMPO_OPTIONS_LIMIT = 3;

function shotVarianceFromPlaysLike(shot: TacticalShot, playsLikeBase: number): number {
  return Math.abs(shot.distance - playsLikeBase);
}

function sortShotsByPlaysLikeProximity(
  shots: TacticalShot[],
  playsLikeBase: number,
  playerShape?: PlayerShape,
  baselineShapeName?: string,
): TacticalShot[] {
  return [...shots].sort((a, b) => {
    const proximityDiff =
      shotVarianceFromPlaysLike(a, playsLikeBase) - shotVarianceFromPlaysLike(b, playsLikeBase);
    if (proximityDiff !== 0) return proximityDiff;
    if (baselineShapeName) {
      const standardDiff =
        Number(isStandardDistanceShot(b, baselineShapeName)) -
        Number(isStandardDistanceShot(a, baselineShapeName));
      if (standardDiff !== 0) return standardDiff;
    }
    if (playerShape) {
      return executionEaseScore(a, playerShape) - executionEaseScore(b, playerShape);
    }
    return 0;
  });
}

type StandardCarryEntry = {
  club: Pick<Club, "name" | "baseCarry">;
  dist: number;
};

function isStandardDistanceShot(shot: TacticalShot, baselineShapeName: string): boolean {
  return (
    shot.grip === "Full Grip" &&
    shot.tempo === "100%" &&
    shot.flight === "STANDARD" &&
    shot.shape === baselineShapeName &&
    shot.swingLength == null
  );
}

function buildStandardCarryEntries(
  clubBag: Pick<Club, "name" | "baseCarry">[],
  playerShape: PlayerShape,
  windSpeed: number,
  windDirection: WindDirection,
  lengthMod = 1,
): StandardCarryEntry[] {
  return sortClubBagByCarry(clubBag).map((club) => ({
    club,
    dist: computeShapeTrajectoryCarry(
      club.baseCarry,
      playerShape,
      "standard",
      windSpeed,
      windDirection,
      1,
      lengthMod,
    ),
  }));
}

function findClosestStandardCarryEntry(
  entries: StandardCarryEntry[],
  playsLikeBase: number,
): StandardCarryEntry | null {
  if (entries.length === 0) return null;
  return entries.reduce((best, entry) =>
    Math.abs(entry.dist - playsLikeBase) < Math.abs(best.dist - playsLikeBase) ? entry : best,
  );
}

function findBetweenClubsPair(
  entries: StandardCarryEntry[],
  playsLikeBase: number,
): { lower: StandardCarryEntry; upper: StandardCarryEntry } | null {
  for (let i = 0; i < entries.length - 1; i++) {
    const lower = entries[i];
    const upper = entries[i + 1];
    if (lower.dist < playsLikeBase && playsLikeBase < upper.dist) {
      return { lower, upper };
    }
  }
  return null;
}

function buildStandardDistanceShot(
  entry: StandardCarryEntry,
  playsLikeBase: number,
  baselineShapeName: string,
): TacticalShot {
  const targetM = Math.round(playsLikeBase);
  return {
    clubName: entry.club.name,
    grip: "Full Grip",
    tempo: "100%",
    flight: "STANDARD",
    shape: baselineShapeName,
    distance: entry.dist,
    label: `STANDARD CARRY: Full ${entry.club.name} — ${entry.dist}m stock distance, closest to your ${targetM}m Plays Like target.`,
  };
}

function buildBetweenClubsShot(
  pair: { lower: StandardCarryEntry; upper: StandardCarryEntry },
  playsLikeBase: number,
  baselineShapeName: string,
): TacticalShot {
  const targetM = Math.round(playsLikeBase);
  const lowerBagM = Math.round(pair.lower.club.baseCarry);
  const upperBagM = Math.round(pair.upper.club.baseCarry);
  return {
    clubName: "Split yardage",
    grip: "Full Grip",
    tempo: "100%",
    flight: "STANDARD",
    shape: baselineShapeName,
    distance: targetM,
    label: `SPLIT YARDAGE: ${targetM}m Plays Like falls between these two full-swing carries.`,
    split: {
      lowerClubName: pair.lower.club.name,
      lowerDistance: lowerBagM,
      upperClubName: pair.upper.club.name,
      upperDistance: upperBagM,
    },
  };
}

function buildPinnedStandardDistanceShots(
  clubBag: Pick<Club, "name" | "baseCarry">[],
  playsLikeBase: number,
  playerShape: PlayerShape,
  baselineShapeName: string,
  windSpeed: number,
  windDirection: WindDirection,
): TacticalShot[] {
  const entries = buildStandardCarryEntries(
    clubBag,
    playerShape,
    windSpeed,
    windDirection,
    1,
  );
  const closest = findClosestStandardCarryEntry(entries, playsLikeBase);
  if (!closest) return [];

  const pinned: TacticalShot[] = [];
  const betweenPair = findBetweenClubsPair(entries, playsLikeBase);
  if (betweenPair) {
    pinned.push(buildBetweenClubsShot(betweenPair, playsLikeBase, baselineShapeName));
  } else {
    pinned.push(buildStandardDistanceShot(closest, playsLikeBase, baselineShapeName));
  }
  return pinned;
}

function selectShapeOptionsForDisplay(
  candidates: TacticalShot[],
  playsLikeBase: number,
  playerShape: PlayerShape = "straight",
  baselineShapeName?: string,
): TacticalShot[] {
  return sortShotsByPlaysLikeProximity(
    candidates,
    playsLikeBase,
    playerShape,
    baselineShapeName,
  ).slice(0, 2);
}

function sortClubBagByCarry(
  clubBag: Pick<Club, "name" | "baseCarry">[],
): Pick<Club, "name" | "baseCarry">[] {
  return [...clubBag]
    .filter((c) => Number.isFinite(c.baseCarry) && c.baseCarry > 0)
    .sort((a, b) => a.baseCarry - b.baseCarry);
}

const EXTREME_TEMPO_WIND_KMH = 12;
const TEMPO_MIN_MOD = 0.75;
const TEMPO_MAX_MOD = 0.99;

function isExtremeTempoEnvironment(
  windSpeed: number,
  windDirection: WindDirection,
): boolean {
  return windDirection !== "none" && windSpeed >= EXTREME_TEMPO_WIND_KMH;
}

function findTempoAnchorClub(
  sortedBag: Pick<Club, "name" | "baseCarry">[],
  playsLikeBase: number,
  playerShape: PlayerShape,
  windSpeed: number,
  windDirection: WindDirection,
  elevationInput: number,
  lengthMod: number,
): { club: Pick<Club, "name" | "baseCarry">; index: number } | null {
  if (sortedBag.length === 0) return null;

  let bestInTolerance: {
    club: Pick<Club, "name" | "baseCarry">;
    index: number;
    score: number;
  } | null = null;
  let bestFallback: {
    club: Pick<Club, "name" | "baseCarry">;
    index: number;
    score: number;
  } | null = null;

  for (let i = 0; i < sortedBag.length; i++) {
    const dist = computeShapeTrajectoryCarry(
      sortedBag[i].baseCarry,
      playerShape,
      "standard",
      windSpeed,
      windDirection,
      1,
      lengthMod,
    );
    const variance = dist - playsLikeBase;
    const score = Math.abs(variance);

    if (isWithinShotTolerance(variance, elevationInput)) {
      if (!bestInTolerance || score < bestInTolerance.score) {
        bestInTolerance = { club: sortedBag[i], index: i, score };
      }
    }
    if (!bestFallback || score < bestFallback.score) {
      bestFallback = { club: sortedBag[i], index: i, score };
    }
  }

  const pick = bestInTolerance ?? bestFallback;
  return pick ? { club: pick.club, index: pick.index } : null;
}

function formatSmoothTempoLabel(mod: number): string {
  const pct = Math.round(mod * 100);
  return `${pct}% Smooth Swing`;
}

function tryCalibratedTempoForClub(
  club: Pick<Club, "name" | "baseCarry">,
  playsLikeBase: number,
  playerShape: PlayerShape,
  windSpeed: number,
  windDirection: WindDirection,
  elevationInput: number,
  lengthMod: number,
): { mod: number; dist: number; variance: number } | null {
  const fullDist = computeShapeTrajectoryCarry(
    club.baseCarry,
    playerShape,
    "standard",
    windSpeed,
    windDirection,
    1,
    lengthMod,
  );
  if (!Number.isFinite(fullDist) || fullDist <= 0) return null;

  const requiredMod = playsLikeBase / fullDist;
  if (requiredMod < TEMPO_MIN_MOD || requiredMod > TEMPO_MAX_MOD) return null;

  const dist = computeShapeTrajectoryCarry(
    club.baseCarry,
    playerShape,
    "standard",
    windSpeed,
    windDirection,
    requiredMod,
    lengthMod,
  );
  const variance = dist - playsLikeBase;
  if (!isWithinShotTolerance(variance, elevationInput)) return null;

  return { mod: requiredMod, dist, variance };
}

function buildTempoMatchLabel(
  clubName: string,
  anchorClubName: string,
  dist: number,
  playsLikeBase: number,
  tempoLabel: string,
  windDirection: WindDirection,
  gear?: TacticalShot["gear"],
): string {
  const targetM = Math.round(playsLikeBase);
  const carryM = Math.round(dist);
  if (windDirection === "tail" && gear === "1 Club Up") {
    return `TAILWIND ADJUSTMENT: ${tempoLabel} with ${clubName} — ${carryM}m carry matches your ${targetM}m Plays Like target.`;
  }
  if (gear === "2 Clubs Up") {
    return `${tempoLabel} with ${clubName} — ${carryM}m carry matches your ${targetM}m Plays Like target (extreme wind backup).`;
  }
  if (gear === "1 Club Up") {
    return `${tempoLabel} with ${clubName} — ${carryM}m carry matches your ${targetM}m Plays Like target (same distance as a full ${anchorClubName}).`;
  }
  return `${tempoLabel} with ${clubName} — ${carryM}m carry matches your ${targetM}m Plays Like target.`;
}

function buildTempoOptions(
  clubBag: Pick<Club, "name" | "baseCarry">[],
  playsLikeBase: number,
  playerShape: PlayerShape,
  baselineShapeName: string,
  windSpeed: number,
  windDirection: WindDirection,
  elevationInput: number,
  lengthMod: number,
): TacticalShot[] {
  const sortedBag = sortClubBagByCarry(clubBag);
  const anchor = findTempoAnchorClub(
    sortedBag,
    playsLikeBase,
    playerShape,
    windSpeed,
    windDirection,
    elevationInput,
    lengthMod,
  );
  if (!anchor) return [];

  type TempoCandidate = TacticalShot & { absVariance: number };

  const candidates: TempoCandidate[] = [];

  for (let i = 0; i < sortedBag.length; i++) {
    const club = sortedBag[i];
    const calibrated = tryCalibratedTempoForClub(
      club,
      playsLikeBase,
      playerShape,
      windSpeed,
      windDirection,
      elevationInput,
      lengthMod,
    );
    if (!calibrated) continue;

    const clubsFromAnchor = i - anchor.index;
    const gear =
      clubsFromAnchor === 1
        ? ("1 Club Up" as const)
        : clubsFromAnchor === 2
          ? ("2 Clubs Up" as const)
          : undefined;

    if (
      gear === "2 Clubs Up" &&
      (!isExtremeTempoEnvironment(windSpeed, windDirection) || windDirection === "tail")
    ) {
      continue;
    }

    const tempoLabel = formatSmoothTempoLabel(calibrated.mod);
    const duplicate = candidates.some(
      (c) => c.clubName === club.name && c.tempo === tempoLabel,
    );
    if (duplicate) continue;

    candidates.push({
      clubName: club.name,
      grip: "Full Grip",
      tempo: tempoLabel,
      flight: windDirection === "tail" ? "STANDARD" : "CONTROLLED",
      shape: baselineShapeName,
      distance: calibrated.dist,
      label: buildTempoMatchLabel(
        club.name,
        anchor.club.name,
        calibrated.dist,
        playsLikeBase,
        tempoLabel,
        windDirection,
        gear,
      ),
      gear,
      absVariance: Math.abs(calibrated.variance),
    });
  }

  const ranked = sortShotsByPlaysLikeProximity(
    candidates.map(({ absVariance: _v, ...shot }) => shot),
    playsLikeBase,
    undefined,
    baselineShapeName,
  );

  return ranked.slice(0, TEMPO_OPTIONS_LIMIT);
}

function buildSwingLengthOptions(
  clubBag: Pick<Club, "name" | "baseCarry">[],
  playsLikeBase: number,
  playerShape: PlayerShape,
  baselineShapeName: string,
  windSpeed: number,
  windDirection: WindDirection,
  elevationInput: number,
): TacticalShot[] {
  const sortedBag = sortClubBagByCarry(clubBag);
  const options: TacticalShot[] = [];
  const targetM = Math.round(playsLikeBase);

  for (const { id, label } of SWING_LENGTH_OPTIONS) {
    const { lengthMod } = getSwingLengthModifiers(id);
    let best: {
      club: Pick<Club, "name" | "baseCarry">;
      dist: number;
      variance: number;
    } | null = null;

    for (const club of sortedBag) {
      const dist = computeShapeTrajectoryCarry(
        club.baseCarry,
        playerShape,
        "standard",
        windSpeed,
        windDirection,
        1,
        lengthMod,
      );
      const variance = dist - playsLikeBase;
      if (!isWithinShotTolerance(variance, elevationInput)) continue;
      if (!best || Math.abs(variance) < Math.abs(best.variance)) {
        best = { club, dist, variance };
      }
    }

    if (!best) continue;

    options.push({
      clubName: best.club.name,
      grip: "Full Grip",
      tempo: "100%",
      flight: "STANDARD",
      shape: baselineShapeName,
      distance: best.dist,
      swingLength: id,
      label: `${label} with ${best.club.name} — ${Math.round(best.dist)}m carry matches your ${targetM}m Plays Like target.`,
    });
  }

  return sortShotsByPlaysLikeProximity(options, playsLikeBase, undefined, baselineShapeName);
}

function flightToTrajectory(flight: "LOW" | "STANDARD" | "HIGH"): Trajectory {
  if (flight === "LOW") return "low";
  if (flight === "HIGH") return "high";
  return "standard";
}

export function generateStrategicMenu(
  realDistance: number,
  elevation: number,
  windSpeed: number,
  windDirection: WindDirection,
  clubBag: Pick<Club, "name" | "baseCarry">[],
  params: StrategicMenuParams = {},
): StrategicMenu {
  const playerShape = params.playerShape ?? "straight";
  const baselineShapeName = playerShapeToStockLabel(playerShape);
  let slopeAdjustedBase = realDistance;
  const slope = elevation > 20 ? 20 : elevation < -20 ? -20 : elevation;

  if (slope > 0) {
    slopeAdjustedBase +=
      (slope / Math.tan((ELITE_7I_DESCENT_DEG * Math.PI) / 180)) * GRAVITY_LOSS_MODIFIER;
  } else if (slope < 0) {
    slopeAdjustedBase += slope * DOWNHILL_SLOPE_FACTOR;
  }

  const flightCandidates: TacticalShot[] = [];
  const gripCandidates: TacticalShot[] = [];

  const grips = [
    { name: "Full Grip", mod: 1, inches: 0 },
    { name: 'Choked 1"', mod: 0.96, inches: 1 },
    { name: 'Choked 2"', mod: 0.92, inches: 2 },
    { name: 'Choked 3"', mod: 0.88, inches: 3 },
  ];

  const shapes = [{ name: "Draw" }, { name: "Straight" }, { name: "Fade" }];

  const flights = ["LOW", "STANDARD", "HIGH"] as const;

  const flightWindTargets = flights.map((f) => ({
    flight: f,
    trajectory: flightToTrajectory(f),
  }));

  const playsLikeBase = applyWindAdjustment(
    slopeAdjustedBase,
    windSpeed,
    windDirection,
    "standard",
  );

  for (const club of clubBag) {
    if (!Number.isFinite(club.baseCarry) || club.baseCarry <= 0) continue;

    const isIron = club.name.toLowerCase().includes("iron");
    const ironNum = parseIronNumber(club.name);
    const isChokedLongIron = slope > 10 && isIron && ironNum != null && ironNum <= 7;

    for (const g of grips) {
      for (const s of shapes) {
        if (isChokedLongIron && g.inches > 1) continue;

        for (const { flight: f, trajectory } of flightWindTargets) {
          const dist = computeShapeTrajectoryCarry(
            club.baseCarry,
            playerShape,
            trajectory,
            windSpeed,
            windDirection,
            g.mod,
          );

          const variance = dist - playsLikeBase;

          if (isWithinShotTolerance(variance, slope)) {
            const isBaselineShape = s.name === baselineShapeName;

            if (isBaselineShape && g.inches === 0) {
              flightCandidates.push({
                clubName: club.name,
                grip: g.name,
                tempo: "100%",
                flight: f,
                shape: s.name,
                distance: dist,
                label: `${f} FLIGHT: Perfect for manipulating stopping power.`,
              });
            }

            if (isBaselineShape && g.inches > 0 && f === "STANDARD") {
              gripCandidates.push({
                clubName: club.name,
                grip: g.name,
                tempo: "100%",
                flight: f,
                shape: s.name,
                distance: dist,
                label: `${g.name.toUpperCase()}: Choke down for precise carry control at standard flight.`,
              });
            }
          }
        }
      }
    }
  }

  const shapeCandidates = buildShapeOptions(
    clubBag,
    playsLikeBase,
    windSpeed,
    windDirection,
    slope,
    1,
  );

  const pinnedStandardShots = buildPinnedStandardDistanceShots(
    clubBag,
    playsLikeBase,
    playerShape,
    baselineShapeName,
    windSpeed,
    windDirection,
  );

  const flightSorted = sortShotsByPlaysLikeProximity(
    flightCandidates,
    playsLikeBase,
    playerShape,
    baselineShapeName,
  ).slice(0, 2);

  const gripSorted = sortShotsByPlaysLikeProximity(
    gripCandidates,
    playsLikeBase,
    playerShape,
    baselineShapeName,
  ).slice(0, 2);

  const shapeSorted = selectShapeOptionsForDisplay(
    shapeCandidates,
    playsLikeBase,
    playerShape,
    baselineShapeName,
  );

  const tempoSorted = buildTempoOptions(
    clubBag,
    playsLikeBase,
    playerShape,
    baselineShapeName,
    windSpeed,
    windDirection,
    slope,
    1,
  );

  const swingLengthSorted = buildSwingLengthOptions(
    clubBag,
    playsLikeBase,
    playerShape,
    baselineShapeName,
    windSpeed,
    windDirection,
    slope,
  );

  return {
    standardOptions: pinnedStandardShots,
    flightOptions: flightSorted,
    gripOptions: gripSorted,
    shapeOptions: shapeSorted,
    tempoOptions: tempoSorted.slice(0, TEMPO_OPTIONS_LIMIT),
    swingLengthOptions: swingLengthSorted,
  };
}

export function clubsToCarryList(
  clubs: Array<{
    id: string;
    label: string;
    shortLabel: string;
    baseCarryMetres: number | null;
    launchAngleDeg?: number | null;
    spinRateRpm?: number | null;
  }>,
): PlaysLikeClubCarry[] {
  return clubs
    .filter((c) => c.baseCarryMetres != null && c.baseCarryMetres > 0)
    .map((c) => ({
      id: c.id,
      label: c.label,
      shortLabel: c.shortLabel,
      baseCarryMetres: c.baseCarryMetres as number,
      launchAngleDeg: c.launchAngleDeg,
      spinRateRpm: c.spinRateRpm,
    }));
}
