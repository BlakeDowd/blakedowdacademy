"use client";

import { useCallback, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { useAuth } from "@/contexts/AuthContext";
import { puttingTestConfig } from "@/lib/puttingTestConfig";
import { puttingTest8To20Config } from "@/lib/puttingTest8To20Config";
import type { PrimaryMissReason } from "@/lib/puttingTestMissDiagnostics";
import {
  PUTTING_TEST_MISS_CATEGORY_LABELS,
  scorePuttingTestMissHole,
} from "@/lib/puttingTestMissScoring";
import { PuttingMissDiagnosticsSection } from "@/components/PuttingMissDiagnostics";
import { PuttingTestResultsSummaryCard } from "@/components/PuttingTestResultsSummaryCard";

type ShapeKey = (typeof puttingTestConfig.shapes)[number];
type MissCategory = "highLong" | "highShort" | "lowLong" | "lowShort";

export type Putting8To20HoleRecord = {
  holeIndex: number;
  distance: number;
  shape: ShapeKey;
  outcome: "make" | "miss";
  missReason: MissCategory | null;
  primaryMissReason: PrimaryMissReason | null;
  missCategoryLabel?: string | null;
  secondPuttDistanceFt: number | null;
  putts: 1 | 2 | 3;
  points: number;
  isThreePutt: boolean;
};

type HoleSetup = { distance: number; shape: ShapeKey };

type ActivePhase = "first-putt" | "miss-category" | "primary-reason" | "second-putt";

const HOLES = puttingTest8To20Config.holeCount;

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildHoles8To20(): HoleSetup[] {
  const distances = shuffle([...puttingTest8To20Config.distances]);
  const shapePool: ShapeKey[] = [
    ...Array(puttingTest8To20Config.straightCount).fill("Straight" as const),
    ...Array(puttingTest8To20Config.leftToRightCount).fill("Left-to-Right" as const),
    ...Array(puttingTest8To20Config.rightToLeftCount).fill("Right-to-Left" as const),
  ];
  const shapes = shuffle(shapePool);
  return distances.map((distance, i) => ({
    distance,
    shape: shapes[i],
  }));
}

function shapeLabel(shape: ShapeKey): string {
  if (shape === "Left-to-Right") return "L-to-R";
  if (shape === "Right-to-Left") return "R-to-L";
  return shape;
}

async function persistHoleToSupabase(userId: string, record: Putting8To20HoleRecord) {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { error } = await supabase.from("practice").insert({
      user_id: userId,
      type: puttingTest8To20Config.practiceType,
      duration_minutes: 0,
      notes: JSON.stringify({
        kind: puttingTest8To20Config.noteKind,
        holeIndex: record.holeIndex,
        distance: record.distance,
        shape: record.shape,
        outcome: record.outcome,
        missReason: record.missReason,
        missCategoryLabel: record.missCategoryLabel ?? null,
        primaryMissReason: record.primaryMissReason,
        secondPuttDistanceFt: record.secondPuttDistanceFt,
        putts: record.putts,
        points: record.points,
        isThreePutt: record.isThreePutt,
      }),
    });
    if (error) {
      console.warn("[PuttingTest8To20] Supabase save:", error.message);
    } else if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("practiceSessionsUpdated"));
    }
  } catch (e) {
    console.warn("[PuttingTest8To20] Supabase save failed", e);
  }
}

