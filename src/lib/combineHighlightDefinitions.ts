import type { CombineHighlightDefinition } from "@/lib/combinePageLeaderboard";
import { aimpoint6ftCombineConfig } from "@/lib/aimpoint6ftCombineConfig";
import { aimpointLongRange2040Config } from "@/lib/aimpointLongRange2040Config";
import { chippingCombine9Config } from "@/lib/chippingCombine9Config";
import { gauntletPrecisionProtocolConfig } from "@/lib/gauntletPrecisionProtocolConfig";
import { ironPrecisionProtocolConfig } from "@/lib/ironPrecisionProtocolConfig";
import { midRangeSlopeSensingConfig } from "@/lib/midRangeSlopeSensingConfig";
import { puttingTest3To6ftConfig } from "@/lib/puttingTest3To6ftConfig";
import { puttingTest8To20Config } from "@/lib/puttingTest8To20Config";
import { puttingTest20To40Config } from "@/lib/puttingTest20To40Config";
import { puttingTest9Config } from "@/lib/puttingTest9Config";
import { startLineAndSpeedControlTestConfig } from "@/lib/startLineAndSpeedControlTestConfig";
import { strikeAndSpeedControlTestConfig } from "@/lib/strikeAndSpeedControlTestConfig";
import { teeShotDispersionCombineConfig } from "@/lib/teeShotDispersionCombineConfig";
import { wedgeLateral9Config } from "@/lib/wedgeLateral9Config";
import { bunker9HoleChallengeConfig } from "@/lib/bunker9HoleChallengeConfig";

export const combineHighlightAimpoint6ft: CombineHighlightDefinition = {
  kind: "practice_by_test_type",
  testType: aimpoint6ftCombineConfig.testType,
  higherIsBetter: true,
  improvementUnit: "percent",
};

export const combineHighlightAimpoint820: CombineHighlightDefinition = {
  kind: "practice_by_test_type",
  testType: midRangeSlopeSensingConfig.testType,
  higherIsBetter: true,
  improvementUnit: "percent",
};

export const combineHighlightAimpointLong2040: CombineHighlightDefinition = {
  kind: "practice_by_test_type",
  testType: aimpointLongRange2040Config.testType,
  higherIsBetter: true,
  improvementUnit: "percent",
};

export const combineHighlightChipping9: CombineHighlightDefinition = {
  kind: "practice_by_test_type",
  testType: chippingCombine9Config.testType,
  higherIsBetter: true,
  improvementUnit: "percent",
};

export const combineHighlightWedgeLateral9: CombineHighlightDefinition = {
  kind: "practice_by_test_type",
  testType: wedgeLateral9Config.testType,
  higherIsBetter: true,
  improvementUnit: "points",
};

export const combineHighlightTeeShotDispersion: CombineHighlightDefinition = {
  kind: "practice_by_test_type",
  testType: teeShotDispersionCombineConfig.testType,
  higherIsBetter: true,
  improvementUnit: "points",
};

export const combineHighlightPutting18: CombineHighlightDefinition = {
  kind: "putting_practice",
  practiceType: "putting-test",
  lastHoleIndex: 17,
  higherIsBetter: true,
  improvementUnit: "points",
};

export const combineHighlightPutting9: CombineHighlightDefinition = {
  kind: "putting_practice",
  practiceType: puttingTest9Config.practiceType,
  lastHoleIndex: 8,
  higherIsBetter: true,
  improvementUnit: "points",
};

export const combineHighlightPutting36: CombineHighlightDefinition = {
  kind: "putting_practice",
  practiceType: puttingTest3To6ftConfig.practiceType,
  lastHoleIndex: puttingTest3To6ftConfig.holeCount - 1,
  higherIsBetter: true,
  improvementUnit: "points",
};

export const combineHighlightPutting820: CombineHighlightDefinition = {
  kind: "putting_practice",
  practiceType: puttingTest8To20Config.practiceType,
  lastHoleIndex: puttingTest8To20Config.holeCount - 1,
  higherIsBetter: true,
  improvementUnit: "points",
};

export const combineHighlightPutting2040: CombineHighlightDefinition = {
  kind: "putting_practice",
  practiceType: puttingTest20To40Config.practiceType,
  lastHoleIndex: puttingTest20To40Config.holeCount - 1,
  higherIsBetter: true,
  improvementUnit: "points",
};

export const combineHighlightGauntlet: CombineHighlightDefinition = {
  kind: "practice_logs",
  logType: gauntletPrecisionProtocolConfig.practiceLogType,
  higherIsBetter: false,
  scoreMode: "matrix_average",
  improvementUnit: "index",
};

export const combineHighlightIronPrecision: CombineHighlightDefinition = {
  kind: "practice_logs",
  logType: ironPrecisionProtocolConfig.practiceLogType,
  higherIsBetter: true,
  scoreMode: "total_points",
  improvementUnit: "points",
};

export const combineHighlightStrikeSpeed: CombineHighlightDefinition = {
  kind: "practice_logs",
  logType: strikeAndSpeedControlTestConfig.practiceLogType,
  higherIsBetter: false,
  scoreMode: "matrix_average",
  improvementUnit: "index",
};

export const combineHighlightStartLine: CombineHighlightDefinition = {
  kind: "practice_logs",
  logType: startLineAndSpeedControlTestConfig.practiceLogType,
  higherIsBetter: false,
  scoreMode: "matrix_average",
  improvementUnit: "index",
};

export const combineHighlightBunker9: CombineHighlightDefinition = {
  kind: "practice_by_test_type",
  testType: bunker9HoleChallengeConfig.testType,
  higherIsBetter: true,
  improvementUnit: "points",
};
