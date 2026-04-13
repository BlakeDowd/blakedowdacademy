"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { bunker9HoleChallengeConfig } from "@/lib/bunker9HoleChallengeConfig";
import type { ChipResultLabel } from "@/lib/chippingCombine9Analytics";
import {
  type BunkerHoleLog,
  type BunkerVerticalStrike,
  averageBunkerProximityCm,
  buildBunkerAggregates,
  bunkerPointsFromProximityCm,
  bunkerScrambleRate,
  bunkerSessionTotalPoints,
  bunkerZoneFromProximityCm,
  bunkerMissDiagnosisText,
  bunkerProximityRating,
  totalBunkerChipPoints,
  MAX_SESSION_POINTS,
  MAX_BUNKER_SESSION_CHIP,
} from "@/lib/bunker9HoleChallengeAnalytics";
import {
  PRIMARY_MISS_LABELS,
  type PrimaryMissReason,
} from "@/lib/puttingTestMissDiagnostics";
import {
  type PuttingTestMissCategory,
  PUTTING_TEST_MISS_CATEGORY_LABELS,
} from "@/lib/puttingTestMissScoring";
import { CombineFlowBackControl } from "@/components/CombineFlowBackControl";

function parseProximityCm(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function parseDistanceM(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0 || n > 400) return null;
  return n;
}

const ZONE_OPTIONS: { label: ChipResultLabel; hint: string }[] = [
  { label: "Holed", hint: "0 cm → 20 pts" },
  { label: "Inside Club Length", hint: "1–90 cm → 15–11 pts (linear)" },
  { label: "Inside 6ft", hint: "91–183 cm → 10–6 pts (linear)" },
  { label: "Safety Zone", hint: "184–300 cm → 5–1 pts (linear)" },
  { label: "Missed Zone", hint: ">300 cm → 0 pts" },
];

type Phase = "distance" | "proximity" | "strike" | "putt" | "audit-quadrant" | "audit-primary";

async function persistSession(userId: string, holes: BunkerHoleLog[], aggregates: Record<string, unknown>) {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const proximityScores = holes.map((h) => ({
      hole: h.hole,
      zone: h.zone,
      bunker_chip_points: h.bunker_chip_points,
      proximity_cm: h.proximity_cm,
      distance_m: h.distance_m,
      strike_vertical: h.strike_vertical,
      holed: h.holed,
      putt_made: h.putt_made ?? null,
      putt_points: h.putt_points,
    }));
    const missCategories = holes
      .filter((h) => !h.holed && !h.putt_made && (h.miss_category || h.first_putt_miss_quadrant))
      .map((h) => ({
        hole: h.hole,
        category: h.miss_category,
        quadrant: h.first_putt_miss_quadrant ?? null,
        primary_reason: h.putt_miss_primary_reason ?? null,
      }));

    const { error } = await supabase.from("practice").insert({
      user_id: userId,
      type: bunker9HoleChallengeConfig.testType,
      test_type: bunker9HoleChallengeConfig.testType,
      duration_minutes: 0,
      metadata: {
        version: 1,
        proximity_scores: proximityScores,
        miss_categories: missCategories,
        holes,
        aggregates,
      },
      notes: JSON.stringify({
        kind: bunker9HoleChallengeConfig.noteKind,
        scramble_rate: aggregates.scramble_rate,
        proximity_rating: aggregates.proximity_rating,
        diagnosis: aggregates.diagnosis,
        total_points: aggregates.total_points,
      }),
    });
    if (error) {
      console.warn("[Bunker9HoleChallenge] practice insert:", error.message);
      return false;
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("practiceSessionsUpdated"));
    }
    return true;
  } catch (e) {
    console.warn("[Bunker9HoleChallenge] practice insert failed", e);
    return false;
  }
}

