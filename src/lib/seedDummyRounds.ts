export type DirectionalApproachShot = {
  id: string;
  hole: number;
  club: string;
  result: string;
};

type SeedPuttingLog = {
  hole: number;
  puttNumber: number;
  made: boolean;
  distanceFeet: number;
  break: "left_to_right" | "straight" | "right_to_left" | "double_breaker";
  missLine?: "high" | "low" | "good" | null;
  missLength?: "long" | "short" | "good" | null;
};

export type DummyRoundInsert = {
  date: string;
  course_name: string;
  handicap: number;
  holes: number;
  score: number;
  nett: number;
  eagles: number;
  birdies: number;
  pars: number;
  bogeys: number;
  double_bogeys: number;
  fir_left: number;
  fir_hit: number;
  fir_right: number;
  total_gir: number;
  total_penalties: number;
  tee_penalties: number;
  approach_penalties: number;
  going_for_green: number;
  gir_8ft: number;
  gir_20ft: number;
  up_and_down_conversions: number;
  conversions: number;
  up_and_down_missed: number;
  missed: number;
  bunker_attempts: number;
  bunker_saves: number;
  chip_inside_6ft: number;
  double_chips: number;
  chip_ins: number;
  total_putts: number;
  three_putts: number;
  made_under_6ft: number;
  putts_under_6ft_attempts: number;
  approach_directional_shots: DirectionalApproachShot[];
  putting_logs: SeedPuttingLog[];
  share_on_community: boolean;
};

function approachShots(
  entries: Array<[number, string, string]>,
): DirectionalApproachShot[] {
  return entries.map(([hole, club, result], i) => ({
    id: `seed-shot-${hole}-${i}`,
    hole,
    club,
    result,
  }));
}

