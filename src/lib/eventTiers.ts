import { createClient } from "@/lib/supabase/client";

export type EventTier = "club_comp" | "regional" | "state" | "national";

/** Round tiers. `weight` is how much a round counts in the competitive score; social rounds don't count. */
export const EVENT_TIERS: { id: EventTier; label: string; short: string; weight: number; about: string }[] = [
  {
    id: "club_comp",
    label: "Club comp (Stonecutters)",
    short: "Club",
    weight: 1,
    about: "Official competition at your club: monthly medal, Saturday comp, club championship.",
  },
  {
    id: "regional",
    label: "Regional / district",
    short: "Regional",
    weight: 1.15,
    about: "District or regional junior events and open days at other clubs.",
  },
  {
    id: "state",
    label: "State / JNJG",
    short: "State",
    weight: 1.3,
    about: "Jack Newton Junior Golf (JNJG) events, state junior championships and state ranking events.",
  },
  {
    id: "national",
    label: "National / international",
    short: "National",
    weight: 1.5,
    about: "National championships, national ranking events and overseas tournaments.",
  },
];

export const SOCIAL_ROUND_ABOUT = "Practice rounds and casual games with mates.";

export const eventTier = (id: unknown) => EVENT_TIERS.find((t) => t.id === id) ?? null;

/** Rounds and practice count less as they age, and not at all after 180 days. */
export function recencyWeight(atMs: number, now = Date.now()): number {
  const days = (now - atMs) / 86_400_000;
  if (!Number.isFinite(days) || days < 0) return days < 0 ? 1 : 0;
  if (days <= 30) return 1;
  if (days <= 90) return 0.7;
  if (days <= 180) return 0.4;
  return 0;
}

export const RECENCY_WINDOW_DAYS = 180;

/** WHS-style score differential: (113 / slope) × (score − course rating). */
export function scoreDifferential(score: number, courseRating: number, slope: number): number {
  return (113 / slope) * (score - courseRating);
}

export async function saveRoundEvent(
  roundId: string,
  fields: { tier: EventTier | null; eventName: string; courseRating: number | null; slope: number | null },
): Promise<string | null> {
  const { error } = await createClient().rpc("set_round_event", {
    p_round: roundId,
    p_tier: fields.tier,
    p_event_name: fields.eventName,
    p_course_rating: fields.courseRating,
    p_slope_rating: fields.slope,
  });
  if (!error) return null;
  if (/set_round_event|function .* does not exist|schema cache/i.test(error.message)) {
    return "Run supabase/migrations/20261013160000_round_event_tiers.sql in Supabase first.";
  }
  return error.message;
}
