import type { CombineReportId } from "@/components/coaching/CombineReportSheet";
import { bunker9HoleChallengeConfig } from "@/lib/bunker9HoleChallengeConfig";
import { bunkerProximityProtocolConfig } from "@/lib/bunkerProximityProtocolConfig";
import { chippingCombine9Config } from "@/lib/chippingCombine9Config";
import { flopShotCombineConfig } from "@/lib/flopShotCombineConfig";
import { lowChipCombineConfig } from "@/lib/lowChipCombineConfig";
import { standardChippingCombineConfig } from "@/lib/standardChippingCombineConfig";
import { survival20Config } from "@/lib/survival20Config";
import { teeShotDispersionCombineConfig } from "@/lib/teeShotDispersionCombineConfig";
import { threeStrikesWedgeConfig } from "@/lib/threeStrikesWedgeConfig";
import { wedgeLateral9Config } from "@/lib/wedgeLateral9Config";
import { approachShotSimConfig } from "@/lib/approachShotSimConfig";

/** Page titles that don't match the stored test name still open the right history. */
const HISTORY_BY_LABEL: Record<string, CombineReportId> = {
  "18-Hole Putting Test": "puttingCombine",
  "9-Hole Putting Test": "puttingTest9Holes",
  "3–6 ft Putting Test": "puttingTest3To6ft",
  "8–20 ft Putting Test": "puttingTest8To20",
  "20–40 ft Lag Putting Test": "puttingTest20To40",
  "Start Line & Speed Control": "start_line_speed_test",
  "Strike & Speed Control": "strike_speed_control",
  "6 ft AimPoint Combine": "aimpoint_6ft_combine",
  "8–20 ft AimPoint Combine": "slope_mid_20ft",
  "20–40 ft AimPoint Combine": "aimpoint_long_40ft",
  "Iron Precision Protocol": "ironPrecisionProtocol",
  "Bunker Lies": "bunker_lies",
  "Driver Flight Control": "driver_flight_control",
  "Fade vs Draw": "iron_fade_draw",
  "Tee Shot Hazards": "tee_shot_hazard",
  "Iron Face Control": "iron_face_control",
  "Iron Safe Side": "iron_safe_side",
  [approachShotSimConfig.testName]: "approach_shot_sim",
  "Mobility Screen": "mobility_screen",
  [teeShotDispersionCombineConfig.testName]: "tee_shot_dispersion_combine",
  [bunker9HoleChallengeConfig.testName]: "bunker_9_hole_challenge",
  [bunkerProximityProtocolConfig.testName]: "bunker_protocol",
  [threeStrikesWedgeConfig.testName]: "three_strikes",
  [flopShotCombineConfig.testName]: "flop_shot",
  [lowChipCombineConfig.testName]: "low_chip",
  [standardChippingCombineConfig.testName]: "chipping",
  [chippingCombine9Config.testName]: "chipping_combine_9",
  [wedgeLateral9Config.testName]: "wedge_lateral_9",
  [survival20Config.testName]: "survival_20",
};

/** Practice-hub card id → saved-report id. Cards without a saved test are omitted. */
export const COMBINE_HISTORY_BY_CARD: Record<string, CombineReportId> = {
  "putting-18": "puttingCombine",
  "putting-9": "puttingTest9Holes",
  "putting-3-6": "puttingTest3To6ft",
  "putting-8-20": "puttingTest8To20",
  "putting-20-40": "puttingTest20To40",
  "strike-speed": "strike_speed_control",
  "start-line-speed": "start_line_speed_test",
  "aimpoint-6ft": "aimpoint_6ft_combine",
  "aimpoint-8-20": "slope_mid_20ft",
  "aimpoint-long-20-40": "aimpoint_long_40ft",
  "chipping-combine-9": "chipping_combine_9",
  "standard-chipping-combine": "chipping",
  "low-chip-combine": "low_chip",
  "flop-shot-combine": "flop_shot",
  "wedge-lateral-9": "wedge_lateral_9",
  "survival-20": "survival_20",
  "three-strikes-wedge-challenge": "three_strikes",
  "iron-precision-protocol": "ironPrecisionProtocol",
  "iron-face-control-protocol": "iron_face_control",
  "approach-shot-sim": "approach_shot_sim",
  "iron-safe-side": "iron_safe_side",
  "iron-fade-vs-draw": "iron_fade_draw",
  "tee-shot-dispersion-combine": "tee_shot_dispersion_combine",
  "tee-shot-hazard": "tee_shot_hazard",
  "driver-flight-test": "driver_flight_control",
  "bunker-9-hole-challenge": "bunker_9_hole_challenge",
  "bunker-proximity-protocol": "bunker_protocol",
  "bunker-lies": "bunker_lies",
};

export function combineHistoryIdForLabel(label: string): CombineReportId | null {
  return HISTORY_BY_LABEL[label] ?? null;
}
