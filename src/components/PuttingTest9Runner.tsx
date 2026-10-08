"use client";

import { puttingTest9Config } from "@/lib/puttingTest9Config";
import {
  PuttingCombineRunner,
  type PuttingCombineFormat,
  type PuttingCombineHoleRecord,
} from "@/components/combine/PuttingCombineRunner";

export type Putting9HoleRecord = PuttingCombineHoleRecord;

const FORMAT: PuttingCombineFormat = {
  holeCount: 9,
  gradeVariant: 9,
  title: "9-Hole Putting Test",
  distances: puttingTest9Config.distances,
  shapeCounts: { straight: 3, leftToRight: 3, rightToLeft: 3 },
  allowLipOut: true,
  distanceRange: "3 to 40 ft",
  duration: "~20 min",
  practiceType: puttingTest9Config.practiceType,
  noteKind: puttingTest9Config.noteKind,
  logTag: "PuttingTest9",
};

export function PuttingTest9Runner() {
  return <PuttingCombineRunner format={FORMAT} />;
}
