import { puttingTestConfig } from "@/lib/puttingTestConfig";
import { puttingTest9Config } from "@/lib/puttingTest9Config";
import { puttingTest3To6ftConfig } from "@/lib/puttingTest3To6ftConfig";
import { puttingTest8To20Config } from "@/lib/puttingTest8To20Config";
import { puttingTest20To40Config } from "@/lib/puttingTest20To40Config";
import { strikeAndSpeedControlTestConfig } from "@/lib/strikeAndSpeedControlTestConfig";
import { startLineAndSpeedControlTestConfig } from "@/lib/startLineAndSpeedControlTestConfig";
import { aimpoint6ftCombineConfig } from "@/lib/aimpoint6ftCombineConfig";
import { midRangeSlopeSensingConfig } from "@/lib/midRangeSlopeSensingConfig";
import { aimpointLongRange2040Config } from "@/lib/aimpointLongRange2040Config";
import { chippingCombine9Config } from "@/lib/chippingCombine9Config";
import { ironPrecisionProtocolConfig } from "@/lib/ironPrecisionProtocolConfig";
import { wedgeLateral9Config } from "@/lib/wedgeLateral9Config";
import { teeShotDispersionCombineConfig } from "@/lib/teeShotDispersionCombineConfig";
import { bunker9HoleChallengeConfig } from "@/lib/bunker9HoleChallengeConfig";
import { flopShotCombineConfig } from "@/lib/flopShotCombineConfig";
import { standardChippingCombineConfig } from "@/lib/standardChippingCombineConfig";
import { lowChipCombineConfig } from "@/lib/lowChipCombineConfig";
import { survival20Config } from "@/lib/survival20Config";
import { ironFaceControlConfig } from "@/lib/ironFaceControlConfig";
import { threeStrikesWedgeConfig } from "@/lib/threeStrikesWedgeConfig";
import { bunkerProximityProtocolConfig } from "@/lib/bunkerProximityProtocolConfig";

export const COMBINE_CATEGORY_IDS = [
  "Putting",
  "Chipping",
  "Wedges",
  "Irons",
  "Tee Shot",
  "Bunkers",
] as const;

export type CombineCategoryId = (typeof COMBINE_CATEGORY_IDS)[number];

export type CombineTestCard = {
  id: string;
  category: CombineCategoryId;
  href: string;
  /** Stored/matched against practice logs and planner tasks; keep stable. */
  label: string;
  /** Display name on the Practice hub. */
  title: string;
  blurb: string;
  /** Short facts shown as chips, e.g. "18 holes", "~30 min". */
  meta: string[];
  /** Sub-heading the card is grouped under within its category. */
  group: string;
};

/**
 * Combine test cards for the Practice hub, listed in display order. Cards sharing a `group`
 * should sit next to each other.
 */
