"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, ShieldAlert, Target } from "lucide-react";
import { useCombineUser } from "@/hooks/useCombineUser";
import {
  buildHazardHoles,
  fingerLabel,
  HAZARD_NAME,
  HAZARD_PENALTY,
  HAZARD_SHORT,
  hazardMetres,
  hazardShotPoints,
  inHazard,
  isTeeClub,
  SHOT_FINGER_OPTIONS,
  TEE_CLUB_SHORT,
  TEE_CLUBS,
  TEE_SHOT_HAZARD_MAX_POINTS,
  teeClubFromLabel,
  teeShotHazardConfig as CFG,
  type HazardFingers,
  type HazardSide,
  type ShotDirection,
  type TeeClub,
  type TeeClubCarry,
  type TeeHazardHole,
  type TeeHazardShot,
} from "@/lib/teeShotHazardConfig";
import { formatSupabaseWriteError } from "@/lib/formatSupabaseWriteError";
import { awardCombineCompletionXp } from "@/lib/combineXp";
import { insertPracticeLogCompat } from "@/lib/practiceLogsCompat";
import { CombineFlowBackControl } from "@/components/CombineFlowBackControl";
import {
  BRAND_ORANGE,
  CombineHero,
  IntroSteps,
  PlayAgainButton,
  PrimaryButton,
  ProgressTrack,
  ResultHero,
  SaveStatus,
  ScoreRing,
  ScoringGuide,
  StatTiles,
  type TrackItem,
} from "@/components/combine/PuttingCombineUi";
import { MissSidePicker } from "@/components/combine/IronCombineUi";
import { BreakdownBar, BreakdownCard, EveryShotList, FocusCard, RateRow, ValueRow } from "@/components/combine/CombineBreakdown";
import { HERO_ART_CLASS } from "@/components/combine/CombineArt";

const CLUBS_STORAGE_PREFIX = "teeShotHazardClubs:";
/** Misses within this many fingers (the 7+ point bands) count as a fairway hit. */
const FAIRWAY_FINGERS = 1.5;
const sideWord = (s: HazardSide) => (s === "left" ? "left" : "right");
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

function pointsTone(points: number): string {
  if (points >= 10) return "bg-[#014421] text-white";
  if (points >= 7) return "bg-green-200 text-[#014421]";
  if (points > 0) return "bg-amber-200 text-amber-900";
  if (points === 0) return "bg-gray-300 text-gray-700";
  return "bg-red-500 text-white";
}

function readStoredClubs(userId: string): TeeClubCarry[] | null {
  try {
    const raw = window.localStorage.getItem(CLUBS_STORAGE_PREFIX + userId);
    const list = raw ? (JSON.parse(raw) as unknown) : null;
    if (!Array.isArray(list)) return null;
    const clubs = list.filter(
      (c): c is TeeClubCarry => !!c && isTeeClub((c as TeeClubCarry).club) && Number.isFinite((c as TeeClubCarry).carry),
    );
    return clubs.length ? clubs : null;
  } catch {
    return null;
  }
}

function storeClubs(userId: string, clubs: TeeClubCarry[]) {
  try {
    window.localStorage.setItem(CLUBS_STORAGE_PREFIX + userId, JSON.stringify(clubs));
  } catch {
    /* storage full or blocked */
  }
}

/** Last session's clubs, else tee clubs and carries from the Virtual Caddie bag. */
async function loadTeeClubs(userId: string): Promise<TeeClubCarry[]> {
  const local = readStoredClubs(userId);
  if (local) return local;
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const { data } = await createClient()
      .from("user_clubs")
      .select("club_name, short_label, base_carry_metres")
      .eq("user_id", userId);
    const found = new Map<TeeClub, number>();
    for (const row of (data ?? []) as { club_name: string | null; short_label: string | null; base_carry_metres: number | null }[]) {
      const club = teeClubFromLabel(row.short_label ?? "") ?? teeClubFromLabel(row.club_name ?? "");
      const carry = Number(row.base_carry_metres);
      if (club && Number.isFinite(carry) && carry > 0 && !found.has(club)) found.set(club, Math.round(carry));
    }
    return TEE_CLUBS.filter((c) => found.has(c))
      .slice(0, CFG.clubCount)
      .map((club) => ({ club, carry: found.get(club)! }));
  } catch {
    return [];
  }
}

