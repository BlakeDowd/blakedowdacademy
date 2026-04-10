/**
 * Putting tests — parse practice rows and score full sessions (Academy leaderboard + trophies).
 */

import { puttingTest9Config } from "@/lib/puttingTest9Config";
import { puttingTest3To6ftConfig } from "@/lib/puttingTest3To6ftConfig";
import { puttingTest8To20Config } from "@/lib/puttingTest8To20Config";
import { puttingTest20To40Config } from "@/lib/puttingTest20To40Config";

export type ParsedPuttingHole = {
  createdMs: number;
  holeIndex: number;
  points: number;
};

export function parsePuttingHoleSession(session: any): ParsedPuttingHole | null {
  try {
    const notes = session.notes;
    if (!notes || typeof notes !== "string") return null;
    const parsed = JSON.parse(notes);
    if (parsed?.kind !== "putting_test_hole") return null;
    if (
      typeof parsed.points !== "number" ||
      typeof parsed.holeIndex !== "number"
    ) {
      return null;
    }
    const raw = session.created_at;
    if (!raw) return null;
    const createdMs = new Date(raw).getTime();
    if (!Number.isFinite(createdMs)) return null;
    return {
      createdMs,
      holeIndex: parsed.holeIndex,
      points: parsed.points,
    };
  } catch {
    return null;
  }
}

export function clusterPuttingCombineSessions(
  holes: ParsedPuttingHole[],
): ParsedPuttingHole[][] {
  const sorted = [...holes].sort(
    (a, b) => a.createdMs - b.createdMs || a.holeIndex - b.holeIndex,
  );
  const sessions: ParsedPuttingHole[][] = [];
  let cur: ParsedPuttingHole[] = [];
  for (const h of sorted) {
    if (h.holeIndex === 0 && cur.length > 0) {
      sessions.push(cur);
      cur = [h];
    } else {
      cur.push(h);
    }
  }
  if (cur.length) sessions.push(cur);
  return sessions;
}

export function isCompletePuttingCombineSession(
  holes: ParsedPuttingHole[],
): boolean {
  if (holes.length !== 18) return false;
  const idx = holes.map((h) => h.holeIndex).sort((a, b) => a - b);
  for (let i = 0; i < 18; i++) {
    if (idx[i] !== i) return false;
  }
  return true;
}

export function bestPuttingCombineScoreForUser(
  holes: ParsedPuttingHole[],
): number {
  let best = 0;
  for (const session of clusterPuttingCombineSessions(holes)) {
    if (!isCompletePuttingCombineSession(session)) continue;
    const total = session.reduce((s, h) => s + h.points, 0);
    if (total > best) best = total;
  }
  return best;
}

export function parsePutting9HoleSession(session: any): ParsedPuttingHole | null {
  try {
    const notes = session.notes;
    if (!notes || typeof notes !== "string") return null;
    const parsed = JSON.parse(notes);
    if (parsed?.kind !== puttingTest9Config.noteKind) return null;
    if (
      typeof parsed.points !== "number" ||
      typeof parsed.holeIndex !== "number"
    ) {
      return null;
    }
    const raw = session.created_at;
    if (!raw) return null;
    const createdMs = new Date(raw).getTime();
    if (!Number.isFinite(createdMs)) return null;
    return {
      createdMs,
      holeIndex: parsed.holeIndex,
      points: parsed.points,
    };
  } catch {
    return null;
  }
}

export function isCompletePutting9Session(holes: ParsedPuttingHole[]): boolean {
  if (holes.length !== puttingTest9Config.holeCount) return false;
  const idx = holes.map((h) => h.holeIndex).sort((a, b) => a - b);
  for (let i = 0; i < puttingTest9Config.holeCount; i++) {
    if (idx[i] !== i) return false;
  }
  return true;
}

export function bestPutting9HolesScoreForUser(
  holes: ParsedPuttingHole[],
): number {
  let best = 0;
  for (const session of clusterPuttingCombineSessions(holes)) {
    if (!isCompletePutting9Session(session)) continue;
    const total = session.reduce((s, h) => s + h.points, 0);
    if (total > best) best = total;
  }
  return best;
}

export function parsePuttingTest3To6ftSession(session: any): ParsedPuttingHole | null {
  try {
    const notes = session.notes;
    if (!notes || typeof notes !== "string") return null;
    const parsed = JSON.parse(notes);
    if (parsed?.kind !== puttingTest3To6ftConfig.noteKind) return null;
    if (
      typeof parsed.points !== "number" ||
      typeof parsed.holeIndex !== "number"
    ) {
      return null;
    }
    const raw = session.created_at;
    if (!raw) return null;
    const createdMs = new Date(raw).getTime();
    if (!Number.isFinite(createdMs)) return null;
    return {
      createdMs,
      holeIndex: parsed.holeIndex,
      points: parsed.points,
    };
  } catch {
    return null;
  }
}

