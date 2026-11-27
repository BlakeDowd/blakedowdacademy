import {
  buildAcademyCombinesLeaderboard,
  COMBINE_LEADERBOARD_OPTIONS,
  type AcademyCombineLeaderboardRow,
  type CombineLeaderboardTestId,
} from "@/lib/academyCombinesLeaderboard";
import { CARD_HANDICAP_TEST_IDS, COMBINE_TEST_CARDS } from "@/lib/combineTestsCatalog";

/** Curated monthly rotation — skill boards that collect well from practice / practice_logs. */
const MONTHLY_ROTATION: CombineLeaderboardTestId[] = [
  "chipping_combine_9",
  "wedge_lateral_9",
  "flop_shot",
  "ironPrecisionProtocol",
  "bunker_9_hole_challenge",
  "approach_shot_sim",
  "tee_shot_dispersion_combine",
  "low_chip",
  "bunker_protocol",
  "iron_face_control",
  "tee_shot_hazard",
  "driver_flight_control",
];

export type MonthlyCombineRaceFeature = {
  testId: CombineLeaderboardTestId;
  label: string;
  href: string;
  scoreHeader: string;
  monthLabel: string;
  /** Inclusive calendar month window. */
  monthStart: Date;
  monthEnd: Date;
  daysLeftInMonth: number;
};

export type MonthlyRaceGap = {
  /** Positive when someone is ahead of you (higherIsBetter board). */
  delta: number;
  label: string;
  rivalName: string;
  rivalScore: string;
};

export type MonthlyCombineRaceBoard = {
  feature: MonthlyCombineRaceFeature;
  rows: AcademyCombineLeaderboardRow[];
  myRow: AcademyCombineLeaderboardRow | null;
  myRank: number | null;
  gap: MonthlyRaceGap | null;
  totalPlayers: number;
};

function hrefForTestId(testId: CombineLeaderboardTestId): string {
  for (const [cardId, id] of Object.entries(CARD_HANDICAP_TEST_IDS)) {
    if (id === testId) {
      const card = COMBINE_TEST_CARDS.find((c) => c.id === cardId);
      if (card?.href) return card.href;
    }
  }
  // Fallbacks for ids without a card map entry.
  if (testId === "ironPrecisionProtocol") return "/practice/iron-precision-protocol";
  return "/practice";
}

/** Calendar month index 0–11 → featured combine for that month (stable year-over-year). */
export function featuredCombineForMonth(year: number, monthIndex: number): MonthlyCombineRaceFeature {
  const idx = ((year * 12 + monthIndex) % MONTHLY_ROTATION.length + MONTHLY_ROTATION.length) % MONTHLY_ROTATION.length;
  const testId = MONTHLY_ROTATION[idx]!;
  const opt = COMBINE_LEADERBOARD_OPTIONS.find((o) => o.id === testId);
  const monthStart = new Date(year, monthIndex, 1);
  const monthEnd = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
  const now = new Date();
  const daysLeft =
    now.getFullYear() === year && now.getMonth() === monthIndex
      ? Math.max(0, Math.ceil((monthEnd.getTime() - now.getTime()) / 86_400_000))
      : 0;
  const monthLabel = monthStart.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  return {
    testId,
    label: opt?.label ?? testId,
    href: hrefForTestId(testId),
    scoreHeader: opt?.scoreHeader ?? "Score",
    monthLabel,
    monthStart,
    monthEnd,
    daysLeftInMonth: daysLeft,
  };
}

export function currentMonthlyCombineFeature(now = new Date()): MonthlyCombineRaceFeature {
  return featuredCombineForMonth(now.getFullYear(), now.getMonth());
}

