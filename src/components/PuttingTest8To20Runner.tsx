"use client";

import { puttingTest8To20Config as c } from "@/lib/puttingTest8To20Config";
import {
  PuttingCombineRunner,
  type PuttingCombineFormat,
  type PuttingCombineHoleRecord,
} from "@/components/combine/PuttingCombineRunner";

export type Putting8To20HoleRecord = PuttingCombineHoleRecord;

const FORMAT: PuttingCombineFormat = {
  holeCount: c.holeCount,
  gradeVariant: "8to20",
  title: "8–20 ft Putting Test",
  distances: c.distances,
  shapeCounts: { straight: c.straightCount, leftToRight: c.leftToRightCount, rightToLeft: c.rightToLeftCount },
  distanceRange: "8 to 20 ft",
  duration: "~20 min",
  practiceType: c.practiceType,
  noteKind: c.noteKind,
  logTag: "PuttingTest8To20",
  allowLipOut: false,
};

export function PuttingTest8To20Runner() {
  return <PuttingCombineRunner format={FORMAT} />;
}
