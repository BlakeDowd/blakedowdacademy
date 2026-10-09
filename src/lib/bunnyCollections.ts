/** Which Bunny Stream collection each kind of coaching upload is filed into. */
export type CoachingVideoKind = "lesson" | "game_plan" | "player" | "announcement";

export const COACHING_VIDEO_KINDS: readonly CoachingVideoKind[] = ["lesson", "game_plan", "player", "announcement"];

/** Collection ids from the Bunny dashboard. Env vars override; kinds without an id stay in the library root. */
const DEFAULT_COLLECTIONS: Record<CoachingVideoKind, string | null> = {
  lesson: "ad1f8bb1-e079-4838-bbfd-2a96b165efe1",
  game_plan: "1b3da86a-f690-46b0-b22d-b62314a40d1b",
  player: "ad1f8bb1-e079-4838-bbfd-2a96b165efe1",
  announcement: null,
};

const ENV_NAMES: Record<CoachingVideoKind, string> = {
  lesson: "BUNNY_COLLECTION_LESSON_SWINGS",
  game_plan: "BUNNY_COLLECTION_GAME_PLANS",
  player: "BUNNY_COLLECTION_PLAYER_UPLOADS",
  announcement: "BUNNY_COLLECTION_ANNOUNCEMENTS",
};

export function isCoachingVideoKind(value: unknown): value is CoachingVideoKind {
  return typeof value === "string" && (COACHING_VIDEO_KINDS as readonly string[]).includes(value);
}

export function bunnyCollectionFor(kind: CoachingVideoKind | null | undefined): string | null {
  if (!kind) return null;
  return process.env[ENV_NAMES[kind]]?.trim() || DEFAULT_COLLECTIONS[kind];
}