export const COMBINE_TEST_CARDS: CombineTestCard[] = [
  {
    id: "putting-18",
    category: "Putting",
    href: "/practice/putting-test",
    label: puttingTestConfig.testName,
    title: "18-Hole Putting Test",
    blurb: "The full test. Every distance and break.",
    meta: ["18 putts", "3–40 ft", "~30 min"],
    group: "Full tests",
  },
  {
    id: "putting-9",
    category: "Putting",
    href: "/practice/putting-test-9",
    label: puttingTest9Config.testName,
    title: "9-Hole Putting Test",
    blurb: "Short on time? Same test, half the holes.",
    meta: ["9 putts", "3–40 ft", "~20 min"],
    group: "Full tests",
  },
  {
    id: "putting-3-6",
    category: "Putting",
    href: "/practice/putting-test-3-6ft",
    label: puttingTest3To6ftConfig.testName,
    title: "3–6 ft",
    blurb: "The ones you have to make.",
    meta: ["10 putts", "~20 min"],
    group: "By distance",
  },
  {
    id: "putting-8-20",
    category: "Putting",
    href: "/practice/putting-test-8-20ft",
    label: puttingTest8To20Config.testName,
    title: "8–20 ft",
    blurb: "Mid-range chances to hole out.",
    meta: ["10 putts", "~20 min"],
    group: "By distance",
  },
  {
    id: "putting-20-40",
    category: "Putting",
    href: "/practice/putting-test-20-40ft",
    label: puttingTest20To40Config.testName,
    title: "20–40 ft Lag",
    blurb: "Get it close and take the 3-putt away.",
    meta: ["10 putts", "~20 min"],
    group: "By distance",
  },
  {
    id: "strike-speed",
    category: "Putting",
    href: "/practice/strike-and-speed-control-test",
    label: strikeAndSpeedControlTestConfig.testName,
    title: "Strike & Speed",
    blurb: "Centred strike through a gate, then stop it on the tee.",
    meta: ["12 putts", "5–30 ft", "Lowest wins"],
    group: "Skill tests",
  },
  {
    id: "start-line-speed",
    category: "Putting",
    href: "/practice/start-line-and-speed-control-test",
    label: startLineAndSpeedControlTestConfig.testName,
    title: "Start Line & Speed",
    blurb: "Start it through the gate and control the pace.",
    meta: ["12 putts", "5–30 ft", "Lowest wins"],
    group: "Skill tests",
  },
  {
    id: "aimpoint-6ft",
    category: "Putting",
    href: "/practice/6ft-aimpoint-combine",
    label: aimpoint6ftCombineConfig.testName,
    title: "AimPoint 6 ft",
    blurb: "Read the slope, then check it.",
    meta: ["10 putts", "2 reads each"],
    group: "Green reading",
  },
  {
    id: "aimpoint-8-20",
    category: "Putting",
    href: "/practice/8-20ft-aimpoint-combine",
    label: midRangeSlopeSensingConfig.testName,
    title: "AimPoint 8–20 ft",
    blurb: "Feel the slope where the putt breaks most.",
    meta: ["10 putts", "2 reads each"],
    group: "Green reading",
  },
  {
    id: "aimpoint-long-20-40",
    category: "Putting",
    href: "/practice/aimpoint-long-range-2040",
    label: aimpointLongRange2040Config.testName,
    title: "AimPoint 20–40 ft",
    blurb: "Three reads on the long ones.",
    meta: ["10 putts", "3 reads each"],
    group: "Green reading",
  },
  {
    id: "chipping-combine-9",
    category: "Chipping",
    href: "/practice/chipping-combine-9",
    label: chippingCombine9Config.testName,
    title: "9-Hole Chipping Combine",
    blurb: "Chip and putt to save par from 10–30 m.",
    meta: ["9 holes", "10–30 m"],
    group: "Scramble",
  },
  {
    id: "standard-chipping-combine",
    category: "Chipping",
    href: "/practice/standard-chipping-combine",
    label: standardChippingCombineConfig.testName,
    title: "Standard Chipping",
    blurb: "How close can you get it?",
    meta: ["15 shots", "5, 10, 20 m"],
    group: "Proximity",
  },
  {
    id: "low-chip-combine",
    category: "Chipping",
    href: "/practice/low-chip-combine",
    label: lowChipCombineConfig.testName,
    title: "Low Chip",
    blurb: "Low runners that release to the hole.",
    meta: ["15 shots", "5, 10, 20 m"],
    group: "Proximity",
  },
  {
    id: "flop-shot-combine",
    category: "Chipping",
    href: "/practice/flop-shot-combine",
    label: flopShotCombineConfig.testName,
    title: "Flop Shot",
    blurb: "High and soft. Land it and stop it.",
    meta: ["15 shots", "5, 10, 20 m"],
    group: "Proximity",
  },
  {
    id: "wedge-lateral-9",
    category: "Wedges",
    href: "/practice/wedge-lateral-9",
    label: wedgeLateral9Config.testName,
    title: "Wedge Lateral Test",
    blurb: "Random full-swing wedge distances. Stay on line.",
    meta: ["9 shots", "30–100 m"],
    group: "Tests",
  },
  {
    id: "survival-20",
    category: "Wedges",
    href: "/practice/survival-20",
    label: survival20Config.testName,
    title: "Survival 20",
    blurb: "Your distance buffer shrinks with every miss. How long can you last?",
    meta: ["Streak game", "30–100 m"],
    group: "Games",
  },
  {
    id: "three-strikes-wedge-challenge",
    category: "Wedges",
    href: "/practice/3-strikes-wedge-challenge",
    label: threeStrikesWedgeConfig.testName,
    title: "3 Strikes",
    blurb: "Land it within 3 m of the number. Three misses and you're out.",
    meta: ["Streak game", "30–100 m"],
    group: "Games",
  },
  {
    id: "iron-precision-protocol",
    category: "Irons",
    href: "/practice/iron-precision-protocol",
    label: ironPrecisionProtocolConfig.testName,
    title: "Iron Precision Protocol",
    blurb: "One shot with each iron. Dispersion, strike and start line.",
    meta: ["9 shots", "PW to 2i"],
    group: "Tests",
  },
  {
    id: "iron-face-control-protocol",
    category: "Irons",
    href: "/practice/iron-face-control-protocol",
    label: ironFaceControlConfig.testName,
    title: "Iron Face Control",
    blurb: "Hit the gate, shape the curve, strike it solid.",
    meta: ["10 shots", "100 pts max"],
    group: "Tests",
  },
  {
    id: "iron-skills-challenge",
    category: "Irons",
    href: "/combines/iron-skills",
    label: "Iron Skills Challenge",
    title: "Iron Skills Challenge",
    blurb: "Random shot challenges that level up as you improve.",
    meta: ["Levels up"],
    group: "Games",
  },
  {
    id: "tee-shot-dispersion-combine",
    category: "Tee Shot",
    href: "/practice/tee-shot-dispersion-combine",
    label: teeShotDispersionCombineConfig.testName,
    title: "Tee Shot Dispersion",
    blurb: "Direction, dispersion and strike with the driver.",
    meta: ["14 shots", "Driver"],
    group: "Tests",
  },
  {
    id: "bunker-9-hole-challenge",
    category: "Bunkers",
    href: "/practice/bunker-9-hole-challenge",
    label: bunker9HoleChallengeConfig.testName,
    title: "9-Hole Bunker Challenge",
    blurb: "Splash out, then hole the putt to save par.",
    meta: ["9 holes"],
    group: "Scramble",
  },
  {
    id: "bunker-proximity-protocol",
    category: "Bunkers",
    href: "/practice/bunker-proximity-protocol",
    label: bunkerProximityProtocolConfig.testName,
    title: "Bunker Proximity",
    blurb: "Get it inside 1 m from three distances.",
    meta: ["12 shots", "5, 10, 20 m"],
    group: "Proximity",
  },
];
