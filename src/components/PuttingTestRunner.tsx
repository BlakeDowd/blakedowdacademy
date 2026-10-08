"use client";

import { puttingTestConfig } from "@/lib/puttingTestConfig";
import {
  PuttingCombineRunner,
  type PuttingCombineFormat,
  type PuttingCombineHoleRecord,
} from "@/components/combine/PuttingCombineRunner";

export type PuttingHoleRecord = PuttingCombineHoleRecord;

const FORMAT: PuttingCombineFormat = {
  holeCount: 18,
  gradeVariant: 18,
  title: "18-Hole Putting Test",
  distances: puttingTestConfig.distances,
  shapeCounts: { straight: 6, leftToRight: 6, rightToLeft: 6 },
  allowLipOut: true,
  distanceRange: "3 to 40 ft",
  duration: "~30 min",
  practiceType: "putting-test",
  noteKind: "putting_test_hole",
  logTag: "PuttingTest",
  scratch: {
    points: puttingTestConfig.benchmarks.scratchPoints,
    putts: puttingTestConfig.benchmarks.scratchPutts,
  },
};

export function PuttingTestRunner() {
  return <PuttingCombineRunner format={FORMAT} />;
}
