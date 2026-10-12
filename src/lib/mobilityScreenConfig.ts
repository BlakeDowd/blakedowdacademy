/**
 * Golf mobility screen (TPI style). Players self-check 12 movement tests as Pass, Limited or Pain; tests with
 * a left and right side are marked per side. Saved to practice_logs with one entry per check in strike_data.
 */
export const mobilityScreenConfig = {
  testName: "Golf Mobility Screen",
  practiceLogType: "mobility_screen",
} as const;

export type MobilityResult = "pass" | "limited" | "pain";
export type MobilitySide = "left" | "right" | "both";
export type MobilityArea = "Hips & core" | "Upper back" | "Shoulders" | "Lower body" | "Balance" | "Neck & wrists";

export type MobilityTest = {
  id: string;
  name: string;
  area: MobilityArea;
  sided: boolean;
  timerSeconds?: number;
  steps: string[];
  pass: string;
  swing: string;
  exercises: string[];
};

export type MobilityCheck = { test: string; side: MobilitySide; result: MobilityResult };

export const MOBILITY_AREAS: MobilityArea[] = ["Hips & core", "Upper back", "Shoulders", "Lower body", "Balance", "Neck & wrists"];

export const MOBILITY_RESULT_LABEL: Record<MobilityResult, string> = { pass: "Pass", limited: "Limited", pain: "Pain" };

