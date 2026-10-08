"use client";

import { puttingTest20To40Config as c } from "@/lib/puttingTest20To40Config";
import {
  PuttingCombineRunner,
  type PuttingCombineFormat,
  type PuttingCombineHoleRecord,
} from "@/components/combine/PuttingCombineRunner";

export type Putting20To40HoleRecord = PuttingCombineHoleRecord;

const FORMAT: PuttingCombineFormat = {
  holeCount: c.holeCount,
  gradeVariant: "20to40",
  title: "20–40 ft Lag Putting Test",
  distances: c.distances,
  shapeCounts: { straight: c.straightCount, leftToRight: c.leftToRightCount, rightToLeft: c.rightToLeftCount },
  distanceRange: "20 to 40 ft",
  duration: "~20 min",
  practiceType: c.practiceType,
  noteKind: c.noteKind,
  logTag: "PuttingTest20To40",
  allowLipOut: false,
};

export function PuttingTest20To40Runner() {
  return <PuttingCombineRunner format={FORMAT} />;
}
