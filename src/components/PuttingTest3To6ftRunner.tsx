"use client";

import { puttingTest3To6ftConfig as c } from "@/lib/puttingTest3To6ftConfig";
import {
  PuttingCombineRunner,
  type PuttingCombineFormat,
  type PuttingCombineHoleRecord,
} from "@/components/combine/PuttingCombineRunner";

export type Putting3To6ftHoleRecord = PuttingCombineHoleRecord;

const FORMAT: PuttingCombineFormat = {
  holeCount: c.holeCount,
  gradeVariant: 10,
  title: "3–6 ft Putting Test",
  distances: c.distances,
  shapeCounts: { straight: c.straightCount, leftToRight: c.leftToRightCount, rightToLeft: c.rightToLeftCount },
  distanceRange: "3 to 6 ft",
  duration: "~20 min",
  practiceType: c.practiceType,
  noteKind: c.noteKind,
  logTag: "PuttingTest3To6ft",
  allowLipOut: false,
};

export function PuttingTest3To6ftRunner() {
  return <PuttingCombineRunner format={FORMAT} />;
}