function parseCarry(raw: string): number | null {
  const n = Number(raw.trim());
  return raw.trim() !== "" && Number.isFinite(n) && n >= CFG.minCarryM && n <= CFG.maxCarryM ? Math.round(n) : null;
}

function missLabel(s: Pick<TeeHazardShot, "direction" | "fingers">): string {
  if (s.direction === "straight") return "On line";
  return `${s.direction === "left" ? "Left" : "Right"} ${fingerLabel(s.fingers)}`;
}

function hazardLabel(h: Pick<TeeHazardHole, "hazard" | "side" | "hazard_fingers">): string {
  return `${HAZARD_SHORT[h.hazard]} ${h.hazard_fingers} ${h.hazard_fingers === 1 ? "finger" : "fingers"} ${sideWord(h.side)}`;
}

const FINGER_X = 11;

/** Bird's-eye hole: fairway up the middle, the hazard starting its finger distance off the target line. */
function HazardHoleDiagram({ hole, className = "" }: { hole: Pick<TeeHazardHole, "hazard" | "side" | "hazard_fingers">; className?: string }) {
  const dir = hole.side === "left" ? -1 : 1;
  const edge = 50 + dir * hole.hazard_fingers * FINGER_X;
  const outer = hole.side === "left" ? 2 : 98;
  const x = Math.min(edge, outer);
  const w = Math.abs(outer - edge);
  return (
    <svg viewBox="0 0 100 120" className={className} aria-hidden>
      <defs>
        <clipPath id="hazard-hole-card">
          <rect x="2" y="2" width="96" height="116" rx="22" />
        </clipPath>
      </defs>
      <rect x="2" y="2" width="96" height="116" rx="22" fill="#14592c" />
      <path d="M38 112 L30 8 L70 8 L62 112 Z" fill="#2f8f4e" />
      {hole.hazard === "ob" ? (
        <g clipPath="url(#hazard-hole-card)">
          <rect x={x} y="2" width={w} height="116" fill="#f87171" fillOpacity={0.85} />
          <line x1={edge} y1="4" x2={edge} y2="116" stroke="white" strokeWidth={2.5} strokeDasharray="3 5" />
        </g>
      ) : (
        <path
          d={`M${edge} 22 Q${edge + dir * 4} 14 ${edge + dir * 16} 18 Q${edge + dir * 22} 34 ${edge + dir * 14} 52 Q${edge + dir * 3} 56 ${edge} 46 Z`}
          fill="#e8d3a0"
          stroke="#c9ad6d"
          strokeWidth={1.5}
          clipPath="url(#hazard-hole-card)"
        />
      )}
      <path d="M50 104 L50 14" fill="none" stroke="white" strokeOpacity={0.9} strokeWidth={3} strokeDasharray="1 6" strokeLinecap="round" />
      <circle cx="50" cy="14" r="4" fill={BRAND_ORANGE} />
      <circle cx="50" cy="104" r="4" fill="white" />
    </svg>
  );
}

