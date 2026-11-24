/** Hevy-style weight training: exercise library, active workouts, routines, history (on-device). */

export type MuscleGroup =
  | "Chest"
  | "Back"
  | "Shoulders"
  | "Arms"
  | "Legs"
  | "Core"
  | "Olympic"
  | "Cardio"
  | "Golf";

export type Exercise = {
  id: string;
  name: string;
  muscle: MuscleGroup;
  /** Tool / machine / free weight used. */
  equipment?: string;
  /** Grip or stance note (e.g. overhand, neutral, sumo). */
  grip?: string;
  custom?: boolean;
};

export type WorkoutSet = {
  id: string;
  /** kg */
  weight: number | null;
  reps: number | null;
  completed: boolean;
};

export type WorkoutExercise = {
  id: string;
  exerciseId: string;
  name: string;
  muscle: MuscleGroup;
  equipment?: string;
  grip?: string;
  sets: WorkoutSet[];
  note?: string;
};

export type PersonalBestHit = {
  exerciseId: string;
  name: string;
  weight: number;
  reps: number;
  estimatedOneRm: number;
  previousBestOneRm: number | null;
};

export type WorkoutSession = {
  id: string;
  title: string;
  startedAt: string;
  finishedAt: string | null;
  /** Null until the player taps Start timer — clock does not run automatically. */
  timerStartedAt: string | null;
  /** Extra ms counted before the current timerStartedAt (after pause/resume). */
  timerOffsetMs: number;
  exercises: WorkoutExercise[];
  /** Exercises that set a new estimated 1RM when this workout was finished. */
  personalBests?: PersonalBestHit[];
  /** Body weight (kg) used for bodyweight-exercise volume in this session. */
  bodyWeightKg?: number | null;
};

export type WorkoutRoutine = {
  id: string;
  name: string;
  exerciseIds: string[];
  updatedAt: string;
};

const WORKOUTS_KEY = "weight_training_workouts_v1";
const ROUTINES_KEY = "weight_training_routines_v1";
const ACTIVE_KEY = "weight_training_active_v1";
const CUSTOM_EXERCISES_KEY = "weight_training_custom_exercises_v1";
const BODY_WEIGHT_KEY = "weight_training_body_weight_kg_v1";

