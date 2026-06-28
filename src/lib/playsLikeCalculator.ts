export type WindDirection = "head" | "tail" | "none";

export type Trajectory = "low" | "standard" | "high";

export type PlayerShape = "draw" | "straight" | "fade";

export const PLAYER_SHAPE_OPTIONS: { id: PlayerShape; label: string }[] = [
  { id: "straight", label: "Straight" },
  { id: "draw", label: "Draw" },
  { id: "fade", label: "Fade" },
];

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
    if (shotTrajectory === "low") return 1.02;
    return 1.06;
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
};

export type StrategicMenu = {
  flightOptions: TacticalShot[];
  shapeOptions: TacticalShot[];
  tempoOptions: TacticalShot[];
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
): number {
  const flightShapeMod = flightShapeModifier(playerShape, shotTrajectory);
  let modifier = gripMod * flightShapeMod;
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
  return `${flight} ${shapeName.toUpperCase()}: Shape matched to your plays-like window.`;
}

function buildShapeOptions(
  clubBag: Pick<Club, "name" | "baseCarry">[],
  playsLikeBase: number,
  windSpeed: number,
  windDirection: WindDirection,
  elevationInput: number,
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

function selectShapeOptionsForDisplay(
  candidates: TacticalShot[],
  playerShape: PlayerShape = "straight",
): TacticalShot[] {
  return sortShotsByExecutionEase(candidates, playerShape).slice(0, 2);
}

function sortClubBagByCarry(
  clubBag: Pick<Club, "name" | "baseCarry">[],
): Pick<Club, "name" | "baseCarry">[] {
  return [...clubBag]
    .filter((c) => Number.isFinite(c.baseCarry) && c.baseCarry > 0)
    .sort((a, b) => a.baseCarry - b.baseCarry);
}

const TEMPO_ONE_CLUB_SMOOTH = { name: "85% Smooth Swing", mod: 0.91 } as const;
const TEMPO_TWO_CLUB_SMOOTH = { name: "75% Three-Quarter", mod: 0.84 } as const;
const EXTREME_TEMPO_WIND_KMH = 12;

function isExtremeTempoEnvironment(
  windSpeed: number,
  windDirection: WindDirection,
): boolean {
  return windDirection !== "none" && windSpeed >= EXTREME_TEMPO_WIND_KMH;
}

function buildTempoOptions(
  clubBag: Pick<Club, "name" | "baseCarry">[],
  playsLikeBase: number,
  playerShape: PlayerShape,
  baselineShapeName: string,
  windSpeed: number,
  windDirection: WindDirection,
): TacticalShot[] {
  const sortedBag = sortClubBagByCarry(clubBag);
  const options: TacticalShot[] = [];

  for (let baseIndex = 0; baseIndex < sortedBag.length - 1; baseIndex++) {
    const baseClub = sortedBag[baseIndex];
    const oneClubUp = sortedBag[baseIndex + 1];

    const dist = computeShapeTrajectoryCarry(
      oneClubUp.baseCarry,
      playerShape,
      "standard",
      windSpeed,
      windDirection,
      TEMPO_ONE_CLUB_SMOOTH.mod,
    );
    const variance = dist - playsLikeBase;
    if (variance < -3 || variance > 4) continue;

    let label = `1 CLUB UP: Smooth 85% with ${oneClubUp.name} — full ${baseClub.name} is your base club for this distance.`;
    if (windDirection === "tail") {
      label =
        "TAILWIND ADJUSTMENT: Smooth 1-club up to control the distance while maintaining a safe landing angle.";
    }

    options.push({
      clubName: oneClubUp.name,
      grip: "Full Grip",
      tempo: TEMPO_ONE_CLUB_SMOOTH.name,
      flight: windDirection === "tail" ? "STANDARD" : "CONTROLLED",
      shape: baselineShapeName,
      distance: dist,
      label,
      gear: "1 Club Up",
    });
    break;
  }

  const extreme = isExtremeTempoEnvironment(windSpeed, windDirection);
  if (extreme && windDirection !== "tail") {
    for (let baseIndex = 0; baseIndex < sortedBag.length - 2; baseIndex++) {
      const baseClub = sortedBag[baseIndex];
      const twoClubUp = sortedBag[baseIndex + 2];

      const dist = computeShapeTrajectoryCarry(
        twoClubUp.baseCarry,
        playerShape,
        "standard",
        windSpeed,
        windDirection,
        TEMPO_TWO_CLUB_SMOOTH.mod,
      );
      const variance = dist - playsLikeBase;
      if (variance < -3 || variance > 4) continue;

      options.push({
        clubName: twoClubUp.name,
        grip: "Full Grip",
        tempo: TEMPO_TWO_CLUB_SMOOTH.name,
        flight: "CONTROLLED",
        shape: baselineShapeName,
        distance: dist,
        label: `2 CLUBS UP (extreme wind backup): Smooth 75% with ${twoClubUp.name} when ${baseClub.name} window is blown out.`,
        gear: "2 Clubs Up",
      });
      break;
    }
  }

  return options;
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

  const flightOptions: TacticalShot[] = [];

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
            const shotObj: TacticalShot = {
              clubName: club.name,
              grip: g.name,
              tempo: "100%",
              flight: f,
              shape: s.name,
              distance: dist,
              label: `${f} FLIGHT: Perfect for manipulating stopping power.`,
            };

            const isBaselineShape = s.name === baselineShapeName;
            const isChokeOption = g.inches > 0;
            const isEasiestFullGrip = g.inches === 0 && f === "STANDARD";
            if (isBaselineShape && (isChokeOption || isEasiestFullGrip)) {
              flightOptions.push(shotObj);
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
  );

  const tempoOptions = buildTempoOptions(
    clubBag,
    playsLikeBase,
    playerShape,
    baselineShapeName,
    windSpeed,
    windDirection,
  );

  return {
    flightOptions: sortShotsByExecutionEase(flightOptions, playerShape).slice(0, 2),
    shapeOptions: selectShapeOptionsForDisplay(shapeCandidates, playerShape),
    tempoOptions: tempoOptions.slice(0, 2),
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
