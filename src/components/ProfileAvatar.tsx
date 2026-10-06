"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { User } from "lucide-react";
import { EmblemBadge, getEmblem } from "@/components/emblems/EmblemBadge";
import {
  getCachedProfilePicture,
  isPhotoPicture,
  photoUrl,
  requestProfilePicture,
  subscribeProfilePictures,
} from "@/lib/profilePicture";

/** Looks up a player's picture by id (batched + cached). Returns undefined while loading. */
export function useProfilePicture(userId: string | null | undefined): string | null | undefined {
  useEffect(() => {
    if (userId) requestProfilePicture(userId);
  }, [userId]);
  return useSyncExternalStore(
    subscribeProfilePictures,
    () => (userId ? getCachedProfilePicture(userId) : null),
    () => undefined,
  );
}

function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  return parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type ProfileAvatarProps = {
  /** Value of profiles.preferred_icon_id: an emblem id, "photo:..." or null. */
  picture: string | null | undefined;
  name?: string | null;
  size?: number;
  className?: string;
  /** Background behind initials when there's no photo or emblem. */
  fallbackClassName?: string;
};

export default function ProfileAvatar({
  picture,
  name,
  size = 40,
  className = "",
  fallbackClassName = "bg-[#014421] text-white",
}: ProfileAvatarProps) {
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const url = isPhotoPicture(picture) ? photoUrl(picture) : null;
  const emblem = url ? undefined : getEmblem(picture);

  if (url && brokenUrl !== url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name ? `${name}'s photo` : "Profile photo"}
        width={size}
        height={size}
        onError={() => setBrokenUrl(url)}
        className={`shrink-0 rounded-full bg-gray-100 object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  if (emblem) return <EmblemBadge emblem={emblem} size={size} className={className} />;

  const initials = initialsOf(name);
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ${fallbackClassName} ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) }}
      aria-label={name ?? "Player"}
    >
      {initials || <User style={{ width: size * 0.55, height: size * 0.55 }} strokeWidth={2.2} />}
    </span>
  );
}
