/**
 * Cadet Program foundation — gymnastics-style skill board.
 * Coach-only for now; not shown to regular players until membership ships.
 */

export type CadetLevelId = "white" | "yellow" | "blue" | "red";

export type CadetDomainId =
  | "putting"
  | "chipping"
  | "bunkers"
  | "wedges"
  | "irons"
  | "driving"
  | "on_course";

export type CadetLevelDef = {
  id: CadetLevelId;
  label: string;
  /** Short pass standard coaches / tests use to tick this grade. */
  passStandard: string;
};

export type CadetSkillDef = {
  id: string;
  title: string;
  blurb: string;
  /** Optional existing combine / practice route to run as the exam. */
  testHref?: string;
  levels: CadetLevelDef[];
};

export type CadetDomainDef = {
  id: CadetDomainId;
  label: string;
  blurb: string;
  skills: CadetSkillDef[];
};

export type CadetProgramDef = {
  id: string;
  title: string;
  subtitle: string;
  /** Draft until ready for enrolled cadets. */
  status: "draft" | "pilot" | "live";
  domains: CadetDomainDef[];
};

const BANDS = {
  white: (pass: string): CadetLevelDef => ({ id: "white", label: "White", passStandard: pass }),
  yellow: (pass: string): CadetLevelDef => ({ id: "yellow", label: "Yellow", passStandard: pass }),
  blue: (pass: string): CadetLevelDef => ({ id: "blue", label: "Blue", passStandard: pass }),
  red: (pass: string): CadetLevelDef => ({ id: "red", label: "Red", passStandard: pass }),
};

