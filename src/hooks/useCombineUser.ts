"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { isCoachEmail } from "@/lib/coachEmails";

/** Query param a coach adds to a combine link to record the test for a player. */
export const COMBINE_TEST_FOR_PARAM = "for";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function combineHrefForPlayer(href: string, playerId: string): string {
  return `${href}${href.includes("?") ? "&" : "?"}${COMBINE_TEST_FOR_PARAM}=${encodeURIComponent(playerId)}`;
}

let forParam: string | null = null;
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/**
 * Keeps the `?for=` value in sync with the router. Rendered once in the app frame inside a
 * Suspense boundary so combine pages don't need their own for `useSearchParams`.
 */
export function CombineForParamSync() {
  const value = useSearchParams().get(COMBINE_TEST_FOR_PARAM);
  useEffect(() => {
    if (value === forParam) return;
    forParam = value;
    listeners.forEach((l) => l());
  }, [value]);
  return null;
}

/** The player a coach is testing on this page, or null when players are testing themselves. */
export function useCoachTestingPlayerId(): string | null {
  const { user } = useAuth();
  const forId = useSyncExternalStore(subscribe, () => forParam, () => null);
  const isCoach = isCoachEmail(user?.email) || user?.role === "coach";
  if (!forId || !isCoach || forId === user?.id || !UUID_RE.test(forId)) return null;
  return forId;
}

/**
 * The account a combine result is saved to: the signed-in user, or the player when a coach
 * opened the combine with `?for=<playerId>`.
 */
export function useCombineUser() {
  const { user } = useAuth();
  const playerId = useCoachTestingPlayerId();
  return useMemo(() => (user && playerId ? { ...user, id: playerId } : user), [user, playerId]);
}
