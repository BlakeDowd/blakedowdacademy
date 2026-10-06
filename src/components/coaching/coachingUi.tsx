"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchProfileNames } from "@/lib/coachingFeed";
import ProfileAvatar, { useProfilePicture } from "@/components/ProfileAvatar";
import { getEmblem } from "@/components/emblems/EmblemBadge";
import { isPhotoPicture } from "@/lib/profilePicture";

export function timeAgo(iso: string, short = false): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "";
  const s = (Date.now() - at) / 1000;
  if (s < 60) return short ? "now" : "Just now";
  if (s < 3600) return `${Math.floor(s / 60)}${short ? "m" : " min"}`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d`;
  return new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]![0] : "")).toUpperCase() || "?";
}

const SIZES = {
  sm: "h-7 w-7 text-[10px]",
  md: "h-10 w-10 text-xs",
  lg: "h-20 w-20 text-lg",
} as const;

const PIXELS: Record<keyof typeof SIZES, number> = { sm: 28, md: 40, lg: 80 };

export function Avatar({
  name,
  coach,
  size = "md",
  ring,
  userId,
}: {
  name: string;
  coach?: boolean;
  size?: keyof typeof SIZES;
  ring?: boolean;
  /** When given, shows that player's photo or emblem instead of initials. */
  userId?: string | null;
}) {
  const picture = useProfilePicture(userId);
  if (isPhotoPicture(picture) || getEmblem(picture)) {
    return (
      <span className={`flex shrink-0 rounded-full ${ring ? "ring-2 ring-[#FFA500] ring-offset-2" : ""}`} aria-hidden>
        <ProfileAvatar picture={picture} name={name} size={PIXELS[size]} />
      </span>
    );
  }
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${SIZES[size]} ${
        coach ? "bg-[#014421] text-white" : "border border-stone-200 bg-white text-stone-500"
      } ${ring ? "ring-2 ring-[#FFA500] ring-offset-2" : ""}`}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

const nameCache = new Map<string, string>();

/** Full names for profile ids, cached across the coaching views. */
export function useProfileNames(ids: (string | null | undefined)[]): Map<string, string> {
  const key = [...new Set(ids.filter((id): id is string => Boolean(id)))].sort().join(",");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!key) return;
    const missing = key.split(",").filter((id) => !nameCache.has(id));
    if (!missing.length) return;
    let cancelled = false;
    void fetchProfileNames(createClient(), missing).then((fetched) => {
      fetched.forEach((v, k) => nameCache.set(k, v));
      if (!cancelled) setVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => new Map(nameCache), [key, version]);
}

export function rememberNames(entries: Iterable<[string, string]>) {
  for (const [id, name] of entries) nameCache.set(id, name);
}