/** Stonecutters Ridge Cadet Program — seed catalog (editable later via CMS/DB). */
export const STONECUTTERS_CADET_PROGRAM: CadetProgramDef = {
  id: "stonecutters-cadet",
  title: "Cadet Program",
  subtitle: "Curriculum · 3 → 5 → 7 → 10 → Junior Member",
  status: "draft",
  domains: [
    {
      id: "putting",
      label: "Putting",
      blurb: "Start line, speed, and AimPoint ladders.",
      skills: [
        {
          id: "putt-start-line",
          title: "Start line (3–6 ft)",
          blurb: "Roll it on the intended line under quiet conditions.",
          testHref: "/practice/putting-test-3-6ft",
          levels: [
            BANDS.white("Make 6/8 from 3–4 ft on a straight putt"),
            BANDS.yellow("Make 6/8 from 3–6 ft mixed breaks"),
            BANDS.blue("Pass the 3–6 ft putting combine band"),
            BANDS.red("Repeat Blue on a second day within 7 days"),
          ],
        },
        {
          id: "putt-lag-20-40",
          title: "Lag putting (20–40 ft)",
          blurb: "Leave it tap-in range from longer speed putts.",
          testHref: "/practice/putting-test-20-40ft",
          levels: [
            BANDS.white("Leave 6/8 inside 1.0 m"),
            BANDS.yellow("Leave 6/8 inside 60 cm"),
            BANDS.blue("Pass the 20–40 ft combine band"),
            BANDS.red("Leave 6/8 inside 40 cm"),
          ],
        },
        {
          id: "putt-aimpoint",
          title: "AimPoint / slope sense",
          blurb: "Read and commit to break with a clear feel.",
          testHref: "/practice/6ft-aimpoint-combine",
          levels: [
            BANDS.white("Complete AimPoint 6 ft intro set"),
            BANDS.yellow("Pass mid-range slope combine"),
            BANDS.blue("Pass long-range AimPoint band"),
            BANDS.red("Coach sign-off on green reading under pressure"),
          ],
        },
      ],
    },
    {
      id: "chipping",
      label: "Chipping",
      blurb: "Landing spots, loft choices, and tight lies.",
      skills: [
        {
          id: "chip-standard",
          title: "Standard chip",
          blurb: "Predictable land-and-release around the green.",
          testHref: "/practice/standard-chipping-combine",
          levels: [
            BANDS.white("Land 6/9 in the primary zone"),
            BANDS.yellow("Pass standard chipping combine band"),
            BANDS.blue("Up-and-down rate target on 9 chips"),
            BANDS.red("Mixed lies · same standard"),
          ],
        },
        {
          id: "chip-low",
          title: "Low chip / runner",
          blurb: "Keep it under the wind and onto the right release.",
          testHref: "/practice/low-chip-combine",
          levels: [
            BANDS.white("Demonstrate setup and strike on 5 balls"),
            BANDS.yellow("Land 6/9 in zone"),
            BANDS.blue("Pass low-chip combine band"),
            BANDS.red("Coach pressure set"),
          ],
        },
        {
          id: "chip-flop",
          title: "Flop / soft land",
          blurb: "High soft shots when you need to stop it.",
          testHref: "/practice/flop-shot-combine",
          levels: [
            BANDS.white("Clean contact on 5/8"),
            BANDS.yellow("Land soft 5/8"),
            BANDS.blue("Pass flop combine band"),
            BANDS.red("Tight lie flop · coach sign-off"),
          ],
        },
      ],
    },
    {
      id: "bunkers",
      label: "Bunkers",
      blurb: "Entry, proximity, and awkward lies.",
      skills: [
        {
          id: "bunker-proximity",
          title: "Greenside proximity",
          blurb: "Get it out and near the hole on standard lies.",
          testHref: "/practice/bunker-proximity-protocol",
          levels: [
            BANDS.white("Out in one · 6/8"),
            BANDS.yellow("Inside 3 m · 5/8"),
            BANDS.blue("Pass bunker proximity protocol band"),
            BANDS.red("Mixed sand conditions · same band"),
          ],
        },
        {
          id: "bunker-lies",
          title: "Bunker lies",
          blurb: "Fried egg, downhill, plugged — adapt the strike.",
          testHref: "/practice/bunker-lies",
          levels: [
            BANDS.white("Identify lie and choose a plan"),
            BANDS.yellow("Out in one on 3 lie types"),
            BANDS.blue("Pass bunker lies combine band"),
            BANDS.red("Coach scenario set"),
          ],
        },
      ],
    },
    {
      id: "wedges",
      label: "Wedges",
      blurb: "Distance control and lateral start line.",
      skills: [
        {
          id: "wedge-lateral",
          title: "Lateral start line",
          blurb: "Start it where you aim from scoring range.",
          testHref: "/practice/wedge-lateral-9",
          levels: [
            BANDS.white("Complete a full lateral-9 set"),
            BANDS.yellow("Pass wedge lateral band"),
            BANDS.blue("Retest within 3 shots of personal best"),
            BANDS.red("Two clubs · same standard"),
          ],
        },
        {
          id: "wedge-survival",
          title: "Survival / distance ladder",
          blurb: "Hold carry numbers under a scored protocol.",
          testHref: "/practice/survival-20",
          levels: [
            BANDS.white("Finish Survival 20"),
            BANDS.yellow("Pass Survival band"),
            BANDS.blue("Top-third academy band"),
            BANDS.red("Coach pressure retest"),
          ],
        },
      ],
    },
    {
      id: "irons",
      label: "Irons",
      blurb: "Strike, face control, and shape.",
      skills: [
        {
          id: "iron-precision",
          title: "Strike precision",
          blurb: "Centered contact and start line with mid-irons.",
          testHref: "/practice/iron-precision-protocol",
          levels: [
            BANDS.white("Complete precision protocol"),
            BANDS.yellow("Pass precision band"),
            BANDS.blue("Face-control protocol band"),
            BANDS.red("Fade vs draw protocol band"),
          ],
        },
        {
          id: "iron-approach-sim",
          title: "Approach under pressure",
          blurb: "Club and start line to a target with scoring.",
          testHref: "/practice/approach-shot-simulator",
          levels: [
            BANDS.white("Finish one approach-sim set"),
            BANDS.yellow("Pass approach-sim band"),
            BANDS.blue("Safe-side protocol band"),
            BANDS.red("Mixed clubs · coach sign-off"),
          ],
        },
      ],
    },
    {
      id: "driving",
      label: "Driving",
      blurb: "Tee bias, flight, and hazard management.",
      skills: [
        {
          id: "drive-flight",
          title: "Flight control",
          blurb: "Shape and trajectory on demand.",
          testHref: "/practice/driver-flight-test",
          levels: [
            BANDS.white("Complete driver flight test"),
            BANDS.yellow("Pass flight-control band"),
            BANDS.blue("Hazard tee-shot band"),
            BANDS.red("Coach scenario tee set"),
          ],
        },
        {
          id: "drive-hazard",
          title: "Hazard / miss management",
          blurb: "Pick the side and live with the miss.",
          testHref: "/practice/tee-shot-hazard",
          levels: [
            BANDS.white("Finish hazard combine"),
            BANDS.yellow("Pass hazard band"),
            BANDS.blue("Retest within band on a new day"),
            BANDS.red("On-course transfer · coach note"),
          ],
        },
      ],
    },
    {
      id: "on_course",
      label: "On course",
      blurb: "Decisions, commitment, and post-round honesty.",
      skills: [
        {
          id: "course-stats-card",
          title: "Stat card discipline",
          blurb: "Fill a half-sheet card every hole; enter after.",
          levels: [
            BANDS.white("Complete one 9-hole filled card"),
            BANDS.yellow("Complete one 18-hole filled card"),
            BANDS.blue("Log the round in-app same day"),
            BANDS.red("Four logged rounds with FIR/GIR/putts in 30 days"),
          ],
        },
        {
          id: "course-commitment",
          title: "Shot commitment",
          blurb: "One clear plan before every full swing.",
          levels: [
            BANDS.white("Coach observes one committed 9"),
            BANDS.yellow("Player notes 3 good commitments post-round"),
            BANDS.blue("No club-change after address for a full 9"),
            BANDS.red("Coach sign-off under tournament nerves"),
          ],
        },
      ],
    },
  ],
};

