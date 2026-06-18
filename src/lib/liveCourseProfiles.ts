/** Saved course scorecards for Live Entry (local device). */

export type LiveCourseProfile = {
  id: string;
  name: string;
  /** 18 hole par values (index 0 = hole 1). */
  pars: number[];
  updatedAt: string;
};

const PROFILES_PREFIX = "liveCourseProfiles";
const RECENT_PREFIX = "liveRecentCourses";
const MAX_RECENT = 8;

function profilesKey(userId: string) {
  return `${PROFILES_PREFIX}_${userId}`;
}

function recentKey(userId: string) {
  return `${RECENT_PREFIX}_${userId}`;
}

function slugFromName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function defaultCoursePars(): number[] {
  return Array.from({ length: 18 }, () => 4);
}

export function normalizeCoursePars(raw: unknown): number[] | null {
  if (!Array.isArray(raw) || raw.length !== 18) return null;
  const pars = raw.map((p) => Number(p));
  if (pars.some((p) => !Number.isFinite(p) || p < 3 || p > 6)) return null;
  return pars;
}

export function loadCourseProfiles(userId: string): LiveCourseProfile[] {
  if (typeof window === "undefined" || !userId) return [];
  try {
    const raw = localStorage.getItem(profilesKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LiveCourseProfile[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p) => p?.name && normalizeCoursePars(p.pars))
      .map((p) => ({
        ...p,
        pars: normalizeCoursePars(p.pars)!,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

export function findCourseProfileByName(
  userId: string,
  name: string,
): LiveCourseProfile | null {
  const slug = slugFromName(name);
  return loadCourseProfiles(userId).find((p) => slugFromName(p.name) === slug) ?? null;
}

export function saveCourseProfile(
  userId: string,
  name: string,
  pars: number[],
): LiveCourseProfile {
  const normalized = normalizeCoursePars(pars);
  if (!normalized) {
    throw new Error("Course pars must be 18 values between 3 and 6.");
  }
  const trimmed = name.trim();
  const slug = slugFromName(trimmed);
  const existing = loadCourseProfiles(userId);
  const now = new Date().toISOString();
  const next: LiveCourseProfile = {
    id: slug,
    name: trimmed,
    pars: normalized,
    updatedAt: now,
  };
  const without = existing.filter((p) => slugFromName(p.name) !== slug);
  localStorage.setItem(profilesKey(userId), JSON.stringify([next, ...without]));
  touchRecentCourse(userId, trimmed);
  return next;
}

export function loadRecentCourseNames(userId: string): string[] {
  if (typeof window === "undefined" || !userId) return [];
  try {
    const raw = localStorage.getItem(recentKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed.filter((n) => typeof n === "string" && n.trim()) : [];
  } catch {
    return [];
  }
}

export function touchRecentCourse(userId: string, name: string) {
  if (typeof window === "undefined" || !userId) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  const prev = loadRecentCourseNames(userId).filter(
    (n) => slugFromName(n) !== slugFromName(trimmed),
  );
  localStorage.setItem(
    recentKey(userId),
    JSON.stringify([trimmed, ...prev].slice(0, MAX_RECENT)),
  );
}
