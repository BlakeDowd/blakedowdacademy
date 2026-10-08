/** Clubs a player can choose for the Iron Precision Protocol, ordered short → long by typical loft. */
export type IronTestClub = { key: string; group: "Irons" | "Hybrids" | "Woods" };

export const IRON_TEST_CLUBS: IronTestClub[] = [
  { key: "PW", group: "Irons" },
  { key: "9i", group: "Irons" },
  { key: "8i", group: "Irons" },
  { key: "7i", group: "Irons" },
  { key: "6i", group: "Irons" },
  { key: "6H", group: "Hybrids" },
  { key: "5i", group: "Irons" },
  { key: "5H", group: "Hybrids" },
  { key: "9W", group: "Woods" },
  { key: "4i", group: "Irons" },
  { key: "4H", group: "Hybrids" },
  { key: "7W", group: "Woods" },
  { key: "3i", group: "Irons" },
  { key: "3H", group: "Hybrids" },
  { key: "5W", group: "Woods" },
  { key: "2i", group: "Irons" },
  { key: "2H", group: "Hybrids" },
];

export const IRON_TEST_SHOTS = 9;
/** With at least 5 clubs, filling 9 shots never needs a club more than twice. */
export const IRON_TEST_MIN_CLUBS = 5;
export const IRON_TEST_MAX_CLUBS = IRON_TEST_SHOTS;

export const IRON_TEST_DEFAULT_CLUBS = ["PW", "9i", "8i", "7i", "6i", "5i", "4i"];

const LOFT_ORDER = new Map(IRON_TEST_CLUBS.map((c, i) => [c.key, i]));

export function sortClubsByLoft(keys: string[]): string[] {
  return [...new Set(keys)]
    .filter((k) => LOFT_ORDER.has(k))
    .sort((a, b) => LOFT_ORDER.get(a)! - LOFT_ORDER.get(b)!);
}

/**
 * One club per shot, short → long. When fewer clubs than shots are chosen, random clubs from the
 * selection get a second shot (a third only if fewer than 5 were chosen), placed next to their first.
 */
export function buildClubSequence(selected: string[], shots = IRON_TEST_SHOTS, random = Math.random): string[] {
  const clubs = sortClubsByLoft(selected);
  if (clubs.length === 0) return [];
  if (clubs.length >= shots) return clubs.slice(0, shots);

  const counts = new Map(clubs.map((c) => [c, 1]));
  let remaining = shots - clubs.length;
  while (remaining > 0) {
    const pool = [...clubs];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    for (const c of pool.slice(0, remaining)) counts.set(c, counts.get(c)! + 1);
    remaining -= Math.min(remaining, pool.length);
  }
  return clubs.flatMap((c) => Array.from({ length: counts.get(c)! }, () => c));
}

/** Maps a Virtual Caddie bag club ("7-Iron", "4H", "Pitching Wedge") to a test club key, if any. */
export function testClubFromBagLabel(label: string): string | null {
  const t = label.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (!t) return null;
  if (t === "pw" || t === "pitchingwedge" || t === "pitching") return "PW";
  const m = t.match(/^(\d)(i|iron|h|hy|hyb|hybrid|w|wood)$/);
  if (!m) return null;
  const kind = m[2]!.startsWith("i") ? "i" : m[2]!.startsWith("h") ? "H" : "W";
  const key = `${m[1]}${kind}`;
  return LOFT_ORDER.has(key) ? key : null;
}

export function clubsFromBag(labels: string[]): string[] {
  return sortClubsByLoft(labels.map(testClubFromBagLabel).filter((k): k is string => k != null)).slice(
    0,
    IRON_TEST_MAX_CLUBS,
  );
}

export function parseSavedClubs(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const clubs = sortClubsByLoft(raw.filter((v): v is string => typeof v === "string"));
  return clubs.length >= IRON_TEST_MIN_CLUBS ? clubs.slice(0, IRON_TEST_MAX_CLUBS) : null;
}