export function PuttingTest8To20Runner() {
  const { user } = useAuth();
  const [status, setStatus] = useState<"intro" | "active" | "complete">("intro");
  const [holes, setHoles] = useState<HoleSetup[]>([]);
  const [currentHoleIndex, setCurrentHoleIndex] = useState(0);
  const [totalPoints, setTotalPoints] = useState(0);
  const [totalPutts, setTotalPutts] = useState(0);
  const [holeLog, setHoleLog] = useState<Putting8To20HoleRecord[]>([]);
  const [phase, setPhase] = useState<ActivePhase>("first-putt");
  const [missCategory, setMissCategory] = useState<MissCategory | null>(null);
  const [primaryMissReason, setPrimaryMissReason] = useState<PrimaryMissReason | null>(null);
  const [secondPuttDistanceInput, setSecondPuttDistanceInput] = useState("");

  const currentHole = holes[currentHoleIndex];
  const secondPuttDistanceNum = parseFloat(secondPuttDistanceInput);
  const secondDistanceValid =
    secondPuttDistanceInput.trim() !== "" &&
    !Number.isNaN(secondPuttDistanceNum) &&
    secondPuttDistanceNum > 0;

  const startTest = useCallback(() => {
    setHoles(buildHoles8To20());
    setCurrentHoleIndex(0);
    setTotalPoints(0);
    setTotalPutts(0);
    setHoleLog([]);
    setPhase("first-putt");
    setMissCategory(null);
    setPrimaryMissReason(null);
    setSecondPuttDistanceInput("");
    setStatus("active");
  }, []);

  const finishHole = useCallback(
    (record: Putting8To20HoleRecord) => {
      flushSync(() => {
        setHoleLog((prev) => [...prev, record]);
        setTotalPoints((p) => p + record.points);
        setTotalPutts((p) => p + record.putts);
      });
      if (user?.id) {
        void persistHoleToSupabase(user.id, record);
      }
      setMissCategory(null);
      setPrimaryMissReason(null);
      setSecondPuttDistanceInput("");
      setPhase("first-putt");

      const nextIndex = currentHoleIndex + 1;
      if (nextIndex >= HOLES) {
        setStatus("complete");
      } else {
        setCurrentHoleIndex(nextIndex);
      }
    },
    [user?.id, currentHoleIndex],
  );

  const onMake = useCallback(() => {
    if (!currentHole || status !== "active") return;
    const pts = puttingTestConfig.points.make;
    finishHole({
      holeIndex: currentHoleIndex,
      distance: currentHole.distance,
      shape: currentHole.shape,
      outcome: "make",
      missReason: null,
      primaryMissReason: null,
      missCategoryLabel: null,
      secondPuttDistanceFt: null,
      putts: 1,
      points: pts,
      isThreePutt: false,
    });
  }, [currentHole, currentHoleIndex, finishHole, status]);

  const onFirstMiss = useCallback(() => {
    setPhase("miss-category");
  }, []);

  const onPickCategory = useCallback((cat: MissCategory) => {
    setMissCategory(cat);
    setPhase("primary-reason");
  }, []);

  const onPickPrimaryMissReason = useCallback((reason: PrimaryMissReason) => {
    setPrimaryMissReason(reason);
    setPhase("second-putt");
  }, []);

  const onSecondPuttResult = useCallback(
    (made: boolean) => {
      if (
        !currentHole ||
        missCategory == null ||
        primaryMissReason == null ||
        !secondDistanceValid
      )
        return;
      const { points, putts, isThreePutt } = scorePuttingTestMissHole({
        missCategory,
        secondPuttDistanceFt: secondPuttDistanceNum,
        madeSecondPutt: made,
      });
      finishHole({
        holeIndex: currentHoleIndex,
        distance: currentHole.distance,
        shape: currentHole.shape,
        outcome: "miss",
        missReason: missCategory,
        primaryMissReason,
        missCategoryLabel: PUTTING_TEST_MISS_CATEGORY_LABELS[missCategory],
        secondPuttDistanceFt: secondPuttDistanceNum,
        putts,
        points,
        isThreePutt,
      });
    },
    [
      currentHole,
      currentHoleIndex,
      finishHole,
      missCategory,
      primaryMissReason,
      secondDistanceValid,
      secondPuttDistanceNum,
    ],
  );

  const summary = useMemo(() => {
    if (holeLog.length === 0) return null;
    return {
      holes: holeLog.length,
      points: holeLog.reduce((s, h) => s + h.points, 0),
      putts: holeLog.reduce((s, h) => s + h.putts, 0),
    };
  }, [holeLog]);

  if (status === "intro") {
    return (
      <div className="mt-6 space-y-4">
        <h2 className="text-lg font-semibold leading-snug text-gray-900">
          {puttingTest8To20Config.testName}
        </h2>
        <p className="text-sm text-gray-600">
          Ten putts from 8–20 feet. Distances are shuffled each run with two straight, four
          left-to-right, and four right-to-left breaks (random order). Makes are +10; miss scoring uses
          the high/long–short grid and second-putt distance (≤1.5 ft pro-side drop zone where
          applicable). Three-putts are −10.
        </p>
        <button
          type="button"
          onClick={startTest}
          className="w-full py-3 rounded-xl bg-[#014421] text-white font-semibold hover:opacity-90 transition-opacity"
        >
          Start test
        </button>
      </div>
    );
  }

  if (status === "complete" && summary) {
    return (
      <div className="mt-6 space-y-5">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-gray-900">{puttingTest8To20Config.testName}</p>
          <h2 className="text-base font-medium text-gray-600">Test complete</h2>
        </div>
        <PuttingTestResultsSummaryCard points={summary.points} putts={summary.putts} variant="8to20" />
        <PuttingMissDiagnosticsSection holeLog={holeLog} />
        <button
          type="button"
          onClick={startTest}
          className="w-full py-3 rounded-xl border-2 border-[#014421] text-[#014421] font-semibold hover:bg-[#014421]/5 transition-colors"
        >
          Run again
        </button>
      </div>
    );
  }

  if (!currentHole) {
    return null;
  }

  const holeDisplay = currentHoleIndex + 1;

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 sm:px-4">
        <p className="text-center text-sm font-semibold leading-tight text-gray-900 sm:text-left">
          {puttingTest8To20Config.testName}
        </p>
      </div>

      <div className="flex justify-between gap-3 text-sm">
        <div className="text-gray-600">
          Points: <span className="font-semibold text-gray-900">{totalPoints}</span>
        </div>
        <div className="text-gray-600">
          Putts: <span className="font-semibold text-gray-900">{totalPutts}</span>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <p className="text-base font-medium text-gray-900">
          Hole {holeDisplay}/{HOLES}: {currentHole.distance}ft - {shapeLabel(currentHole.shape)}
        </p>
      </div>

      {phase === "first-putt" && (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onMake}
            className="py-3 rounded-xl bg-[#014421] text-white font-semibold hover:opacity-90 transition-opacity"
          >
            MAKE
          </button>
          <button
            type="button"
            onClick={onFirstMiss}
            className="py-3 rounded-xl border-2 border-gray-300 text-gray-800 font-semibold hover:border-[#F57C00] hover:bg-orange-50 transition-colors"
          >
            MISS
          </button>
        </div>
      )}

      {phase === "miss-category" && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">First putt miss — pick category</p>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["highLong", "High / Long"],
                ["highShort", "High / Short"],
                ["lowLong", "Low / Long"],
                ["lowShort", "Low / Short"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => onPickCategory(key)}
                className="py-2.5 px-3 rounded-lg border-2 border-gray-200 text-sm font-medium text-gray-800 hover:border-[#014421] hover:bg-[#014421]/5 transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {phase === "primary-reason" && missCategory != null && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">Reason</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {(
              [
                ["read", "Read"],
                ["speed", "Speed"],
                ["startLine", "Start Line"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => onPickPrimaryMissReason(key as PrimaryMissReason)}
                className="py-2.5 px-3 rounded-lg border-2 border-gray-200 text-sm font-medium text-gray-800 hover:border-[#014421] hover:bg-[#014421]/5 transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {phase === "second-putt" && missCategory != null && primaryMissReason != null && (
        <div className="space-y-4">
          <div>
            <label htmlFor="second-putt-dist-820" className="block text-sm font-medium text-gray-700 mb-1">
              Second putt distance (ft)
            </label>
            <input
              id="second-putt-dist-820"
              type="text"
              inputMode="decimal"
              placeholder="e.g. 3"
              value={secondPuttDistanceInput}
              onChange={(e) => setSecondPuttDistanceInput(e.target.value)}
              className="w-full max-w-[120px] rounded-lg border-2 border-gray-200 px-3 py-2 text-sm focus:border-[#014421] focus:outline-none focus:ring-2 focus:ring-[#014421]/30"
            />
          </div>
          <p className="text-sm text-gray-600">Second putt result</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={!secondDistanceValid}
              onClick={() => onSecondPuttResult(true)}
              className="py-3 rounded-xl bg-[#014421] text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Made 2nd
            </button>
            <button
              type="button"
              disabled={!secondDistanceValid}
              onClick={() => onSecondPuttResult(false)}
              className="py-3 rounded-xl border-2 border-gray-300 text-gray-800 font-semibold hover:border-red-400 hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Missed 2nd (3-putt)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