function uid(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const MUSCLE_GROUPS: MuscleGroup[] = [
  "Golf",
  "Legs",
  "Back",
  "Chest",
  "Shoulders",
  "Arms",
  "Core",
  "Olympic",
  "Cardio",
];

/** Built-in library — large Hevy-style catalog plus golf-specific work. */
export const EXERCISE_LIBRARY: Exercise[] = [
  // —— Golf / rotational / golf-fitness ——
  { id: "cable-rotation", name: "Cable Rotation", muscle: "Golf", equipment: "Cable" },
  { id: "cable-woodchop-high-to-low", name: "Cable Woodchop (High to Low)", muscle: "Golf", equipment: "Cable" },
  { id: "cable-woodchop-low-to-high", name: "Cable Woodchop (Low to High)", muscle: "Golf", equipment: "Cable" },
  { id: "half-kneeling-chop", name: "Half-Kneeling Chop", muscle: "Golf", equipment: "Cable" },
  { id: "half-kneeling-lift", name: "Half-Kneeling Lift", muscle: "Golf", equipment: "Cable" },
  { id: "pallof-press", name: "Pallof Press", muscle: "Golf", equipment: "Cable / band" },
  { id: "pallof-press-overhead", name: "Pallof Press to Overhead", muscle: "Golf", equipment: "Cable / band" },
  { id: "landmine-rotation", name: "Landmine Rotation", muscle: "Golf", equipment: "Barbell" },
  { id: "landmine-press-rotation", name: "Landmine Press + Rotation", muscle: "Golf", equipment: "Barbell" },
  { id: "medicine-ball-rotational-throw", name: "Med Ball Rotational Throw", muscle: "Golf", equipment: "Med ball" },
  { id: "medicine-ball-side-toss", name: "Med Ball Side Toss", muscle: "Golf", equipment: "Med ball" },
  { id: "medicine-ball-slam", name: "Med Ball Slam", muscle: "Golf", equipment: "Med ball" },
  { id: "medicine-ball-scoop-toss", name: "Med Ball Scoop Toss", muscle: "Golf", equipment: "Med ball" },
  { id: "medicine-ball-rotational-slam", name: "Med Ball Rotational Slam", muscle: "Golf", equipment: "Med ball" },
  { id: "single-leg-rdl", name: "Single-Leg RDL", muscle: "Golf", equipment: "Dumbbell" },
  { id: "single-leg-glute-bridge", name: "Single-Leg Glute Bridge", muscle: "Golf", equipment: "Bodyweight" },
  { id: "copenhagen-adductor", name: "Copenhagen Adductor", muscle: "Golf", equipment: "Bodyweight" },
  { id: "cable-anti-rotation-hold", name: "Cable Anti-Rotation Hold", muscle: "Golf", equipment: "Cable" },
  { id: "band-external-rotation", name: "Band External Rotation", muscle: "Golf", equipment: "Band" },
  { id: "band-internal-rotation", name: "Band Internal Rotation", muscle: "Golf", equipment: "Band" },
  { id: "prone-y-raise", name: "Prone Y Raise", muscle: "Golf", equipment: "Bodyweight / light DB" },
  { id: "prone-t-raise", name: "Prone T Raise", muscle: "Golf", equipment: "Bodyweight / light DB" },
  { id: "prone-w-raise", name: "Prone W Raise", muscle: "Golf", equipment: "Bodyweight / light DB" },
  { id: "serratus-punch", name: "Serratus Punch", muscle: "Golf", equipment: "Dumbbell" },
  { id: "open-book-thoracic", name: "Open Book (Thoracic)", muscle: "Golf", equipment: "Bodyweight" },
  { id: "worlds-greatest-stretch", name: "World's Greatest Stretch", muscle: "Golf", equipment: "Bodyweight" },
  { id: "90-90-hip-switch", name: "90/90 Hip Switch", muscle: "Golf", equipment: "Bodyweight" },
  { id: "golf-posture-row", name: "Golf Posture Row", muscle: "Golf", equipment: "Cable / band" },
  { id: "step-up-drive", name: "Step-Up Drive", muscle: "Golf", equipment: "Dumbbell / box" },
  { id: "lateral-band-walk", name: "Lateral Band Walk", muscle: "Golf", equipment: "Band" },
  { id: "monster-walk", name: "Monster Walk", muscle: "Golf", equipment: "Band" },
  { id: "clamshell", name: "Clamshell", muscle: "Golf", equipment: "Band" },
  { id: "side-lying-hip-abduction", name: "Side-Lying Hip Abduction", muscle: "Golf", equipment: "Bodyweight" },
  { id: "half-kneeling-windmill", name: "Half-Kneeling Windmill", muscle: "Golf", equipment: "Kettlebell" },
  { id: "turkish-get-up", name: "Turkish Get-Up", muscle: "Golf", equipment: "Kettlebell" },

  // —— Legs ——
  { id: "back-squat", name: "Back Squat", muscle: "Legs", equipment: "Barbell" },
  { id: "front-squat", name: "Front Squat", muscle: "Legs", equipment: "Barbell" },
  { id: "goblet-squat", name: "Goblet Squat", muscle: "Legs", equipment: "Dumbbell / kettlebell" },
  { id: "safety-bar-squat", name: "Safety Bar Squat", muscle: "Legs", equipment: "Safety bar" },
  { id: "box-squat", name: "Box Squat", muscle: "Legs", equipment: "Barbell" },
  { id: "pause-squat", name: "Pause Squat", muscle: "Legs", equipment: "Barbell" },
  { id: "hack-squat", name: "Hack Squat", muscle: "Legs", equipment: "Machine" },
  { id: "leg-press", name: "Leg Press", muscle: "Legs", equipment: "Machine" },
  { id: "single-leg-press", name: "Single-Leg Press", muscle: "Legs", equipment: "Machine" },
  { id: "belt-squat", name: "Belt Squat", muscle: "Legs", equipment: "Machine" },
  { id: "pendulum-squat", name: "Pendulum Squat", muscle: "Legs", equipment: "Machine" },
  { id: "romanian-deadlift", name: "Romanian Deadlift", muscle: "Legs", equipment: "Barbell" },
  { id: "dumbbell-rdl", name: "Dumbbell RDL", muscle: "Legs", equipment: "Dumbbell" },
  { id: "stiff-leg-deadlift", name: "Stiff-Leg Deadlift", muscle: "Legs", equipment: "Barbell" },
  { id: "good-morning", name: "Good Morning", muscle: "Legs", equipment: "Barbell" },
  { id: "walking-lunge", name: "Walking Lunge", muscle: "Legs", equipment: "Dumbbell" },
  { id: "reverse-lunge", name: "Reverse Lunge", muscle: "Legs", equipment: "Dumbbell" },
  { id: "forward-lunge", name: "Forward Lunge", muscle: "Legs", equipment: "Dumbbell" },
  { id: "lateral-lunge", name: "Lateral Lunge", muscle: "Legs", equipment: "Dumbbell" },
  { id: "bulgarian-split-squat", name: "Bulgarian Split Squat", muscle: "Legs", equipment: "Dumbbell" },
  { id: "split-squat", name: "Split Squat", muscle: "Legs", equipment: "Dumbbell" },
  { id: "step-up", name: "Step-Up", muscle: "Legs", equipment: "Dumbbell / box" },
  { id: "lateral-step-up", name: "Lateral Step-Up", muscle: "Legs", equipment: "Dumbbell / box" },
  { id: "leg-extension", name: "Leg Extension", muscle: "Legs", equipment: "Machine" },
  { id: "leg-curl", name: "Lying Leg Curl", muscle: "Legs", equipment: "Machine" },
  { id: "seated-leg-curl", name: "Seated Leg Curl", muscle: "Legs", equipment: "Machine" },
  { id: "nordic-curl", name: "Nordic Hamstring Curl", muscle: "Legs", equipment: "Bodyweight" },
  { id: "glute-ham-raise", name: "Glute-Ham Raise", muscle: "Legs", equipment: "GHD" },
  { id: "hip-thrust", name: "Barbell Hip Thrust", muscle: "Legs", equipment: "Barbell" },
  { id: "glute-bridge", name: "Glute Bridge", muscle: "Legs", equipment: "Bodyweight" },
  { id: "cable-kickback", name: "Cable Glute Kickback", muscle: "Legs", equipment: "Cable" },
  { id: "cable-pull-through", name: "Cable Pull-Through", muscle: "Legs", equipment: "Cable" },
  { id: "sumo-squat", name: "Sumo Squat", muscle: "Legs", equipment: "Dumbbell / kettlebell" },
  { id: "adductor-machine", name: "Hip Adduction Machine", muscle: "Legs", equipment: "Machine" },
  { id: "abductor-machine", name: "Hip Abduction Machine", muscle: "Legs", equipment: "Machine" },
  { id: "calf-raise", name: "Standing Calf Raise", muscle: "Legs", equipment: "Machine" },
  { id: "seated-calf-raise", name: "Seated Calf Raise", muscle: "Legs", equipment: "Machine" },
  { id: "single-leg-calf-raise", name: "Single-Leg Calf Raise", muscle: "Legs", equipment: "Dumbbell" },
  { id: "tibialis-raise", name: "Tibialis Raise", muscle: "Legs", equipment: "Bodyweight / machine" },
  { id: "sissy-squat", name: "Sissy Squat", muscle: "Legs", equipment: "Bodyweight" },
  { id: "pistol-squat", name: "Pistol Squat", muscle: "Legs", equipment: "Bodyweight" },
  { id: "wall-sit", name: "Wall Sit", muscle: "Legs", equipment: "Bodyweight" },

  // —— Back ——
  { id: "deadlift", name: "Conventional Deadlift", muscle: "Back", equipment: "Barbell" },
  { id: "sumo-deadlift", name: "Sumo Deadlift", muscle: "Back", equipment: "Barbell" },
  { id: "trap-bar-deadlift", name: "Trap-Bar Deadlift", muscle: "Back", equipment: "Trap bar" },
  { id: "rack-pull", name: "Rack Pull", muscle: "Back", equipment: "Barbell" },
  { id: "pull-up", name: "Pull-Up", muscle: "Back", equipment: "Bodyweight" },
  { id: "chin-up", name: "Chin-Up", muscle: "Back", equipment: "Bodyweight", grip: "Underhand" },
  { id: "neutral-grip-pull-up", name: "Neutral-Grip Pull-Up", muscle: "Back", equipment: "Bodyweight", grip: "Neutral" },
  { id: "weighted-pull-up", name: "Weighted Pull-Up", muscle: "Back", equipment: "Bodyweight + weight" },
  { id: "lat-pulldown", name: "Lat Pulldown", muscle: "Back", equipment: "Cable", grip: "Overhand" },
  { id: "lat-pulldown-underhand", name: "Lat Pulldown (Underhand)", muscle: "Back", equipment: "Cable", grip: "Underhand" },
  { id: "lat-pulldown-neutral", name: "Lat Pulldown (Neutral)", muscle: "Back", equipment: "Cable", grip: "Neutral" },
  { id: "straight-arm-pulldown", name: "Straight-Arm Pulldown", muscle: "Back", equipment: "Cable" },
  { id: "seated-row", name: "Seated Cable Row", muscle: "Back", equipment: "Cable" },
  { id: "seated-row-wide", name: "Seated Cable Row (Wide)", muscle: "Back", equipment: "Cable", grip: "Wide" },
  { id: "chest-supported-row", name: "Chest-Supported Row", muscle: "Back", equipment: "Dumbbell / machine" },
  { id: "barbell-row", name: "Barbell Row", muscle: "Back", equipment: "Barbell", grip: "Overhand" },
  { id: "pendlay-row", name: "Pendlay Row", muscle: "Back", equipment: "Barbell" },
  { id: "yates-row", name: "Yates Row", muscle: "Back", equipment: "Barbell", grip: "Underhand" },
  { id: "dumbbell-row", name: "One-Arm Dumbbell Row", muscle: "Back", equipment: "Dumbbell" },
  { id: "meadows-row", name: "Meadows Row", muscle: "Back", equipment: "Barbell / landmine" },
  { id: "t-bar-row", name: "T-Bar Row", muscle: "Back", equipment: "Machine / landmine" },
  { id: "inverted-row", name: "Inverted Row", muscle: "Back", equipment: "Bodyweight" },
  { id: "seal-row", name: "Seal Row", muscle: "Back", equipment: "Barbell" },
  { id: "machine-row", name: "Machine Row", muscle: "Back", equipment: "Machine" },
  { id: "face-pull-back", name: "Face Pull", muscle: "Back", equipment: "Cable" },
  { id: "rear-delt-fly-machine", name: "Rear Delt Fly Machine", muscle: "Back", equipment: "Machine" },
  { id: "shrug", name: "Barbell Shrug", muscle: "Back", equipment: "Barbell" },
  { id: "dumbbell-shrug", name: "Dumbbell Shrug", muscle: "Back", equipment: "Dumbbell" },
  { id: "farmer-carry", name: "Farmer Carry", muscle: "Back", equipment: "Dumbbell / trap bar" },
  { id: "back-extension", name: "Back Extension", muscle: "Back", equipment: "GHD / machine" },
  { id: "superman", name: "Superman", muscle: "Back", equipment: "Bodyweight" },
  { id: "band-pull-apart", name: "Band Pull-Apart", muscle: "Back", equipment: "Band" },

  // —— Chest ——
  { id: "bench-press", name: "Bench Press", muscle: "Chest", equipment: "Barbell" },
  { id: "pause-bench", name: "Pause Bench Press", muscle: "Chest", equipment: "Barbell" },
  { id: "close-grip-bench", name: "Close-Grip Bench Press", muscle: "Chest", equipment: "Barbell", grip: "Close" },
  { id: "incline-bench-press", name: "Incline Bench Press", muscle: "Chest", equipment: "Barbell" },
  { id: "decline-bench-press", name: "Decline Bench Press", muscle: "Chest", equipment: "Barbell" },
  { id: "dumbbell-bench-press", name: "Dumbbell Bench Press", muscle: "Chest", equipment: "Dumbbell" },
  { id: "incline-dumbbell-press", name: "Incline Dumbbell Press", muscle: "Chest", equipment: "Dumbbell" },
  { id: "decline-dumbbell-press", name: "Decline Dumbbell Press", muscle: "Chest", equipment: "Dumbbell" },
  { id: "dumbbell-fly", name: "Dumbbell Fly", muscle: "Chest", equipment: "Dumbbell" },
  { id: "incline-dumbbell-fly", name: "Incline Dumbbell Fly", muscle: "Chest", equipment: "Dumbbell" },
  { id: "cable-fly", name: "Cable Fly", muscle: "Chest", equipment: "Cable" },
  { id: "cable-fly-high-to-low", name: "Cable Fly (High to Low)", muscle: "Chest", equipment: "Cable" },
  { id: "cable-fly-low-to-high", name: "Cable Fly (Low to High)", muscle: "Chest", equipment: "Cable" },
  { id: "pec-deck", name: "Pec Deck", muscle: "Chest", equipment: "Machine" },
  { id: "chest-press-machine", name: "Chest Press Machine", muscle: "Chest", equipment: "Machine" },
  { id: "incline-machine-press", name: "Incline Machine Press", muscle: "Chest", equipment: "Machine" },
  { id: "push-up", name: "Push-Up", muscle: "Chest", equipment: "Bodyweight" },
  { id: "diamond-push-up", name: "Diamond Push-Up", muscle: "Chest", equipment: "Bodyweight", grip: "Close" },
  { id: "wide-push-up", name: "Wide Push-Up", muscle: "Chest", equipment: "Bodyweight", grip: "Wide" },
  { id: "decline-push-up", name: "Decline Push-Up", muscle: "Chest", equipment: "Bodyweight" },
  { id: "incline-push-up", name: "Incline Push-Up", muscle: "Chest", equipment: "Bodyweight" },
  { id: "weighted-push-up", name: "Weighted Push-Up", muscle: "Chest", equipment: "Bodyweight + weight" },
  { id: "dips-chest", name: "Chest Dips", muscle: "Chest", equipment: "Bodyweight" },
  { id: "floor-press", name: "Floor Press", muscle: "Chest", equipment: "Barbell / dumbbell" },
  { id: "svend-press", name: "Svend Press", muscle: "Chest", equipment: "Plate" },
  { id: "landmine-press", name: "Landmine Press", muscle: "Chest", equipment: "Barbell" },

  // —— Shoulders ——
  { id: "overhead-press", name: "Overhead Press", muscle: "Shoulders", equipment: "Barbell" },
  { id: "push-press", name: "Push Press", muscle: "Shoulders", equipment: "Barbell" },
  { id: "seated-overhead-press", name: "Seated Overhead Press", muscle: "Shoulders", equipment: "Barbell" },
  { id: "dumbbell-shoulder-press", name: "Dumbbell Shoulder Press", muscle: "Shoulders", equipment: "Dumbbell" },
  { id: "arnold-press", name: "Arnold Press", muscle: "Shoulders", equipment: "Dumbbell" },
  { id: "machine-shoulder-press", name: "Machine Shoulder Press", muscle: "Shoulders", equipment: "Machine" },
  { id: "lateral-raise", name: "Lateral Raise", muscle: "Shoulders", equipment: "Dumbbell" },
  { id: "cable-lateral-raise", name: "Cable Lateral Raise", muscle: "Shoulders", equipment: "Cable" },
  { id: "leaning-lateral-raise", name: "Leaning Lateral Raise", muscle: "Shoulders", equipment: "Dumbbell" },
  { id: "front-raise", name: "Front Raise", muscle: "Shoulders", equipment: "Dumbbell" },
  { id: "plate-front-raise", name: "Plate Front Raise", muscle: "Shoulders", equipment: "Plate" },
  { id: "rear-delt-fly", name: "Rear Delt Fly", muscle: "Shoulders", equipment: "Dumbbell" },
  { id: "cable-rear-delt-fly", name: "Cable Rear Delt Fly", muscle: "Shoulders", equipment: "Cable" },
  { id: "face-pull", name: "Face Pull", muscle: "Shoulders", equipment: "Cable" },
  { id: "upright-row", name: "Upright Row", muscle: "Shoulders", equipment: "Barbell / dumbbell" },
  { id: "cable-upright-row", name: "Cable Upright Row", muscle: "Shoulders", equipment: "Cable" },
  { id: "lu-raise", name: "Lu Raise", muscle: "Shoulders", equipment: "Dumbbell" },
  { id: "bradford-press", name: "Bradford Press", muscle: "Shoulders", equipment: "Barbell" },
  { id: "cuban-press", name: "Cuban Press", muscle: "Shoulders", equipment: "Dumbbell" },
  { id: "scapular-plane-raise", name: "Scapular-Plane Raise", muscle: "Shoulders", equipment: "Dumbbell" },
  { id: "handstand-push-up", name: "Handstand Push-Up", muscle: "Shoulders", equipment: "Bodyweight" },
  { id: "pike-push-up", name: "Pike Push-Up", muscle: "Shoulders", equipment: "Bodyweight" },
  { id: "shoulder-external-rotation", name: "Dumbbell External Rotation", muscle: "Shoulders", equipment: "Dumbbell" },
  { id: "bus-driver", name: "Bus Drivers", muscle: "Shoulders", equipment: "Plate" },

  // —— Arms ——
  { id: "barbell-curl", name: "Barbell Curl", muscle: "Arms", equipment: "Barbell" },
  { id: "ez-bar-curl", name: "EZ-Bar Curl", muscle: "Arms", equipment: "EZ bar" },
  { id: "dumbbell-curl", name: "Dumbbell Curl", muscle: "Arms", equipment: "Dumbbell" },
  { id: "hammer-curl", name: "Hammer Curl", muscle: "Arms", equipment: "Dumbbell", grip: "Neutral" },
  { id: "incline-dumbbell-curl", name: "Incline Dumbbell Curl", muscle: "Arms", equipment: "Dumbbell" },
  { id: "preacher-curl", name: "Preacher Curl", muscle: "Arms", equipment: "EZ bar / machine" },
  { id: "concentration-curl", name: "Concentration Curl", muscle: "Arms", equipment: "Dumbbell" },
  { id: "cable-curl", name: "Cable Curl", muscle: "Arms", equipment: "Cable" },
  { id: "spider-curl", name: "Spider Curl", muscle: "Arms", equipment: "EZ bar / dumbbell" },
  { id: "cross-body-hammer-curl", name: "Cross-Body Hammer Curl", muscle: "Arms", equipment: "Dumbbell" },
  { id: "reverse-curl", name: "Reverse Curl", muscle: "Arms", equipment: "Barbell", grip: "Overhand" },
  { id: "zottman-curl", name: "Zottman Curl", muscle: "Arms", equipment: "Dumbbell" },
  { id: "tricep-pushdown", name: "Tricep Pushdown", muscle: "Arms", equipment: "Cable" },
  { id: "rope-pushdown", name: "Rope Pushdown", muscle: "Arms", equipment: "Cable" },
  { id: "overhead-tricep-extension", name: "Overhead Tricep Extension", muscle: "Arms", equipment: "Dumbbell / cable" },
  { id: "skull-crusher", name: "Skull Crusher", muscle: "Arms", equipment: "Barbell / EZ bar" },
  { id: "jm-press", name: "JM Press", muscle: "Arms", equipment: "Barbell" },
  { id: "tricep-kickback", name: "Tricep Kickback", muscle: "Arms", equipment: "Dumbbell" },
  { id: "bench-dips", name: "Bench Dips", muscle: "Arms", equipment: "Bodyweight" },
  { id: "parallel-bar-dips", name: "Parallel Bar Dips", muscle: "Arms", equipment: "Bodyweight" },
  { id: "diamond-push-up-arms", name: "Diamond Push-Up", muscle: "Arms", equipment: "Bodyweight" },
  { id: "wrist-curl", name: "Wrist Curl", muscle: "Arms", equipment: "Dumbbell / barbell" },
  { id: "reverse-wrist-curl", name: "Reverse Wrist Curl", muscle: "Arms", equipment: "Dumbbell / barbell" },
  { id: "farmers-hold", name: "Farmer's Hold", muscle: "Arms", equipment: "Dumbbell" },

  // —— Core ——
  { id: "plank", name: "Plank", muscle: "Core", equipment: "Bodyweight" },
  { id: "side-plank", name: "Side Plank", muscle: "Core", equipment: "Bodyweight" },
  { id: "dead-bug", name: "Dead Bug", muscle: "Core", equipment: "Bodyweight" },
  { id: "bird-dog", name: "Bird Dog", muscle: "Core", equipment: "Bodyweight" },
  { id: "hollow-hold", name: "Hollow Body Hold", muscle: "Core", equipment: "Bodyweight" },
  { id: "hanging-knee-raise", name: "Hanging Knee Raise", muscle: "Core", equipment: "Bodyweight" },
  { id: "hanging-leg-raise", name: "Hanging Leg Raise", muscle: "Core", equipment: "Bodyweight" },
  { id: "toes-to-bar", name: "Toes to Bar", muscle: "Core", equipment: "Bodyweight" },
  { id: "cable-crunch", name: "Cable Crunch", muscle: "Core", equipment: "Cable" },
  { id: "ab-wheel", name: "Ab Wheel Rollout", muscle: "Core", equipment: "Ab wheel" },
  { id: "stability-ball-crunch", name: "Stability Ball Crunch", muscle: "Core", equipment: "Ball" },
  { id: "decline-sit-up", name: "Decline Sit-Up", muscle: "Core", equipment: "Bench" },
  { id: "russian-twist", name: "Russian Twist", muscle: "Core", equipment: "Med ball / plate" },
  { id: "bicycle-crunch", name: "Bicycle Crunch", muscle: "Core", equipment: "Bodyweight" },
  { id: "mountain-climber", name: "Mountain Climber", muscle: "Core", equipment: "Bodyweight" },
  { id: "v-up", name: "V-Up", muscle: "Core", equipment: "Bodyweight" },
  { id: "reverse-crunch", name: "Reverse Crunch", muscle: "Core", equipment: "Bodyweight" },
  { id: "dragon-flag", name: "Dragon Flag", muscle: "Core", equipment: "Bodyweight" },
  { id: "copenhagen-plank", name: "Copenhagen Plank", muscle: "Core", equipment: "Bodyweight" },
  { id: "suitcase-carry", name: "Suitcase Carry", muscle: "Core", equipment: "Dumbbell / kettlebell" },
  { id: "overhead-carry", name: "Overhead Carry", muscle: "Core", equipment: "Dumbbell / kettlebell" },
  { id: "pallof-press-core", name: "Pallof Press", muscle: "Core", equipment: "Cable / band" },
  { id: "cable-side-bend", name: "Cable Side Bend", muscle: "Core", equipment: "Cable" },
  { id: "dumbbell-side-bend", name: "Dumbbell Side Bend", muscle: "Core", equipment: "Dumbbell" },
  { id: "landmine-anti-rotation", name: "Landmine Anti-Rotation Press", muscle: "Core", equipment: "Barbell" },
  { id: "dead-bug-press", name: "Dead Bug with Press", muscle: "Core", equipment: "Dumbbell" },

  // —— Olympic / power ——
  { id: "power-clean", name: "Power Clean", muscle: "Olympic", equipment: "Barbell" },
  { id: "hang-clean", name: "Hang Clean", muscle: "Olympic", equipment: "Barbell" },
  { id: "clean-and-jerk", name: "Clean & Jerk", muscle: "Olympic", equipment: "Barbell" },
  { id: "power-snatch", name: "Power Snatch", muscle: "Olympic", equipment: "Barbell" },
  { id: "hang-snatch", name: "Hang Snatch", muscle: "Olympic", equipment: "Barbell" },
  { id: "snatch", name: "Snatch", muscle: "Olympic", equipment: "Barbell" },
  { id: "clean-pull", name: "Clean Pull", muscle: "Olympic", equipment: "Barbell" },
  { id: "snatch-pull", name: "Snatch Pull", muscle: "Olympic", equipment: "Barbell" },
  { id: "high-pull", name: "High Pull", muscle: "Olympic", equipment: "Barbell" },
  { id: "dumbbell-snatch", name: "Dumbbell Snatch", muscle: "Olympic", equipment: "Dumbbell" },
  { id: "dumbbell-clean", name: "Dumbbell Clean", muscle: "Olympic", equipment: "Dumbbell" },
  { id: "kettlebell-swing", name: "Kettlebell Swing", muscle: "Olympic", equipment: "Kettlebell" },
  { id: "kettlebell-clean", name: "Kettlebell Clean", muscle: "Olympic", equipment: "Kettlebell" },
  { id: "kettlebell-snatch", name: "Kettlebell Snatch", muscle: "Olympic", equipment: "Kettlebell" },
  { id: "trap-bar-jump", name: "Trap-Bar Jump", muscle: "Olympic", equipment: "Trap bar" },
  { id: "box-jump", name: "Box Jump", muscle: "Olympic", equipment: "Box" },
  { id: "broad-jump", name: "Broad Jump", muscle: "Olympic", equipment: "Bodyweight" },
  { id: "depth-jump", name: "Depth Jump", muscle: "Olympic", equipment: "Box" },
  { id: "med-ball-chest-pass", name: "Med Ball Chest Pass", muscle: "Olympic", equipment: "Med ball" },
  { id: "med-ball-overhead-slam", name: "Med Ball Overhead Slam", muscle: "Olympic", equipment: "Med ball" },
  { id: "push-jerk", name: "Push Jerk", muscle: "Olympic", equipment: "Barbell" },
  { id: "split-jerk", name: "Split Jerk", muscle: "Olympic", equipment: "Barbell" },
  { id: "jump-squat", name: "Jump Squat", muscle: "Olympic", equipment: "Bodyweight / barbell" },
  { id: "bounding", name: "Bounding", muscle: "Olympic", equipment: "Bodyweight" },

  // —— Cardio ——
  { id: "row-erg", name: "Rowing Machine", muscle: "Cardio", equipment: "Erg" },
  { id: "assault-bike", name: "Assault Bike", muscle: "Cardio", equipment: "Bike" },
  { id: "echo-bike", name: "Echo Bike", muscle: "Cardio", equipment: "Bike" },
  { id: "air-bike", name: "Air Bike", muscle: "Cardio", equipment: "Bike" },
  { id: "ski-erg", name: "SkiErg", muscle: "Cardio", equipment: "Erg" },
  { id: "treadmill-run", name: "Treadmill Run", muscle: "Cardio", equipment: "Treadmill" },
  { id: "treadmill-walk", name: "Treadmill Walk / Incline", muscle: "Cardio", equipment: "Treadmill" },
  { id: "outdoor-run", name: "Outdoor Run", muscle: "Cardio", equipment: "None" },
  { id: "outdoor-walk", name: "Outdoor Walk", muscle: "Cardio", equipment: "None" },
  { id: "bike-erg", name: "BikeErg", muscle: "Cardio", equipment: "Erg" },
  { id: "stationary-bike", name: "Stationary Bike", muscle: "Cardio", equipment: "Bike" },
  { id: "elliptical", name: "Elliptical", muscle: "Cardio", equipment: "Machine" },
  { id: "stair-climber", name: "Stair Climber", muscle: "Cardio", equipment: "Machine" },
  { id: "jump-rope", name: "Jump Rope", muscle: "Cardio", equipment: "Rope" },
  { id: "burpee", name: "Burpee", muscle: "Cardio", equipment: "Bodyweight" },
  { id: "high-knees", name: "High Knees", muscle: "Cardio", equipment: "Bodyweight" },
  { id: "jumping-jack", name: "Jumping Jack", muscle: "Cardio", equipment: "Bodyweight" },
  { id: "battle-ropes", name: "Battle Ropes", muscle: "Cardio", equipment: "Ropes" },
  { id: "sled-push", name: "Sled Push", muscle: "Cardio", equipment: "Sled" },
  { id: "sled-pull", name: "Sled Pull", muscle: "Cardio", equipment: "Sled" },
  { id: "prowler-push", name: "Prowler Push", muscle: "Cardio", equipment: "Prowler" },
  { id: "swimming", name: "Swimming", muscle: "Cardio", equipment: "Pool" },
  { id: "versa-climber", name: "VersaClimber", muscle: "Cardio", equipment: "Machine" },
];

export function loadCustomExercises(): Exercise[] {
  const list = readJson<Exercise[]>(CUSTOM_EXERCISES_KEY, []);
  return Array.isArray(list) ? list : [];
}

export function saveCustomExercises(list: Exercise[]) {
  writeJson(CUSTOM_EXERCISES_KEY, list.slice(0, 200));
}

export function addCustomExercise(input: {
  name: string;
  muscle: MuscleGroup;
  equipment?: string;
  grip?: string;
}): Exercise {
  const ex: Exercise = {
    id: uid("custom"),
    name: input.name.trim(),
    muscle: input.muscle,
    equipment: input.equipment?.trim() || undefined,
    grip: input.grip?.trim() || undefined,
    custom: true,
  };
  saveCustomExercises([ex, ...loadCustomExercises().filter((e) => e.id !== ex.id)]);
  return ex;
}

export function deleteCustomExercise(id: string) {
  saveCustomExercises(loadCustomExercises().filter((e) => e.id !== id));
}

/** Built-in library plus any exercises the player has added. */
export function allExercises(): Exercise[] {
  return [...loadCustomExercises(), ...EXERCISE_LIBRARY];
}

export function exerciseById(id: string): Exercise | undefined {
  return allExercises().find((e) => e.id === id);
}

/** Most recent finished performance for an exercise (for “last time” display + prefill). */
export function lastPerformanceForExercise(exerciseId: string): WorkoutExercise | null {
  for (const w of loadWorkouts()) {
    if (!w.finishedAt) continue;
    const hit = w.exercises.find((e) => e.exerciseId === exerciseId);
    if (hit && hit.sets.some((s) => s.completed || s.weight != null || s.reps != null)) return hit;
  }
  return null;
}

/** Compact set label, e.g. "60×8" or "BW+10×8" for bodyweight work. */
export function formatSetShort(
  set: Pick<WorkoutSet, "weight" | "reps"> | null | undefined,
  opts?: { bodyweight?: boolean },
): string {
  if (!set) return "";
  if (set.weight == null && set.reps == null) return "";
  const r = set.reps != null ? `${set.reps}` : "—";
  if (opts?.bodyweight) {
    if (set.weight == null || set.weight === 0) return `BW×${r}`;
    return `BW+${set.weight}×${r}`;
  }
  const w = set.weight != null ? `${set.weight}` : "—";
  return `${w}×${r}`;
}

export function formatLastPerformance(ex: WorkoutExercise | null): string {
  if (!ex) return "";
  const bw = exerciseUsesBodyweight(ex);
  const parts = ex.sets
    .filter((s) => s.completed || s.weight != null || s.reps != null)
    .map((s) => formatSetShort(s, { bodyweight: bw }));
  return parts.length ? parts.join(", ") : "";
}

/** Previous workout’s set at the same index (for the Previous column). */
export function previousSetForIndex(exerciseId: string, index: number): WorkoutSet | null {
  const last = lastPerformanceForExercise(exerciseId);
  if (!last) return null;
  const sets = last.sets.filter((s) => s.completed || s.weight != null || s.reps != null);
  return sets[index] ?? null;
}

/** Epley estimated 1RM — used for personal-best detection. */
export function estimatedOneRm(weight: number, reps: number): number {
  if (!(weight > 0) || !(reps > 0)) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

export function bestEstimatedOneRm(exerciseId: string, excludeWorkoutId?: string): number {
  let best = 0;
  for (const w of loadWorkouts()) {
    if (!w.finishedAt) continue;
    if (excludeWorkoutId && w.id === excludeWorkoutId) continue;
    const hit = w.exercises.find((e) => e.exerciseId === exerciseId);
    if (!hit) continue;
    const bw = sessionBodyWeightKg(w);
    for (const s of hit.sets) {
      if (!s.completed || s.reps == null) continue;
      const load = setLoadKg(hit, s, bw);
      if (load == null || load <= 0) continue;
      best = Math.max(best, estimatedOneRm(load, s.reps));
    }
  }
  return best;
}

/** True when this completed set beats the stored best estimated 1RM for the exercise. */
export function isSetPersonalBest(
  exerciseId: string,
  set: WorkoutSet,
  excludeWorkoutId?: string,
  exercise?: Pick<WorkoutExercise, "equipment" | "name">,
  bodyWeightKg?: number | null,
): boolean {
  if (!set.completed || set.reps == null) return false;
  const ex = exercise ?? lastPerformanceForExercise(exerciseId) ?? { name: "", equipment: undefined };
  const load = setLoadKg(ex, set, bodyWeightKg ?? loadBodyWeightKg());
  if (load == null || load <= 0) return false;
  const score = estimatedOneRm(load, set.reps);
  if (score <= 0) return false;
  const prev = bestEstimatedOneRm(exerciseId, excludeWorkoutId);
  return score > prev + 0.05;
}

/** Find new estimated-1RM PBs in a finished (or about-to-finish) session vs prior history. */
export function detectPersonalBests(session: WorkoutSession): PersonalBestHit[] {
  const hits: PersonalBestHit[] = [];
  const seen = new Set<string>();
  const bw = sessionBodyWeightKg(session);
  for (const ex of session.exercises) {
    if (seen.has(ex.exerciseId)) continue;
    const previousBestOneRm = bestEstimatedOneRm(ex.exerciseId, session.id);
    let bestSet: WorkoutSet | null = null;
    let bestScore = 0;
    let bestLoad = 0;
    for (const s of ex.sets) {
      if (!s.completed || s.reps == null) continue;
      const load = setLoadKg(ex, s, bw);
      if (load == null || load <= 0) continue;
      const score = estimatedOneRm(load, s.reps);
      if (score > bestScore) {
        bestScore = score;
        bestSet = s;
        bestLoad = load;
      }
    }
    if (!bestSet || bestScore <= 0) continue;
    if (bestScore > previousBestOneRm + 0.05) {
      seen.add(ex.exerciseId);
      hits.push({
        exerciseId: ex.exerciseId,
        name: ex.name,
        weight: bestLoad,
        reps: bestSet.reps!,
        estimatedOneRm: Math.round(bestScore * 10) / 10,
        previousBestOneRm: previousBestOneRm > 0 ? Math.round(previousBestOneRm * 10) / 10 : null,
      });
    }
  }
  return hits;
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota */
  }
}

export function loadWorkouts(): WorkoutSession[] {
  const list = readJson<WorkoutSession[]>(WORKOUTS_KEY, []);
  return Array.isArray(list) ? list.sort((a, b) => b.startedAt.localeCompare(a.startedAt)) : [];
}

export function saveWorkouts(list: WorkoutSession[]) {
  writeJson(WORKOUTS_KEY, list.slice(0, 100));
}

export function loadRoutines(): WorkoutRoutine[] {
  const list = readJson<WorkoutRoutine[]>(ROUTINES_KEY, []);
  return Array.isArray(list) ? list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : [];
}

export function saveRoutines(list: WorkoutRoutine[]) {
  writeJson(ROUTINES_KEY, list.slice(0, 40));
}

export function loadActiveWorkout(): WorkoutSession | null {
  const raw = readJson<WorkoutSession | null>(ACTIVE_KEY, null);
  if (!raw) return null;
  return {
    ...raw,
    timerStartedAt: raw.timerStartedAt ?? null,
    timerOffsetMs: Number(raw.timerOffsetMs) || 0,
  };
}

export function saveActiveWorkout(session: WorkoutSession | null) {
  if (!session) {
    if (typeof window !== "undefined") localStorage.removeItem(ACTIVE_KEY);
    return;
  }
  writeJson(ACTIVE_KEY, session);
}

export function newEmptySet(): WorkoutSet {
  return { id: uid("set"), weight: null, reps: null, completed: false };
}

export function workoutExerciseFromLibrary(ex: Exercise, prior?: WorkoutExercise | null): WorkoutExercise {
  const source = prior ?? lastPerformanceForExercise(ex.id);
  const priorSets = source?.sets.filter((s) => s.completed || s.weight != null || s.reps != null) ?? [];
  const seed =
    priorSets.length > 0
      ? priorSets.map((s) => ({
          id: uid("set"),
          weight: s.weight,
          reps: s.reps,
          completed: false,
        }))
      : [newEmptySet(), newEmptySet(), newEmptySet()];
  return {
    id: uid("wex"),
    exerciseId: ex.id,
    name: ex.name,
    muscle: ex.muscle,
    equipment: ex.equipment,
    grip: ex.grip,
    sets: seed.length ? seed : [newEmptySet()],
  };
}

export function startEmptyWorkout(title = "Workout"): WorkoutSession {
  return {
    id: uid("wo"),
    title,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    timerStartedAt: null,
    timerOffsetMs: 0,
    exercises: [],
    bodyWeightKg: loadBodyWeightKg(),
  };
}

export function startWorkoutFromRoutine(routine: WorkoutRoutine): WorkoutSession {
  const exercises = routine.exerciseIds
    .map((id) => exerciseById(id))
    .filter((e): e is Exercise => Boolean(e))
    .map((ex) => workoutExerciseFromLibrary(ex));
  return {
    id: uid("wo"),
    title: routine.name,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    timerStartedAt: null,
    timerOffsetMs: 0,
    exercises,
    bodyWeightKg: loadBodyWeightKg(),
  };
}

/** Begin the live clock (manual — does nothing if already running). */
export function startWorkoutTimer(session: WorkoutSession): WorkoutSession {
  if (session.timerStartedAt) return session;
  return { ...session, timerStartedAt: new Date().toISOString() };
}

/** Pause the live clock and keep elapsed time. */
export function pauseWorkoutTimer(session: WorkoutSession, now = Date.now()): WorkoutSession {
  if (!session.timerStartedAt) return session;
  const running = now - Date.parse(session.timerStartedAt);
  return {
    ...session,
    timerStartedAt: null,
    timerOffsetMs: session.timerOffsetMs + (Number.isFinite(running) ? Math.max(0, running) : 0),
  };
}

export function finishWorkout(session: WorkoutSession): WorkoutSession {
  const paused = session.timerStartedAt ? pauseWorkoutTimer(session) : session;
  const bw = sessionBodyWeightKg(paused);
  const withBw: WorkoutSession = { ...paused, bodyWeightKg: bw };
  const personalBests = detectPersonalBests(withBw);
  const finished: WorkoutSession = {
    ...withBw,
    finishedAt: new Date().toISOString(),
    timerStartedAt: null,
    exercises: withBw.exercises.map((e) => ({
      ...e,
      sets: e.sets.filter((s) => s.completed || s.weight != null || s.reps != null),
    })),
    personalBests: personalBests.length ? personalBests : undefined,
  };
  const list = loadWorkouts().filter((w) => w.id !== finished.id);
  saveWorkouts([finished, ...list]);
  saveActiveWorkout(null);
  return finished;
}

export function upsertRoutine(routine: WorkoutRoutine) {
  const list = loadRoutines().filter((r) => r.id !== routine.id);
  saveRoutines([{ ...routine, updatedAt: new Date().toISOString() }, ...list]);
}

export function deleteRoutine(id: string) {
  saveRoutines(loadRoutines().filter((r) => r.id !== id));
}

export function deleteWorkout(id: string) {
  saveWorkouts(loadWorkouts().filter((w) => w.id !== id));
}

export function workoutElapsedMs(session: WorkoutSession, now = Date.now()): number {
  const offset = Number(session.timerOffsetMs) || 0;
  if (session.finishedAt) {
    // Prefer recorded timer; fall back to wall-clock for older sessions.
    if (session.timerStartedAt || offset > 0) {
      const running = session.timerStartedAt ? Date.parse(session.finishedAt) - Date.parse(session.timerStartedAt) : 0;
      return offset + (Number.isFinite(running) ? Math.max(0, running) : 0);
    }
    const start = Date.parse(session.startedAt);
    const end = Date.parse(session.finishedAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
    return end - start;
  }
  if (!session.timerStartedAt) return offset;
  const running = now - Date.parse(session.timerStartedAt);
  return offset + (Number.isFinite(running) ? Math.max(0, running) : 0);
}

/** Live / finished duration as mm:ss or h:mm:ss. */
export function formatElapsedClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatWorkoutDuration(session: WorkoutSession, now = Date.now()): string {
  const ms = workoutElapsedMs(session, now);
  if (ms <= 0) return "";
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${Math.max(1, mins)} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function workoutDurationMinutes(session: WorkoutSession): number {
  return Math.max(1, Math.round(workoutElapsedMs(session) / 60_000));
}

/** Default rest between sets (Hevy-style). */
export const DEFAULT_REST_SEC = 90;

export function loadBodyWeightKg(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(BODY_WEIGHT_KEY);
    if (raw == null || raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function saveBodyWeightKg(kg: number | null) {
  if (typeof window === "undefined") return;
  try {
    if (kg == null || !(kg > 0)) localStorage.removeItem(BODY_WEIGHT_KEY);
    else localStorage.setItem(BODY_WEIGHT_KEY, String(kg));
  } catch {
    /* quota */
  }
}

/** True when the exercise load should include the athlete's body weight. */
export function exerciseUsesBodyweight(
  ex: Pick<Exercise | WorkoutExercise, "equipment" | "name"> | null | undefined,
): boolean {
  if (!ex) return false;
  const hay = `${ex.equipment ?? ""} ${ex.name}`.toLowerCase();
  return /body\s*weight|bodyweight|pull-?up|chin-?up|push-?up|dip|plank|pistol|burpee|hollow|nordic|inverted row|toes to bar|hanging/.test(
    hay,
  );
}

/** Effective load for volume: external kg, or bodyweight + optional added kg. */
export function setLoadKg(
  ex: Pick<WorkoutExercise, "equipment" | "name">,
  set: WorkoutSet,
  bodyWeightKg: number | null | undefined,
): number | null {
  const added = set.weight != null && Number.isFinite(set.weight) ? set.weight : 0;
  if (exerciseUsesBodyweight(ex)) {
    const bw = bodyWeightKg != null && bodyWeightKg > 0 ? bodyWeightKg : null;
    if (bw == null) {
      // No body weight saved — only count explicitly entered kg (added / total).
      return set.weight != null && set.weight > 0 ? set.weight : null;
    }
    return bw + Math.max(0, added);
  }
  return set.weight != null && Number.isFinite(set.weight) ? set.weight : null;
}

export function sessionBodyWeightKg(session: WorkoutSession): number | null {
  if (session.bodyWeightKg != null && session.bodyWeightKg > 0) return session.bodyWeightKg;
  return loadBodyWeightKg();
}

export function sessionHasBodyweightExercise(session: WorkoutSession): boolean {
  return session.exercises.some((e) => exerciseUsesBodyweight(e));
}

export function sessionVolumeKg(session: WorkoutSession): number {
  const bw = sessionBodyWeightKg(session);
  return session.exercises.reduce(
    (sum, e) =>
      sum +
      e.sets.reduce((s, set) => {
        if (!set.completed || set.reps == null || set.reps <= 0) return s;
        const load = setLoadKg(e, set, bw);
        if (load == null || load <= 0) return s;
        return s + load * set.reps;
      }, 0),
    0,
  );
}

export function sessionTotalReps(session: WorkoutSession): number {
  return session.exercises.reduce(
    (sum, e) =>
      sum +
      e.sets.reduce((s, set) => {
        if (!set.completed || set.reps == null) return s;
        return s + set.reps;
      }, 0),
    0,
  );
}

export function completedSetCount(session: WorkoutSession): number {
  return session.exercises.reduce((n, e) => n + e.sets.filter((s) => s.completed).length, 0);
}

export type WorkoutTrendPoint = {
  id: string;
  label: string;
  volumeKg: number;
  reps: number;
  durationMin: number;
};

/** Oldest → newest points for history charts (last N finished workouts). */
export function workoutTrendSeries(workouts: WorkoutSession[], limit = 12): WorkoutTrendPoint[] {
  const finished = workouts
    .filter((w) => w.finishedAt)
    .slice(0, limit)
    .reverse();
  return finished.map((w) => {
    const d = new Date(w.finishedAt || w.startedAt);
    const label = Number.isFinite(d.getTime())
      ? d.toLocaleDateString(undefined, { day: "numeric", month: "short" })
      : "";
    return {
      id: w.id,
      label,
      volumeKg: Math.round(sessionVolumeKg(w)),
      reps: sessionTotalReps(w),
      durationMin: workoutDurationMinutes(w),
    };
  });
}
