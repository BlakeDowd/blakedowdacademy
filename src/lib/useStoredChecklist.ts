"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/** Ticked item ids saved in localStorage, shared live between every component using the same key. */
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function parse(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}

function write(key: string, ids: Set<string>) {
  try {
    if (ids.size === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify([...ids]));
  } catch {
    // Private browsing or storage full: ticks just won't survive a refresh.
  }
  listeners.forEach((l) => l());
}

export function useStoredChecklist(storageKey: string) {
  const raw = useSyncExternalStore(
    subscribe,
    () => read(storageKey),
    () => null,
  );
  const checked = useMemo(() => parse(raw), [raw]);

  // Reads storage rather than `checked` so rapid taps never work from a stale render.
  const toggle = useCallback(
    (id: string) => {
      const next = parse(read(storageKey));
      if (next.has(id)) next.delete(id);
      else next.add(id);
      write(storageKey, next);
    },
    [storageKey],
  );

  const clear = useCallback(() => write(storageKey, new Set()), [storageKey]);

  return { checked, toggle, clear };
}