export const MOBILITY_TESTS: readonly MobilityTest[] = [
  {
    id: "pelvic-tilt",
    name: "Pelvic Tilt",
    area: "Hips & core",
    sided: false,
    steps: [
      "Set up in your golf posture with your arms crossed on your chest.",
      "Arch your lower back by tipping your belt buckle down.",
      "Then flatten your lower back by tucking your belt buckle up.",
      "Keep your chest and knees still.",
    ],
    pass: "You can tilt both ways smoothly without your chest or knees moving.",
    swing: "Can lead to an S or C posture at address, losing your posture and early extension.",
    exercises: [
      "Cat-cow: on hands and knees, slowly arch and round your back 10 times.",
      "Lying pelvic tilts: on your back, flatten then arch your lower back 15 times.",
    ],
  },
  {
    id: "pelvic-rotation",
    name: "Pelvic Rotation",
    area: "Hips & core",
    sided: false,
    steps: [
      "Set up in your golf posture with your arms crossed on your chest.",
      "Turn your hips back and through as far as you can.",
      "Keep your shoulders and head still.",
    ],
    pass: "Your hips turn both ways without your shoulders turning with them or your body swaying.",
    swing: "Can lead to swaying, sliding, early extension and your upper body doing all the work.",
    exercises: [
      "Seated hip turns: sit on a chair, keep your chest still and turn your knees side to side 10 times.",
      "Standing hip turns with a club across your chest, 10 each way with your chest still.",
    ],
  },
  {
    id: "seated-trunk",
    name: "Seated Trunk Rotation",
    area: "Upper back",
    sided: true,
    steps: [
      "Sit on a chair with your feet and knees together.",
      "Hold a club across the front of your shoulders.",
      "Sit tall and turn your shoulders as far as you can each way without your knees moving.",
    ],
    pass: "The club turns at least 45° each way, halfway between facing forward and facing sideways.",
    swing: "Can lead to a short backswing, reverse spine angle, a flat shoulder plane and coming over the top.",
    exercises: [
      "Open books: lie on your side with knees bent and rotate your top arm open to the floor behind you, 10 each side.",
      "Thread the needle: on hands and knees, reach one arm under your body then up to the ceiling, 10 each side.",
    ],
  },
  {
    id: "deep-squat",
    name: "Overhead Deep Squat",
    area: "Lower body",
    sided: false,
    steps: [
      "Stand with your feet shoulder-width apart and toes pointing forward.",
      "Hold a club overhead with straight arms.",
      "Squat as deep as you can, keeping your heels down and the club overhead.",
    ],
    pass: "Your thighs get below parallel with heels down, back straight and the club still above your feet.",
    swing: "Can lead to early extension and losing your posture through impact.",
    exercises: [
      "Deep squat holds: hold onto something and sit in a deep squat for 30 seconds, 3 times.",
      "Ankle wall stretch: knee to the wall with your heel down, 10 each side.",
    ],
  },
  {
    id: "toe-touch",
    name: "Toe Touch",
    area: "Lower body",
    sided: false,
    steps: [
      "Stand with your feet together and legs straight.",
      "Slowly bend forward and reach for your toes.",
      "Don't bounce.",
    ],
    pass: "You touch your toes with straight legs and your back makes an even curve.",
    swing: "Can make it hard to set up in a good posture and hold it through the swing.",
    exercises: [
      "Hamstring flossing: on your back with a towel around one foot, straighten and bend the knee 10 times each side.",
      "Heels-up toe touches: stand with your heels on a book and reach for your toes 10 times.",
    ],
  },
  {
    id: "shoulder-90-90",
    name: "90/90 Shoulder Rotation",
    area: "Shoulders",
    sided: true,
    steps: [
      "Set up in your golf posture.",
      "Lift one arm out to the side, elbow level with your shoulder and bent to 90°.",
      "Rotate your forearm back so your hand points up and back, without arching your back.",
    ],
    pass: "Your forearm gets back to about straight up, in line with your spine, without your back arching.",
    swing: "Can lead to a flying elbow, losing width and a cupped wrist at the top.",
    exercises: [
      "Sleeper stretch: lie on your side and gently press your forearm down, 30 seconds each arm.",
      "Wall angels: back against a wall, slide your arms up and down 10 times.",
    ],
  },
  {
    id: "single-leg-balance",
    name: "Single-Leg Balance",
    area: "Balance",
    sided: true,
    timerSeconds: 20,
    steps: [
      "Stand on one leg with your other foot lifted off the ground.",
      "Cross your arms and close your eyes.",
      "Start the timer. Stop when your foot touches down, moves, or you open your eyes.",
    ],
    pass: "You hold for 20 seconds on each leg without your standing foot moving.",
    swing: "Can lead to swaying, sliding and falling off balance at the finish.",
    exercises: [
      "Single-leg stands while you brush your teeth, eyes open then closed.",
      "Single-leg swings with a short club, 10 on each leg.",
    ],
  },
  {
    id: "lat-length",
    name: "Lat Length",
    area: "Shoulders",
    sided: false,
    steps: [
      "Stand with your back, head and bottom against a wall, feet a little away from it.",
      "Keep your lower back flat against the wall.",
      "Raise both straight arms overhead, thumbs leading, and try to touch the wall.",
    ],
    pass: "Your thumbs touch the wall while your lower back stays flat and your elbows stay straight.",
    swing: "Can lead to a flat shoulder plane, a chicken wing and losing your posture.",
    exercises: [
      "Child's pose lat stretch: reach both hands to one side, 30 seconds each side.",
      "Foam roll down the side of your back, 1 minute each side.",
    ],
  },
  {
    id: "hip-rotation",
    name: "Seated Hip Rotation",
    area: "Hips & core",
    sided: true,
    steps: [
      "Sit on a high chair or bench with your knees together and feet off the ground.",
      "Keep your thigh still and swing one foot out to the side.",
      "Then swing it in across your other leg.",
    ],
    pass: "Your foot swings about 45° both ways without your thigh or hips moving.",
    swing: "Can lead to swaying, sliding and early extension.",
    exercises: [
      "90/90 hip switches: sit on the floor with both knees bent and rock them side to side, 10 each way.",
      "Figure-four stretch: on your back, ankle on the other knee, 30 seconds each side.",
    ],
  },
  {
    id: "bridge-extension",
    name: "Bridge with Leg Extension",
    area: "Hips & core",
    sided: true,
    timerSeconds: 10,
    steps: [
      "Lie on your back with your knees bent and arms on the floor.",
      "Lift your hips so you're in a straight line from knees to shoulders.",
      "Straighten one leg and hold for 10 seconds without your hips dropping.",
    ],
    pass: "Your hips stay up and level for 10 seconds on each leg, with no cramping.",
    swing: "Can lead to early extension, swaying and losing your posture.",
    exercises: ["Glute bridges, 3 sets of 12.", "Single-leg bridges, 8 each side."],
  },
  {
    id: "neck-rotation",
    name: "Neck Rotation",
    area: "Neck & wrists",
    sided: true,
    steps: ["Set up in your golf posture.", "Keep your shoulders still and turn your chin towards one shoulder."],
    pass: "Your chin gets close to your shoulder each way, about a 70° turn.",
    swing: "Can make you lift your head or cut your backswing short to keep your eyes on the ball.",
    exercises: [
      "Chin tucks then slow head turns, 10 each way.",
      "Posture turns: hold your head still and turn your shoulders under it, 10 each way.",
    ],
  },
  {
    id: "wrist-hinge",
    name: "Wrist Hinge",
    area: "Neck & wrists",
    sided: true,
    steps: [
      "Hold your arm straight out in front of you with your thumb up.",
      "Without bending your elbow, hinge your hand up towards the ceiling.",
      "Then hinge it down towards the floor.",
    ],
    pass: "Your hand hinges about 20° up and 30° down without your forearm moving.",
    swing: "Can lead to casting, an early release and losing lag.",
    exercises: [
      "Hammer hinges: hold a hammer or club at the end and hinge it up and down, 15 each way.",
      "Wrist stretches: gently pull your hand back then down with your other hand, 30 seconds each.",
    ],
  },
];

export const MOBILITY_CHECK_COUNT = MOBILITY_TESTS.reduce((n, t) => n + (t.sided ? 2 : 1), 0);

export function mobilityTest(id: string): MobilityTest | undefined {
  return MOBILITY_TESTS.find((t) => t.id === id);
}

export function mobilityScorePct(checks: readonly MobilityCheck[]): number {
  if (checks.length === 0) return 0;
  return Math.round((checks.filter((c) => c.result === "pass").length / checks.length) * 100);
}

/** Saved checks from a practice_logs row's strike_data, or null when they weren't stored. */
export function parseMobilityChecks(strikeData: unknown): MobilityCheck[] | null {
  if (!Array.isArray(strikeData) || strikeData.length === 0) return null;
  const out: MobilityCheck[] = [];
  for (const raw of strikeData) {
    if (!raw || typeof raw !== "object") return null;
    const o = raw as Record<string, unknown>;
    if (typeof o.test !== "string" || !mobilityTest(o.test)) continue;
    const side = o.side === "left" || o.side === "right" ? o.side : "both";
    const result = o.result === "pass" || o.result === "limited" || o.result === "pain" ? o.result : null;
    if (!result) return null;
    out.push({ test: o.test, side, result });
  }
  return out.length ? out : null;
}
