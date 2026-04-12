import { puttingTestConfig } from "@/lib/puttingTestConfig";
import { puttingTest9Config } from "@/lib/puttingTest9Config";
import { puttingTest3To6ftConfig } from "@/lib/puttingTest3To6ftConfig";
import { puttingTest8To20Config } from "@/lib/puttingTest8To20Config";
import { puttingTest20To40Config } from "@/lib/puttingTest20To40Config";
import { strikeAndSpeedControlTestConfig } from "@/lib/strikeAndSpeedControlTestConfig";
import { startLineAndSpeedControlTestConfig } from "@/lib/startLineAndSpeedControlTestConfig";
import { gauntletPrecisionProtocolConfig } from "@/lib/gauntletPrecisionProtocolConfig";
import { aimpoint6ftCombineConfig } from "@/lib/aimpoint6ftCombineConfig";
import { midRangeSlopeSensingConfig } from "@/lib/midRangeSlopeSensingConfig";
import { aimpointLongRange2040Config } from "@/lib/aimpointLongRange2040Config";
import { chippingCombine9Config } from "@/lib/chippingCombine9Config";
import { ironPrecisionProtocolConfig } from "@/lib/ironPrecisionProtocolConfig";
import { wedgeLateral9Config } from "@/lib/wedgeLateral9Config";

export const COMBINE_CATEGORY_IDS = [
  "Putting",
  "Chipping",
  "Wedges",
  "Irons",
  "Tee Shot",
  "Bunkers",
] as const;

export type CombineCategoryId = (typeof COMBINE_CATEGORY_IDS)[number];

export type CombineTestVisualVariant = "default" | "gauntlet";

export type CombineTestCard = {
  id: string;
  category: CombineCategoryId;
  href: string;
  label: string;
  visualVariant?: CombineTestVisualVariant;
};

/**
 * Combine test tiles for the Practice hub. Extend with `category` when new combines ship.
 */
export const COMBINE_TEST_CARDS: CombineTestCard[] = [
  {
    id: "putting-18",
    category: "Putting",
    href: "/practice/putting-test",
    label: puttingTestConfig.testName,
  },
  {
    id: "putting-9",
    category: "Putting",
    href: "/practice/putting-test-9",
    label: puttingTest9Config.testName,
  },
  {
    id: "putting-3-6",
    category: "Putting",
    href: "/practice/putting-test-3-6ft",
    label: puttingTest3To6ftConfig.testName,
  },
  {
    id: "putting-8-20",
    category: "Putting",
    href: "/practice/putting-test-8-20ft",
    label: puttingTest8To20Config.testName,
  },
  {
    id: "putting-20-40",
    category: "Putting",
    href: "/practice/putting-test-20-40ft",
    label: puttingTest20To40Config.testName,
  },
  {
    id: "strike-speed",
    category: "Putting",
    href: "/practice/strike-and-speed-control-test",
    label: strikeAndSpeedControlTestConfig.testName,
  },
  {
    id: "start-line-speed",
    category: "Putting",
    href: "/practice/start-line-and-speed-control-test",
    label: startLineAndSpeedControlTestConfig.testName,
  },
  {
    id: "gauntlet",
    category: "Putting",
    href: "/practice/gauntlet-precision-protocol",
    label: gauntletPrecisionProtocolConfig.testName,
    visualVariant: "gauntlet",
  },
  {
    id: "aimpoint-6ft",
    category: "Putting",
    href: "/practice/6ft-aimpoint-combine",
    label: aimpoint6ftCombineConfig.testName,
  },
  {
    id: "aimpoint-8-20",
    category: "Putting",
    href: "/practice/8-20ft-aimpoint-combine",
    label: midRangeSlopeSensingConfig.testName,
  },
  {
    id: "aimpoint-long-20-40",
    category: "Putting",
    href: "/practice/aimpoint-long-range-2040",
    label: aimpointLongRange2040Config.testName,
  },
  {
    id: "chipping-combine-9",
    category: "Chipping",
    href: "/practice/chipping-combine-9",
    label: chippingCombine9Config.testName,
  },
  {
    id: "wedge-lateral-9",
    category: "Wedges",
    href: "/practice/wedge-lateral-9",
    label: wedgeLateral9Config.testName,
  },
  {
    id: "iron-precision-protocol",
    category: "Irons",
    href: "/practice/iron-precision-protocol",
    label: ironPrecisionProtocolConfig.testName,
  },
];