function ClubSetup({
  carries,
  onChange,
}: {
  carries: Partial<Record<TeeClub, string>>;
  onChange: (next: Partial<Record<TeeClub, string>>) => void;
}) {
  const picked = TEE_CLUBS.filter((c) => carries[c] !== undefined);
  const full = picked.length >= CFG.clubCount;
  const toggle = (club: TeeClub) => {
    const next = { ...carries };
    if (next[club] !== undefined) delete next[club];
    else if (!full) next[club] = "";
    onChange(next);
  };
  return (
    <div className="space-y-3 rounded-2xl border border-gray-100 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-bold text-gray-900">Your 3 tee clubs</p>
        <span className="text-xs font-semibold text-gray-500">
          {picked.length}/{CFG.clubCount} picked
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {TEE_CLUBS.map((club) => {
          const on = carries[club] !== undefined;
          return (
            <button
              key={club}
              type="button"
              onClick={() => toggle(club)}
              disabled={!on && full}
              aria-pressed={on}
              className={`rounded-xl py-2.5 text-sm font-bold transition-colors disabled:opacity-40 ${
                on ? "bg-[#014421] text-white" : "bg-gray-100 text-gray-800 hover:bg-gray-200"
              }`}
            >
              {club}
            </button>
          );
        })}
      </div>
      {picked.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-600">How far does each one carry off the tee?</p>
          {picked.map((club) => {
            const raw = carries[club] ?? "";
            const bad = raw.trim() !== "" && parseCarry(raw) === null;
            return (
              <label key={club} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-sm font-bold text-gray-900">{club}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Carry"
                  value={raw}
                  onChange={(e) => onChange({ ...carries, [club]: e.target.value })}
                  className={`min-w-0 flex-1 rounded-xl border-2 px-3 py-2 text-sm font-bold tabular-nums focus:outline-none ${
                    bad ? "border-red-300 focus:border-red-500" : "border-gray-200 focus:border-[#014421]"
                  }`}
                />
                <span className="text-xs font-semibold text-gray-400">m</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Positive = away from the hazard, negative = towards it. */
function towardsHazard(s: TeeHazardShot): number {
  if (s.direction === "straight") return 0;
  const f = s.fingers === "outside" ? 4.6 : s.fingers;
  return s.direction === s.side ? -f : f;
}

function breakdown(shots: TeeHazardShot[]) {
  const n = shots.length;
  const max = n * CFG.maxShotPoints;
  const total = shots.reduce((sum, s) => sum + s.points, 0);
  const hazards = shots.filter((s) => s.in_hazard);
  const clean = shots.filter((s) => !s.in_hazard);
  const lostHazard = hazards.reduce((sum, s) => sum + CFG.maxShotPoints - s.points, 0);
  const lostLine = clean.reduce((sum, s) => sum + CFG.maxShotPoints - s.points, 0);
  const penalties = hazards.reduce((sum, s) => sum - s.points, 0);
  const fairways = clean.filter((s) => s.direction === "straight" || (s.fingers !== "outside" && s.fingers <= FAIRWAY_FINGERS)).length;
  const misses = shots.filter((s) => s.direction !== "straight");
  const towards = misses.filter((s) => s.direction === s.side).length;
  const away = misses.length - towards;

  const byKind = (["bunker", "ob"] as const).map((kind) => {
    const all = shots.filter((s) => s.hazard === kind);
    return { kind, total: all.length, avoided: all.filter((s) => !s.in_hazard).length };
  });

  const byClub = TEE_CLUBS.map((club) => {
    const all = shots.filter((s) => s.club === club);
    return {
      club,
      count: all.length,
      avg: all.length ? all.reduce((sum, s) => sum + s.points, 0) / all.length : 0,
      hazards: all.filter((s) => s.in_hazard).length,
    };
  }).filter((c) => c.count > 0);
  const weakest = byClub.length > 1 ? [...byClub].sort((a, b) => a.avg - b.avg)[0]! : null;

  let focus: { title: string; lines: string[] };
  if (lostHazard === 0 && lostLine === 0) {
    focus = { title: "Perfect round", lines: ["Every shot on line and nothing found the trouble."] };
  } else if (lostHazard >= lostLine) {
    const bunkers = hazards.filter((s) => s.hazard === "bunker").length;
    const obs = hazards.length - bunkers;
    focus = {
      title: "Focus next: stay out of trouble",
      lines: [
        `You found the hazard ${hazards.length} time${hazards.length === 1 ? "" : "s"} (${bunkers} bunker, ${obs} OB), costing ${lostHazard} pts including ${penalties} in penalties.`,
        towards > away
          ? `${towards} of your ${misses.length} misses went towards the trouble. Aim down the safe side of the fairway so your miss runs away from it.`
          : "Most misses went away from the trouble, so the hazards came from your big misses. Swing at 80% when the trouble is close.",
      ],
    };
  } else {
    focus = {
      title: "Focus next: start line",
      lines: [
        `Shots off line cost you ${lostLine} pts. You found ${fairways} of ${n} fairways.`,
        weakest && weakest.avg < CFG.maxShotPoints
          ? `Your ${weakest.club} was the weakest at ${weakest.avg.toFixed(1)} pts a shot.`
          : "Pick a tighter target line to sharpen it further.",
      ],
    };
  }

  return { n, max, total, hazards: hazards.length, penalties, lostHazard, lostLine, fairways, towards, away, byKind, byClub, focus };
}

const MAP_RANGE = 5;
const DOT_ROW_PX = 26;
const MIN_DOT_GAP = 1.6;
const pctOf = (x: number) => 50 + (x / MAP_RANGE) * 50;

/** Every shot relative to its hazard, with the trouble always on the left. */
function HazardSideMap({ shots }: { shots: TeeHazardShot[] }) {
  const placed: { x: number; row: number }[] = [];
  const dots = [...shots]
    .sort((a, b) => towardsHazard(a) - towardsHazard(b))
    .map((s) => {
      const x = towardsHazard(s);
      let row = 0;
      while (placed.some((p) => p.row === row && Math.abs(p.x - x) < MIN_DOT_GAP)) row++;
      placed.push({ x, row });
      return { s, x, row };
    });
  const rows = Math.max(1, ...placed.map((p) => p.row + 1));
  return (
    <div>
      <div className="relative overflow-hidden rounded-xl" style={{ height: rows * DOT_ROW_PX + 16 }}>
        <div className="absolute inset-y-0 left-0 w-1/2 bg-red-50" />
        <div className="absolute inset-y-0 bg-green-100" style={{ left: `${pctOf(-FAIRWAY_FINGERS)}%`, width: `${(FAIRWAY_FINGERS / MAP_RANGE) * 100}%` }} />
        <div className="absolute inset-y-0 left-1/2 w-0.5 bg-[#014421]/50" />
        {dots.map(({ s, x, row }) => (
          <span
            key={s.shot}
            className={`absolute flex h-6 min-w-6 -translate-x-1/2 items-center justify-center rounded-full px-1 text-[9px] font-bold shadow-sm ring-2 ring-white ${pointsTone(s.points)}`}
            style={{ left: `${Math.max(3, Math.min(97, pctOf(x)))}%`, bottom: 8 + row * DOT_ROW_PX }}
            title={`${s.club}: ${missLabel(s)}, ${s.points} pts`}
          >
            {TEE_CLUB_SHORT[s.club]}
          </span>
        ))}
      </div>
      <div className="relative mt-1 h-4 text-[10px] font-semibold text-gray-400">
        <span className="absolute left-0 text-red-500">Towards trouble</span>
        <span className="absolute left-1/2 -translate-x-1/2 text-[#014421]">Target</span>
        <span className="absolute right-0">Away</span>
      </div>
    </div>
  );
}

async function persistSession(userId: string, shots: TeeHazardShot[]): Promise<string | null> {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const total = shots.reduce((sum, s) => sum + s.points, 0);
    const res = await insertPracticeLogCompat(supabase, {
      user_id: userId,
      log_type: CFG.practiceLogType,
      score: total,
      total_points: total,
      strike_data: shots.map(({ shot, club, target_m, hazard, side, hazard_fingers, direction, fingers, in_hazard, points }) => ({
        shot,
        club,
        target_m,
        hazard,
        side,
        hazard_fingers,
        direction,
        fingers,
        in_hazard,
        points,
      })),
    });
    if (!res.ok) {
      console.warn("[TeeShotHazard] practice_logs insert:", res.message);
      return res.message;
    }
    await awardCombineCompletionXp(userId);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("practiceSessionsUpdated"));
      window.dispatchEvent(new Event("academyLeaderboardRefresh"));
    }
    return null;
  } catch (e) {
    console.warn("[TeeShotHazard] practice_logs insert failed", formatSupabaseWriteError(e));
    return formatSupabaseWriteError(e);
  }
}

/** The results screen. Coaches see the same report for a saved session. */
export function TeeShotHazardReport({ shots }: { shots: TeeHazardShot[] }) {
  const summary = breakdown(shots);
  return (
    <>
      <ResultHero>
        <ScoreRing pct={Math.max(0, summary.total) / summary.max} value={summary.total} caption={`of ${summary.max} points`} />
        <p className="mt-2 text-xs text-white/70">
          {summary.hazards} hazard{summary.hazards === 1 ? "" : "s"} found · higher is better
        </p>
      </ResultHero>

      <StatTiles
        stats={[
          { label: "Avg per shot", value: (summary.total / summary.n).toFixed(1) },
          { label: "Hazards", value: `${summary.hazards}/${summary.n}`, sub: summary.penalties ? `${-summary.penalties} pts` : null },
          { label: "Fairways", value: `${summary.fairways}/${summary.n}`, sub: `within ${FAIRWAY_FINGERS} fingers` },
        ]}
      />

      <FocusCard title={summary.focus.title} lines={summary.focus.lines} />

      <BreakdownCard title="Where your points went" aside={`${summary.total} of ${summary.max}`}>
        <BreakdownBar
          segments={[
            { label: "Scored", value: Math.max(0, summary.total), tone: "bg-[#014421]" },
            { label: "Lost off line", value: summary.lostLine, tone: "bg-[#FFA500]" },
            { label: "Lost to hazards", value: summary.lostHazard, tone: "bg-red-500" },
          ]}
        />
      </BreakdownCard>

      <BreakdownCard title="Miss pattern" aside={`Towards ${summary.towards} · Away ${summary.away}`}>
        <HazardSideMap shots={shots} />
        <div className="mt-3 space-y-2">
          {summary.byKind
            .filter((k) => k.total > 0)
            .map((k) => (
              <RateRow key={k.kind} label={`Stayed out of the ${k.kind === "ob" ? "OB" : "bunker"}`} made={k.avoided} total={k.total} />
            ))}
        </div>
      </BreakdownCard>

      <BreakdownCard title="By club" aside="Avg pts a shot">
        <div className="space-y-3">
          {summary.byClub.map((c) => (
            <ValueRow
              key={c.club}
              label={`${c.club} · ${c.count} shot${c.count === 1 ? "" : "s"}`}
              value={Math.max(0, c.avg)}
              max={CFG.maxShotPoints}
              display={`${c.avg.toFixed(1)}${c.hazards ? ` · ${c.hazards} in trouble` : ""}`}
            />
          ))}
        </div>
      </BreakdownCard>

      <EveryShotList>
        {shots.map((s) => (
          <li key={s.shot} className="flex items-center gap-3 py-2 text-sm">
            <span className="w-9 shrink-0 rounded-lg bg-gray-100 py-1 text-center text-xs font-bold text-gray-800">{TEE_CLUB_SHORT[s.club]}</span>
            <span className="min-w-0 flex-1 truncate text-gray-600">
              {hazardLabel(s)} · {missLabel(s)}
              {s.in_hazard ? ` · in the ${s.hazard === "ob" ? "OB" : "bunker"}` : ""}
            </span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${pointsTone(s.points)}`}>{signed(s.points)}</span>
          </li>
        ))}
      </EveryShotList>
    </>
  );
}

export function TeeShotHazardRunner() {
  const user = useCombineUser();
  const userId = user?.id ?? null;
  const total = CFG.shotCount;
  const [status, setStatus] = useState<"intro" | "active" | "complete">("intro");
  const [carries, setCarries] = useState<Partial<Record<TeeClub, string>>>({});
  const [loadedFor, setLoadedFor] = useState<string | null | undefined>(undefined);
  const [holes, setHoles] = useState<TeeHazardHole[]>([]);
  const [direction, setDirection] = useState<ShotDirection>("straight");
  const [fingers, setFingers] = useState<HazardFingers | null>(0);
  const [shots, setShots] = useState<TeeHazardShot[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const persistAttemptedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const clubs = userId ? await loadTeeClubs(userId) : [];
      if (cancelled) return;
      setCarries(Object.fromEntries(clubs.map((c) => [c.club, String(c.carry)])));
      setLoadedFor(userId);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const clubsReady = loadedFor === userId;
  const picks: TeeClubCarry[] = TEE_CLUBS.flatMap((club) => {
    const carry = carries[club] === undefined ? null : parseCarry(carries[club]!);
    return carry === null ? [] : [{ club, carry }];
  });
  const canStart = clubsReady && picks.length === CFG.clubCount && TEE_CLUBS.filter((c) => carries[c] !== undefined).length === CFG.clubCount;

  const startTest = useCallback(() => {
    if (picks.length !== CFG.clubCount) return;
    if (userId) storeClubs(userId, picks);
    setHoles(buildHazardHoles(picks, total));
    setShots([]);
    setDirection("straight");
    setFingers(0);
    setSaveError(null);
    setSaved(false);
    setStatus("active");
    persistAttemptedRef.current = false;
  }, [picks, userId, total]);

  const save = useCallback(
    async (all: TeeHazardShot[]) => {
      if (!userId) {
        setSaveError("Sign in to save this session.");
        return;
      }
      persistAttemptedRef.current = true;
      setSaveError(null);
      const err = await persistSession(userId, all);
      setSaved(err == null);
      if (err) {
        setSaveError(err);
        persistAttemptedRef.current = false;
      }
    },
    [userId],
  );

  const shotIndex = shots.length;
  const hole = holes[shotIndex];
  const effFingers: HazardFingers | null = direction === "straight" ? 0 : fingers;
  const livePoints = hole && effFingers !== null ? hazardShotPoints(hole, direction, effFingers) : null;
  const liveInHazard = !!hole && effFingers !== null && inHazard(hole, direction, effFingers);

  const recordShot = useCallback(async () => {
    if (status !== "active" || !hole || effFingers === null) return;
    const next: TeeHazardShot[] = [
      ...shots,
      {
        ...hole,
        shot: shotIndex + 1,
        direction,
        fingers: effFingers,
        in_hazard: inHazard(hole, direction, effFingers),
        points: hazardShotPoints(hole, direction, effFingers),
      },
    ];
    setShots(next);
    setDirection("straight");
    setFingers(0);
    if (next.length >= total) {
      setStatus("complete");
      if (!persistAttemptedRef.current) await save(next);
    }
  }, [status, hole, effFingers, shots, shotIndex, direction, total, save]);

  const undoLastShot = useCallback(() => {
    if (status !== "active" || shots.length === 0) return;
    const last = shots[shots.length - 1]!;
    setShots((s) => s.slice(0, -1));
    setDirection(last.direction);
    setFingers(last.direction === "straight" ? 0 : last.fingers);
  }, [status, shots]);

  const summary = useMemo(() => (status === "complete" ? breakdown(shots) : null), [status, shots]);

  if (status === "intro") {
    return (
      <div className="space-y-4">
        <CombineHero
          title={CFG.testName}
          kicker="Driving combine"
          art={<HazardHoleDiagram hole={{ hazard: "ob", side: "right", hazard_fingers: 2 }} className={HERO_ART_CLASS} />}
          chips={[`${total} shots`, "3 tee clubs", "~20 min", "Highest score wins"]}
        />
        {clubsReady ? (
          <ClubSetup carries={carries} onChange={setCarries} />
        ) : (
          <div className="h-40 animate-pulse rounded-2xl bg-gray-100" aria-label="Loading your clubs" />
        )}
        <IntroSteps
          steps={[
            { icon: <Target className="h-5 w-5" aria-hidden />, title: "Each shot gets a club and a target", hint: "Pick a target on the range at that distance" },
            { icon: <ShieldAlert className="h-5 w-5" aria-hidden />, title: "A bunker or OB sits to one side", hint: "Its edge is a set number of fingers off your line" },
            { icon: <Crosshair className="h-5 w-5" aria-hidden />, title: "Measure the miss in fingers", hint: "Hand at arm's length, count across from your target" },
          ]}
        />
        <ScoringGuide title="How points work">
          <ul className="space-y-1.5">
            <li>On line or within half a finger: 10 pts</li>
            <li>1 to 1.5 fingers: 7 pts · 2 to 2.5 fingers: 4 pts · 3 to 4 fingers: 1 pt · wider: 0</li>
            <li className="text-red-700">
              Past the hazard line on its side: bunker {HAZARD_PENALTY.bunker}, out of bounds {HAZARD_PENALTY.ob}
            </li>
            <li>Missing the other way never finds the hazard, it just scores by fingers.</li>
            <li className="font-semibold text-gray-900">Best possible is {TEE_SHOT_HAZARD_MAX_POINTS} points. Higher is better.</li>
          </ul>
        </ScoringGuide>
        <PrimaryButton onClick={startTest} disabled={!canStart}>
          {canStart ? "Start the test" : "Pick 3 clubs and their carries"}
        </PrimaryButton>
      </div>
    );
  }

  if (status === "complete" && summary) {
    return (
      <div className="space-y-4">
        <TeeShotHazardReport shots={shots} />
        <SaveStatus saved={saved} error={saveError} onRetry={userId ? () => void save(shots) : undefined} />
        <PlayAgainButton onClick={startTest} />
      </div>
    );
  }

  if (!hole) return null;

  const shotNumber = shotIndex + 1;
  const runningTotal = shots.reduce((sum, s) => sum + s.points, 0);
  const track: TrackItem[] = Array.from({ length: total }, (_, i) => {
    const s = shots[i];
    return s ? { label: signed(s.points), tone: pointsTone(s.points), ariaLabel: `Shot ${i + 1} (${s.club}): ${s.points} points` } : null;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-[#014421] px-3 py-1 text-xs font-bold tabular-nums text-white">{runningTotal} pts</span>
        <span className="text-xs font-semibold text-gray-500">Higher is better</span>
      </div>

      <ProgressTrack items={track} current={shotIndex} name="Shot" />

      <div className="flex items-stretch gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <HazardHoleDiagram hole={hole} className="h-32 w-[6.5rem] shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Shot {shotNumber} of {total}
          </p>
          <p className="text-4xl font-extrabold leading-none text-gray-900">{hole.club}</p>
          <p className="mt-1 text-sm font-semibold text-gray-700">Target {hole.target_m} m</p>
          <p className={`mt-1.5 text-sm font-bold ${hole.hazard === "ob" ? "text-red-600" : "text-amber-700"}`}>
            {HAZARD_NAME[hole.hazard]} {hole.hazard_fingers} fingers {sideWord(hole.side)}
          </p>
          <p className="text-xs text-gray-500">
            About {hazardMetres(hole)} m {sideWord(hole.side)} of your line · {HAZARD_PENALTY[hole.hazard]} if you find it
          </p>
        </div>
      </div>

      {shots.length > 0 && <CombineFlowBackControl onBack={undoLastShot} label="Undo last shot" />}

      <div className="space-y-2">
        <p className="text-base font-bold text-gray-900">Where did it finish?</p>
        <MissSidePicker
          value={direction}
          onChange={(d) => {
            setDirection(d);
            setFingers(d === "straight" ? 0 : null);
          }}
        />
      </div>

      {direction !== "straight" && (
        <div className="space-y-2">
          <p className="text-base font-bold text-gray-900">How many fingers off your target line?</p>
          <div className="grid grid-cols-5 gap-1.5">
            {SHOT_FINGER_OPTIONS.map((f) => {
              const active = fingers === f;
              const trouble = inHazard(hole, direction, f);
              return (
                <button
                  key={String(f)}
                  type="button"
                  onClick={() => setFingers(f)}
                  aria-pressed={active}
                  className={`rounded-xl py-2.5 text-sm font-bold tabular-nums transition-colors ${
                    active
                      ? trouble
                        ? "bg-red-500 text-white"
                        : "bg-[#014421] text-white"
                      : trouble
                        ? "bg-red-50 text-red-700 hover:bg-red-100"
                        : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                  }`}
                >
                  {fingerLabel(f)}
                </button>
              );
            })}
          </div>
          {direction === hole.side && (
            <p className="text-xs font-medium text-red-600">
              Red is past the {hole.hazard === "ob" ? "OB line" : "bunker edge"}.
            </p>
          )}
        </div>
      )}

      {liveInHazard && (
        <div className="rounded-2xl bg-red-500 px-4 py-3 text-white">
          <p className="text-sm font-extrabold">{hole.hazard === "ob" ? "Out of bounds" : "In the bunker"}</p>
          <p className="text-xs text-white/80">{HAZARD_PENALTY[hole.hazard]} points for this shot</p>
        </div>
      )}

      <PrimaryButton onClick={() => void recordShot()} disabled={livePoints === null}>
        {shotNumber >= total ? "Finish the test" : "Next shot"}
        <span className="block text-xs font-semibold text-white/70">
          {livePoints === null ? "Pick how many fingers" : livePoints < 0 ? `Penalty: ${livePoints}` : `This shot scores ${livePoints}`}
        </span>
      </PrimaryButton>
    </div>
  );
}