export function cadetProgramStats(program: CadetProgramDef = STONECUTTERS_CADET_PROGRAM) {
  const skills = program.domains.reduce((n, d) => n + d.skills.length, 0);
  const levels = program.domains.reduce(
    (n, d) => n + d.skills.reduce((m, s) => m + s.levels.length, 0),
    0,
  );
  return {
    domains: program.domains.length,
    skills,
    levels,
  };
}

/** Flat skill list for curriculum test pickers. */
export function listCadetSkillOptions(
  program: CadetProgramDef = STONECUTTERS_CADET_PROGRAM,
): { id: string; label: string; domainLabel: string }[] {
  const out: { id: string; label: string; domainLabel: string }[] = [];
  for (const domain of program.domains) {
    for (const skill of domain.skills) {
      out.push({
        id: skill.id,
        label: skill.title,
        domainLabel: domain.label,
      });
    }
  }
  return out;
}

export function cadetSkillLabel(
  skillId: string | null | undefined,
  program: CadetProgramDef = STONECUTTERS_CADET_PROGRAM,
): string | null {
  if (!skillId) return null;
  for (const domain of program.domains) {
    const skill = domain.skills.find((s) => s.id === skillId);
    if (skill) return `${domain.label} · ${skill.title}`;
  }
  return skillId;
}

export const CADET_LEVEL_ORDER: CadetLevelId[] = ["white", "yellow", "blue", "red"];

export const CADET_LEVEL_COLORS: Record<CadetLevelId, string> = {
  white: "bg-stone-100 text-stone-700 ring-stone-200",
  yellow: "bg-amber-100 text-amber-900 ring-amber-200",
  blue: "bg-sky-100 text-sky-900 ring-sky-200",
  red: "bg-red-100 text-red-900 ring-red-200",
};