export function isCompletePuttingTest3To6ftSession(holes: ParsedPuttingHole[]): boolean {
  if (holes.length !== puttingTest3To6ftConfig.holeCount) return false;
  const idx = holes.map((h) => h.holeIndex).sort((a, b) => a - b);
  for (let i = 0; i < puttingTest3To6ftConfig.holeCount; i++) {
    if (idx[i] !== i) return false;
  }
  return true;
}

export function bestPuttingTest3To6ftScoreForUser(holes: ParsedPuttingHole[]): number {
  let best = 0;
  for (const session of clusterPuttingCombineSessions(holes)) {
    if (!isCompletePuttingTest3To6ftSession(session)) continue;
    const total = session.reduce((s, h) => s + h.points, 0);
    if (total > best) best = total;
  }
  return best;
}

export function parsePuttingTest8To20Session(session: any): ParsedPuttingHole | null {
  try {
    const notes = session.notes;
    if (!notes || typeof notes !== "string") return null;
    const parsed = JSON.parse(notes);
    if (parsed?.kind !== puttingTest8To20Config.noteKind) return null;
    if (
      typeof parsed.points !== "number" ||
      typeof parsed.holeIndex !== "number"
    ) {
      return null;
    }
    const raw = session.created_at;
    if (!raw) return null;
    const createdMs = new Date(raw).getTime();
    if (!Number.isFinite(createdMs)) return null;
    return {
      createdMs,
      holeIndex: parsed.holeIndex,
      points: parsed.points,
    };
  } catch {
    return null;
  }
}

export function isCompletePuttingTest8To20Session(holes: ParsedPuttingHole[]): boolean {
  if (holes.length !== puttingTest8To20Config.holeCount) return false;
  const idx = holes.map((h) => h.holeIndex).sort((a, b) => a - b);
  for (let i = 0; i < puttingTest8To20Config.holeCount; i++) {
    if (idx[i] !== i) return false;
  }
  return true;
}

export function bestPuttingTest8To20ScoreForUser(holes: ParsedPuttingHole[]): number {
  let best = 0;
  for (const session of clusterPuttingCombineSessions(holes)) {
    if (!isCompletePuttingTest8To20Session(session)) continue;
    const total = session.reduce((s, h) => s + h.points, 0);
    if (total > best) best = total;
  }
  return best;
}

export function parsePuttingTest20To40Session(session: any): ParsedPuttingHole | null {
  try {
    const notes = session.notes;
    if (!notes || typeof notes !== "string") return null;
    const parsed = JSON.parse(notes);
    if (parsed?.kind !== puttingTest20To40Config.noteKind) return null;
    if (
      typeof parsed.points !== "number" ||
      typeof parsed.holeIndex !== "number"
    ) {
      return null;
    }
    const raw = session.created_at;
    if (!raw) return null;
    const createdMs = new Date(raw).getTime();
    if (!Number.isFinite(createdMs)) return null;
    return {
      createdMs,
      holeIndex: parsed.holeIndex,
      points: parsed.points,
    };
  } catch {
    return null;
  }
}

export function isCompletePuttingTest20To40Session(holes: ParsedPuttingHole[]): boolean {
  if (holes.length !== puttingTest20To40Config.holeCount) return false;
  const idx = holes.map((h) => h.holeIndex).sort((a, b) => a - b);
  for (let i = 0; i < puttingTest20To40Config.holeCount; i++) {
    if (idx[i] !== i) return false;
  }
  return true;
}

export function bestPuttingTest20To40ScoreForUser(holes: ParsedPuttingHole[]): number {
  let best = 0;
  for (const session of clusterPuttingCombineSessions(holes)) {
    if (!isCompletePuttingTest20To40Session(session)) continue;
    const total = session.reduce((s, h) => s + h.points, 0);
    if (total > best) best = total;
  }
  return best;
}

/** Best all-time session score per user_id from `practice` rows (type putting-test). */
export function puttingTestBestScoresByUser(
  practiceSessions: any[] | undefined,
): Map<string, number> {
  const rows = (practiceSessions || []).filter((session: any) => {
    const t = String(session.type || "").toLowerCase();
    return t === "putting-test";
  });

  const holesByUser = new Map<string, ParsedPuttingHole[]>();
  rows.forEach((session: any) => {
    const uid = session.user_id;
    if (!uid) return;
    const parsed = parsePuttingHoleSession(session);
    if (!parsed) return;
    if (!holesByUser.has(uid)) holesByUser.set(uid, []);
    holesByUser.get(uid)!.push(parsed);
  });

  const scores = new Map<string, number>();
  holesByUser.forEach((holes, userId) => {
    const best = bestPuttingCombineScoreForUser(holes);
    if (best > 0) scores.set(userId, best);
  });
  return scores;
}

/**
 * True if this user shares the highest all-time Putting Test session score (ties count as champion).
 */
export function userIsPuttingTestLeader(
  userId: string,
  practiceSessions: any[] | undefined,
): boolean {
  const scores = puttingTestBestScoresByUser(practiceSessions);
  const mine = scores.get(userId);
  if (mine == null || mine <= 0) return false;
  let max = 0;
  scores.forEach((s) => {
    if (s > max) max = s;
  });
  return mine === max;
}