function gapToNext(
  rows: AcademyCombineLeaderboardRow[],
  myRank: number,
  higherIsBetter: boolean,
): MonthlyRaceGap | null {
  if (myRank <= 0) return null;
  const me = rows[myRank]!;
  const rival = rows[myRank - 1]!;
  const raw = higherIsBetter ? rival.sortValue - me.sortValue : me.sortValue - rival.sortValue;
  const abs = Math.abs(raw);
  const rounded = abs >= 10 ? Math.round(abs) : Math.round(abs * 10) / 10;
  const unitHint = rival.scoreDisplay.includes("%")
    ? "%"
    : rival.scoreDisplay.toLowerCase().includes("pt")
      ? " pts"
      : "";
  return {
    delta: raw,
    rivalName: rival.isCurrentUser ? "You" : rival.name.split(" ")[0] || rival.name,
    rivalScore: rival.scoreDisplay,
    label:
      raw <= 0.05
        ? `Tied with ${rival.name.split(" ")[0] || "rival"} — one more attempt can take #${myRank}`
        : `${rounded}${unitHint} behind ${rival.name.split(" ")[0] || "rival"} for #${myRank}`,
  };
}

/** Build this month's race board from already-loaded practice sessions / logs. */
export function buildMonthlyCombineRaceBoard(
  practiceSessions: unknown[] | undefined,
  practiceLogs: unknown[] | undefined,
  userProfiles: Map<string, { full_name?: string; preferred_icon_id?: string; xp?: number }>,
  currentUserId: string | undefined,
  now = new Date(),
): MonthlyCombineRaceBoard {
  const feature = currentMonthlyCombineFeature(now);
  const opt = COMBINE_LEADERBOARD_OPTIONS.find((o) => o.id === feature.testId);
  const higherIsBetter = opt?.higherIsBetter ?? true;
  const rows = buildAcademyCombinesLeaderboard(
    feature.testId,
    practiceSessions as any[] | undefined,
    practiceLogs as any[] | undefined,
    userProfiles,
    "month",
    currentUserId,
  );
  const myIndex = currentUserId ? rows.findIndex((r) => r.userId === currentUserId) : -1;
  const myRow = myIndex >= 0 ? rows[myIndex]! : null;
  const myRank = myIndex >= 0 ? myIndex : null;
  const gap =
    myRank != null && myRank > 0 ? gapToNext(rows, myRank, higherIsBetter) : null;

  return {
    feature,
    rows,
    myRow,
    myRank: myRank != null ? myRank + 1 : null,
    gap:
      myRank === 0
        ? {
            delta: 0,
            rivalName: "",
            rivalScore: "",
            label: rows.length > 1 ? "You're #1 this month — keep the lead" : "First on the board this month",
          }
        : gap,
    totalPlayers: rows.length,
  };
}

/** Fetch community-wide practice + logs for the featured monthly race. */
export async function fetchMonthlyCombineRace(
  currentUserId: string | undefined,
): Promise<MonthlyCombineRaceBoard | null> {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const feature = currentMonthlyCombineFeature();
    const fromIso = feature.monthStart.toISOString();

    const [{ data: sessions }, { data: logs }, { data: profiles }] = await Promise.all([
      supabase
        .from("practice")
        .select("id,user_id,test_type,type,notes,metadata,created_at,completed_at,total_points")
        .gte("created_at", fromIso)
        .order("created_at", { ascending: false })
        .limit(4000),
      supabase
        .from("practice_logs")
        .select(
          "id,user_id,log_type,sub_type,score,total_points,matrix_score_average,strike_data,metadata,notes,created_at",
        )
        .gte("created_at", fromIso)
        .order("created_at", { ascending: false })
        .limit(4000),
      supabase.from("profiles").select("id,full_name,preferred_icon_id,xp").limit(2000),
    ]);

    const map = new Map<string, { full_name?: string; preferred_icon_id?: string; xp?: number }>();
    for (const p of profiles ?? []) {
      if (typeof p.id === "string") {
        map.set(p.id, {
          full_name: typeof p.full_name === "string" ? p.full_name : undefined,
          preferred_icon_id: typeof p.preferred_icon_id === "string" ? p.preferred_icon_id : undefined,
          xp: typeof p.xp === "number" ? p.xp : undefined,
        });
      }
    }

    return buildMonthlyCombineRaceBoard(sessions ?? [], logs ?? [], map, currentUserId);
  } catch (e) {
    console.warn("[monthlyCombineRace]", e);
    return null;
  }
}