export function Bunker9HoleChallengeRunner() {
  const { user } = useAuth();
  const [status, setStatus] = useState<"intro" | "active" | "complete">("intro");
  const [holeIndex, setHoleIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("distance");
  const [holes, setHoles] = useState<BunkerHoleLog[]>([]);
  const [distanceInput, setDistanceInput] = useState("");
  const [proximityInput, setProximityInput] = useState("");
  const [lockedCm, setLockedCm] = useState<number | null>(null);
  const [lockedZone, setLockedZone] = useState<ChipResultLabel | null>(null);
  const [strike, setStrike] = useState<BunkerVerticalStrike | null>(null);
  const [pendingMissQuadrant, setPendingMissQuadrant] = useState<PuttingTestMissCategory | null>(null);
  const [chipError, setChipError] = useState<string | null>(null);
  const [distanceError, setDistanceError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const persistAttemptedRef = useRef(false);

  const total = bunker9HoleChallengeConfig.holeCount;
  const displayHole = holeIndex + 1;

  const proximityCmParsed = useMemo(() => parseProximityCm(proximityInput), [proximityInput]);
  const suggestedZone = useMemo(() => {
    if (proximityCmParsed === null) return null;
    return bunkerZoneFromProximityCm(proximityCmParsed);
  }, [proximityCmParsed]);
  const calculatedChipPts = useMemo(() => {
    if (proximityCmParsed === null) return null;
    return bunkerPointsFromProximityCm(proximityCmParsed);
  }, [proximityCmParsed]);
  const startTest = useCallback(() => {
    setHoleIndex(0);
    setPhase("distance");
    setHoles([]);
    setDistanceInput("");
    setProximityInput("");
    setLockedCm(null);
    setLockedZone(null);
    setStrike(null);
    setPendingMissQuadrant(null);
    setChipError(null);
    setDistanceError(null);
    setSaveError(null);
    setSaved(false);
    persistAttemptedRef.current = false;
    setStatus("active");
  }, []);

  const finishHole = useCallback(
    async (entry: BunkerHoleLog) => {
      const next = [...holes, entry];
      setHoles(next);
      setDistanceInput("");
      setProximityInput("");
      setLockedCm(null);
      setLockedZone(null);
      setStrike(null);
      setPendingMissQuadrant(null);
      setChipError(null);
      setDistanceError(null);
      setPhase("distance");

      if (next.length >= total) {
        setStatus("complete");
        const aggregates = buildBunkerAggregates(next);
        if (!user?.id) {
          setSaveError("Sign in to save this session.");
          setSaved(false);
        } else if (!persistAttemptedRef.current) {
          persistAttemptedRef.current = true;
          setSaveError(null);
          const ok = await persistSession(user.id, next, aggregates);
          setSaved(ok);
          if (!ok) {
            setSaveError(
              "Could not save. Apply the latest database migration or check your connection.",
            );
            persistAttemptedRef.current = false;
          }
        }
      } else {
        setHoleIndex((i) => i + 1);
      }
    },
    [holes, total, user?.id],
  );

  const onContinueDistance = useCallback(() => {
    const d = parseDistanceM(distanceInput);
    if (d === null) {
      setDistanceError("Enter a valid start distance (1–400 m).");
      return;
    }
    setDistanceError(null);
    setPhase("proximity");
  }, [distanceInput]);

  const confirmProximityZone = useCallback(() => {
    const cm = parseProximityCm(proximityInput);
    if (cm === null) {
      setChipError("Enter distance from hole (cm) first.");
      return;
    }
    setChipError(null);
    setLockedCm(cm);
    setLockedZone(bunkerZoneFromProximityCm(cm));
    setPhase("strike");
  }, [proximityInput]);

  const onContinueStrike = useCallback(() => {
    if (!strike || lockedCm === null || lockedZone === null) return;
    const holed = lockedZone === "Holed";
    const chipPts = bunkerPointsFromProximityCm(lockedCm);
    const d = parseDistanceM(distanceInput);
    if (d === null) return;

    if (holed) {
      void finishHole({
        hole: displayHole,
        distance_m: d,
        proximity_cm: lockedCm,
        zone: lockedZone,
        bunker_chip_points: chipPts,
        strike_vertical: strike,
        holed: true,
        putt_points: 0,
      });
      return;
    }
    setPhase("putt");
  }, [strike, lockedCm, lockedZone, distanceInput, displayHole, finishHole]);

  const onPuttMade = useCallback(() => {
    if (phase !== "putt" || lockedCm === null || lockedZone === null || !strike) return;
    const d = parseDistanceM(distanceInput);
    if (d === null) return;
    const chipPts = bunkerPointsFromProximityCm(lockedCm);
    void finishHole({
      hole: displayHole,
      distance_m: d,
      proximity_cm: lockedCm,
      zone: lockedZone,
      bunker_chip_points: chipPts,
      strike_vertical: strike,
      holed: false,
      putt_made: true,
      putt_points: bunker9HoleChallengeConfig.scramblePuttBonus,
    });
  }, [phase, lockedCm, lockedZone, strike, distanceInput, displayHole, finishHole]);

  const onPuttMissed = useCallback(() => {
    if (phase !== "putt") return;
    setPendingMissQuadrant(null);
    setPhase("audit-quadrant");
  }, [phase]);

  const onPickFirstPuttMissQuadrant = useCallback((quadrant: PuttingTestMissCategory) => {
    if (phase !== "audit-quadrant") return;
    setPendingMissQuadrant(quadrant);
    setPhase("audit-primary");
  }, [phase]);

  const onPickPrimaryMissReason = useCallback(
    (reason: PrimaryMissReason) => {
      if (
        phase !== "audit-primary" ||
        lockedCm === null ||
        lockedZone === null ||
        !strike ||
        pendingMissQuadrant === null
      )
        return;
      const d = parseDistanceM(distanceInput);
      if (d === null) return;
      const chipPts = bunkerPointsFromProximityCm(lockedCm);
      const quadLabel = PUTTING_TEST_MISS_CATEGORY_LABELS[pendingMissQuadrant];
      const reasonLabel = PRIMARY_MISS_LABELS[reason];
      void finishHole({
        hole: displayHole,
        distance_m: d,
        proximity_cm: lockedCm,
        zone: lockedZone,
        bunker_chip_points: chipPts,
        strike_vertical: strike,
        holed: false,
        putt_made: false,
        putt_points: 0,
        first_putt_miss_quadrant: pendingMissQuadrant,
        putt_miss_primary_reason: reason,
        miss_category: `${quadLabel} · ${reasonLabel}`,
      });
    },
    [phase, lockedCm, lockedZone, strike, pendingMissQuadrant, distanceInput, displayHole, finishHole],
  );

  const goBackPhase = useCallback(() => {
    if (phase === "proximity") {
      setPhase("distance");
      return;
    }
    if (phase === "strike") {
      setPhase("proximity");
      setLockedCm(null);
      setLockedZone(null);
      return;
    }
    if (phase === "putt") {
      setPhase("strike");
      setPendingMissQuadrant(null);
      return;
    }
    if (phase === "audit-quadrant") {
      setPhase("putt");
      setPendingMissQuadrant(null);
      return;
    }
    if (phase === "audit-primary") {
      setPhase("audit-quadrant");
      setPendingMissQuadrant(null);
    }
  }, [phase]);

  const retryPersist = useCallback(async () => {
    if (!user?.id || holes.length < total) return;
    setSaveError(null);
    const aggregates = buildBunkerAggregates(holes);
    persistAttemptedRef.current = true;
    const ok = await persistSession(user.id, holes, aggregates);
    setSaved(ok);
    if (!ok) {
      setSaveError(
        "Could not save. Apply the latest database migration or check your connection.",
      );
      persistAttemptedRef.current = false;
    }
  }, [user?.id, holes, total]);

  const summary = useMemo(() => {
    if (holes.length < total) return null;
    return {
      scramblePct: bunkerScrambleRate(holes) * 100,
      proximityPct: bunkerProximityRating(holes) * 100,
      chipPts: totalBunkerChipPoints(holes),
      diagnosis: bunkerMissDiagnosisText(holes),
      totalPts: bunkerSessionTotalPoints(holes),
      avgProximityCm: averageBunkerProximityCm(holes),
    };
  }, [holes, total]);

  const choiceBtn =
    "w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-3 text-sm font-semibold text-gray-900 transition-colors hover:border-[#014421] hover:bg-[#014421]/5 text-left";
  const choiceBtnActive = "border-[#014421] bg-[#014421]/10 ring-2 ring-[#014421]/20";
  const choiceBtnDisabled = "opacity-40 cursor-not-allowed hover:border-gray-200 hover:bg-white";

  if (status === "intro") {
    return (
      <div className="mt-6 space-y-4">
        <p className="text-sm text-gray-600 leading-relaxed">
          Nine bunker shots. For each hole, enter your start distance (m), then proximity to the hole in
          centimeters (large keypad). Your zone and chip points are set automatically from cm. Log
          vertical strike only (thin / solid / fat). If you do not hole the sand shot, say whether the
          putt was made (+{bunker9HoleChallengeConfig.scramblePuttBonus} pts) or missed, then complete
          the miss audit (quadrant + read / speed / start line).
        </p>
        <button
          type="button"
          onClick={startTest}
          className="w-full py-3 rounded-xl bg-[#014421] text-white font-semibold hover:opacity-90 transition-opacity"
        >
          Start challenge
        </button>
      </div>
    );
  }

  if (status === "complete" && summary) {
    return (
      <div className="mt-6 space-y-5">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-gray-900">{bunker9HoleChallengeConfig.testName}</p>
          <h2 className="text-base font-medium text-gray-600">Session complete</h2>
        </div>

        <div className="rounded-2xl border-2 border-gray-200 bg-white p-5 shadow-sm space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Scramble rate</p>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">
                {summary.scramblePct.toFixed(0)}%
              </p>
              <p className="text-xs text-gray-500 mt-1">Made putts when a putt was required.</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Proximity rating</p>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">
                {summary.proximityPct.toFixed(0)}%
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Bunker chip points {summary.chipPts.toFixed(1)} / {MAX_BUNKER_SESSION_CHIP} max.
              </p>
            </div>
          </div>
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">Miss distribution</p>
            <p className="text-sm font-medium text-gray-900">{summary.diagnosis}</p>
          </div>
          <div className="border-t border-gray-100 pt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs text-gray-500">Total points (chip + scramble putts)</p>
              <p className="text-lg font-semibold text-gray-900 tabular-nums">
                {summary.totalPts.toFixed(1)} / {MAX_SESSION_POINTS}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Average proximity</p>
              <p className="text-lg font-semibold text-gray-900 tabular-nums">
                {summary.avgProximityCm !== null ? `${summary.avgProximityCm.toFixed(1)} cm` : "—"}
              </p>
            </div>
          </div>
        </div>

        {saveError && (
          <div className="space-y-2">
            <p className="text-sm text-red-600">{saveError}</p>
            {user?.id && (
              <button
                type="button"
                onClick={() => void retryPersist()}
                className="w-full py-3 rounded-xl border-2 border-[#014421] text-[#014421] font-semibold hover:bg-[#014421]/5 transition-colors"
              >
                Retry save
              </button>
            )}
          </div>
        )}
        {saved && !saveError && <p className="text-sm text-green-700 font-medium">Session saved.</p>}

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

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <p className="text-sm font-medium text-gray-900">
          Hole {displayHole} of {total}
        </p>
        <p className="text-xs text-gray-600 mt-1">Enter your start distance, then proximity and strike.</p>
      </div>

      {phase !== "distance" && <CombineFlowBackControl onBack={goBackPhase} />}

      {phase === "distance" && (
        <div className="space-y-3">
          <label htmlFor="bunker-start-m" className="text-sm font-medium text-gray-800 block">
            Start distance (m)
          </label>
          <input
            id="bunker-start-m"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            enterKeyHint="done"
            value={distanceInput}
            onChange={(e) => {
              setDistanceInput(e.target.value);
              if (distanceError) setDistanceError(null);
            }}
            placeholder="e.g. 15"
            className="w-full min-h-[48px] rounded-xl border-2 border-gray-200 bg-white px-4 py-3.5 text-lg font-semibold tabular-nums text-gray-900 focus:border-[#014421] focus:outline-none focus:ring-2 focus:ring-[#014421]/20"
          />
          {distanceError && <p className="text-sm text-red-600">{distanceError}</p>}
          <button
            type="button"
            onClick={onContinueDistance}
            className="w-full py-3 rounded-xl bg-[#014421] text-white font-semibold hover:opacity-90 transition-opacity"
          >
            Continue
          </button>
        </div>
      )}

      {phase === "proximity" && (
        <div className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="bunker-proximity-cm" className="text-sm font-medium text-gray-800">
              Proximity (cm)
            </label>
            <input
              id="bunker-proximity-cm"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              enterKeyHint="done"
              value={proximityInput}
              onChange={(e) => {
                setProximityInput(e.target.value);
                if (chipError) setChipError(null);
              }}
              onFocus={(e) => {
                const el = e.currentTarget;
                if (el.value.length === 0) return;
                requestAnimationFrame(() => el.select());
              }}
              placeholder="e.g. 45"
              className="w-full min-h-[52px] rounded-xl border-2 border-gray-200 bg-white px-4 py-4 text-2xl font-semibold tabular-nums text-gray-900 focus:border-[#014421] focus:outline-none focus:ring-2 focus:ring-[#014421]/20"
            />
            {calculatedChipPts !== null && (
              <p className="text-sm text-gray-800 pt-1">
                Calculated bunker chip points:{" "}
                <span className="font-semibold text-[#014421] tabular-nums">
                  {calculatedChipPts.toFixed(1)} pts
                </span>
              </p>
            )}
            {chipError && <p className="text-sm text-red-600">{chipError}</p>}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-800">Proximity zone (auto from cm)</p>
            {!suggestedZone && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                Enter a valid distance (cm) to highlight your zone.
              </p>
            )}
            <div className="space-y-2">
              {ZONE_OPTIONS.map((o) => {
                const isMatch = suggestedZone !== null && suggestedZone === o.label;
                const isDisabled = suggestedZone !== null && !isMatch;
                return (
                  <button
                    key={o.label}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => {
                      if (isMatch) confirmProximityZone();
                    }}
                    className={`${choiceBtn} ${isMatch ? choiceBtnActive : ""} ${isDisabled ? choiceBtnDisabled : ""}`}
                  >
                    <span className="block">
                      {o.label === "Inside Club Length"
                        ? "Inside Club Length (1–90 cm)"
                        : o.label === "Inside 6ft"
                          ? "Inside 6ft (91–183 cm)"
                          : o.label === "Safety Zone"
                            ? "Safety Zone (184–300 cm)"
                            : o.label === "Missed Zone"
                              ? "Missed Zone (>300 cm)"
                              : o.label}
                    </span>
                    <span className="text-xs font-normal text-gray-500">{o.hint}</span>
                  </button>
                );
              })}
            </div>
            {suggestedZone && (
              <button
                type="button"
                onClick={confirmProximityZone}
                className="w-full py-3 rounded-xl bg-[#014421] text-white font-semibold hover:opacity-90 transition-opacity"
              >
                Confirm zone & continue
              </button>
            )}
          </div>
        </div>
      )}

      {phase === "strike" && lockedZone && lockedCm !== null && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Zone: <span className="font-semibold text-gray-900">{lockedZone}</span> (
            {bunkerPointsFromProximityCm(lockedCm).toFixed(1)} pts)
          </p>
          <p className="text-sm font-medium text-gray-800">Vertical strike</p>
          <div className="grid grid-cols-3 gap-2">
            {(["thin", "solid", "fat"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStrike(s)}
                className={`rounded-xl border-2 px-2 py-2.5 text-sm font-semibold capitalize transition-colors ${
                  strike === s
                    ? "border-[#014421] bg-[#014421]/10 text-[#014421] ring-2 ring-[#014421]/20"
                    : "border-gray-200 bg-white text-gray-800 hover:border-gray-300"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={!strike}
            onClick={onContinueStrike}
            className="w-full py-3 rounded-xl bg-[#014421] text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {lockedZone === "Holed" ? "Log hole" : "Continue to putt"}
          </button>
        </div>
      )}

      {phase === "putt" && lockedZone && lockedCm !== null && strike && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Bunker shot: <span className="font-semibold text-gray-900">{lockedZone}</span> (
            {bunkerPointsFromProximityCm(lockedCm).toFixed(1)} pts) · Strike:{" "}
            <span className="font-semibold capitalize">{strike}</span>
          </p>
          <p className="text-sm font-medium text-gray-800">Putt made?</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onPuttMade} className={`${choiceBtn} text-center`}>
              Yes
              <span className="block text-xs font-normal text-gray-500">
                +{bunker9HoleChallengeConfig.scramblePuttBonus} pts
              </span>
            </button>
            <button type="button" onClick={onPuttMissed} className={`${choiceBtn} text-center`}>
              No
            </button>
          </div>
        </div>
      )}

      {phase === "audit-quadrant" && (
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
                onClick={() => onPickFirstPuttMissQuadrant(key)}
                className="py-2.5 px-3 rounded-lg border-2 border-gray-200 text-sm font-medium text-gray-800 hover:border-[#014421] hover:bg-[#014421]/5 transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {phase === "audit-primary" && pendingMissQuadrant !== null && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Primary reason for the miss
            <span className="block text-xs font-normal text-gray-500 mt-1">
              Quadrant: {PUTTING_TEST_MISS_CATEGORY_LABELS[pendingMissQuadrant]}
            </span>
          </p>
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
    </div>
  );
}