export const DUMMY_ROUND_TEMPLATES: DummyRoundInsert[] = [
  {
    date: "2026-05-10",
    course_name: "Twin Creeks Golf Club",
    handicap: 12.4,
    holes: 18,
    score: 81,
    nett: 68.6,
    eagles: 0,
    birdies: 2,
    pars: 7,
    bogeys: 7,
    double_bogeys: 2,
    fir_left: 4,
    fir_hit: 7,
    fir_right: 3,
    total_gir: 9,
    total_penalties: 2,
    tee_penalties: 1,
    approach_penalties: 1,
    going_for_green: 14,
    gir_8ft: 3,
    gir_20ft: 6,
    up_and_down_conversions: 3,
    conversions: 3,
    up_and_down_missed: 2,
    missed: 2,
    bunker_attempts: 2,
    bunker_saves: 1,
    chip_inside_6ft: 4,
    double_chips: 0,
    chip_ins: 0,
    total_putts: 32,
    three_putts: 1,
    made_under_6ft: 11,
    putts_under_6ft_attempts: 14,
    approach_directional_shots: approachShots([
      [1, "7i", "left"],
      [2, "pw", "gir"],
      [3, "8i", "bottom-right"],
      [4, "hybrid", "tee-no-gir"],
      [5, "9i", "gir"],
      [6, "pw", "top"],
      [7, "7i", "right"],
      [8, "sw", "gir"],
      [9, "5i", "bottom"],
      [10, "8i", "gir"],
      [11, "pw", "left"],
      [12, "7i", "distance-no-gir"],
      [13, "9i", "gir"],
      [14, "lw", "bottom-left"],
      [15, "6i", "gir"],
      [16, "pw", "top-right"],
      [17, "8i", "gir"],
      [18, "9i", "right"],
    ]),
    putting_logs: [
      { hole: 1, puttNumber: 1, made: false, distanceFeet: 22, break: "left_to_right", missLine: "low", missLength: "long" },
      { hole: 1, puttNumber: 2, made: true, distanceFeet: 4, break: "left_to_right" },
      { hole: 2, puttNumber: 1, made: true, distanceFeet: 8, break: "straight" },
      { hole: 3, puttNumber: 1, made: false, distanceFeet: 15, break: "right_to_left", missLine: "high", missLength: "short" },
      { hole: 3, puttNumber: 2, made: true, distanceFeet: 3, break: "right_to_left" },
      { hole: 5, puttNumber: 1, made: true, distanceFeet: 12, break: "left_to_right" },
      { hole: 7, puttNumber: 1, made: false, distanceFeet: 25, break: "double_breaker", missLine: "low", missLength: "long" },
      { hole: 7, puttNumber: 2, made: false, distanceFeet: 6, break: "double_breaker", missLine: "high", missLength: "short" },
      { hole: 7, puttNumber: 3, made: true, distanceFeet: 2, break: "double_breaker" },
      { hole: 9, puttNumber: 1, made: true, distanceFeet: 5, break: "straight" },
      { hole: 11, puttNumber: 1, made: false, distanceFeet: 18, break: "right_to_left", missLine: "high", missLength: "long" },
      { hole: 11, puttNumber: 2, made: true, distanceFeet: 4, break: "right_to_left" },
      { hole: 14, puttNumber: 1, made: true, distanceFeet: 10, break: "left_to_right" },
      { hole: 16, puttNumber: 1, made: false, distanceFeet: 7, break: "straight", missLine: "low", missLength: "short" },
      { hole: 16, puttNumber: 2, made: true, distanceFeet: 3, break: "straight" },
      { hole: 18, puttNumber: 1, made: true, distanceFeet: 14, break: "left_to_right" },
    ],
    share_on_community: true,
  },
  {
    date: "2026-04-22",
    course_name: "Pebble Beach Golf Links",
    handicap: 12.4,
    holes: 18,
    score: 88,
    nett: 75.6,
    eagles: 0,
    birdies: 1,
    pars: 5,
    bogeys: 9,
    double_bogeys: 3,
    fir_left: 5,
    fir_hit: 5,
    fir_right: 4,
    total_gir: 6,
    total_penalties: 4,
    tee_penalties: 2,
    approach_penalties: 2,
    going_for_green: 12,
    gir_8ft: 1,
    gir_20ft: 3,
    up_and_down_conversions: 2,
    conversions: 2,
    up_and_down_missed: 4,
    missed: 4,
    bunker_attempts: 3,
    bunker_saves: 1,
    chip_inside_6ft: 2,
    double_chips: 1,
    chip_ins: 0,
    total_putts: 35,
    three_putts: 3,
    made_under_6ft: 8,
    putts_under_6ft_attempts: 12,
    approach_directional_shots: approachShots([
      [1, "hybrid", "bottom"],
      [2, "pw", "left"],
      [3, "7i", "tee-no-gir"],
      [4, "9i", "gir"],
      [5, "8i", "right"],
      [6, "sw", "bottom-right"],
      [7, "6i", "top-left"],
      [8, "pw", "gir"],
      [9, "5i", "distance-no-gir"],
      [10, "7i", "bottom"],
      [11, "9i", "left"],
      [12, "8i", "gir"],
      [13, "lw", "bottom"],
      [14, "7i", "right"],
      [15, "pw", "gir"],
      [16, "8i", "top"],
      [17, "9i", "bottom-left"],
      [18, "7i", "right"],
    ]),
    putting_logs: [
      { hole: 2, puttNumber: 1, made: false, distanceFeet: 20, break: "right_to_left", missLine: "high", missLength: "long" },
      { hole: 2, puttNumber: 2, made: true, distanceFeet: 5, break: "right_to_left" },
      { hole: 6, puttNumber: 1, made: false, distanceFeet: 8, break: "straight", missLine: "low", missLength: "short" },
      { hole: 6, puttNumber: 2, made: false, distanceFeet: 4, break: "straight", missLine: "high", missLength: "long" },
      { hole: 6, puttNumber: 3, made: true, distanceFeet: 2, break: "straight" },
      { hole: 12, puttNumber: 1, made: true, distanceFeet: 16, break: "left_to_right" },
    ],
    share_on_community: false,
  },
  {
    date: "2026-03-15",
    course_name: "Bandon Dunes (Front 9)",
    handicap: 13.1,
    holes: 9,
    score: 42,
    nett: 28.9,
    eagles: 0,
    birdies: 1,
    pars: 3,
    bogeys: 4,
    double_bogeys: 1,
    fir_left: 2,
    fir_hit: 4,
    fir_right: 1,
    total_gir: 4,
    total_penalties: 1,
    tee_penalties: 0,
    approach_penalties: 1,
    going_for_green: 7,
    gir_8ft: 1,
    gir_20ft: 2,
    up_and_down_conversions: 2,
    conversions: 2,
    up_and_down_missed: 1,
    missed: 1,
    bunker_attempts: 1,
    bunker_saves: 0,
    chip_inside_6ft: 2,
    double_chips: 0,
    chip_ins: 0,
    total_putts: 17,
    three_putts: 0,
    made_under_6ft: 5,
    putts_under_6ft_attempts: 7,
    approach_directional_shots: approachShots([
      [1, "7i", "gir"],
      [2, "pw", "left"],
      [3, "8i", "bottom"],
      [4, "9i", "gir"],
      [5, "sw", "top-right"],
      [6, "7i", "right"],
      [7, "pw", "gir"],
      [8, "8i", "bottom-left"],
      [9, "9i", "gir"],
    ]),
    putting_logs: [
      { hole: 1, puttNumber: 1, made: true, distanceFeet: 6, break: "left_to_right" },
      { hole: 3, puttNumber: 1, made: false, distanceFeet: 11, break: "straight", missLine: "low", missLength: "short" },
      { hole: 3, puttNumber: 2, made: true, distanceFeet: 3, break: "straight" },
      { hole: 7, puttNumber: 1, made: true, distanceFeet: 9, break: "right_to_left" },
    ],
    share_on_community: true,
  },
];

export function buildDummyRoundsForUser(userId: string) {
  return DUMMY_ROUND_TEMPLATES.map((round) => ({
    user_id: userId,
    ...round,
  }));
}
