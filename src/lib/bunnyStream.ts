export const DEFAULT_BUNNY_VIDEO_ID = "02c9519f-71c8-4f45-babc-8c3b8d29e33e";
export const DEFAULT_BUNNY_LIBRARY_ID = "742155";
export const APP_VIDEO_COACH_NAME = "Blake Dowd";

/** Public Bunny library id — env override, then baked-in default for production deploys. */
export function resolveBunnyLibraryId(override?: string | null): string {
  const fromOverride = override?.trim();
  if (fromOverride) return fromOverride;
  const fromEnv = process.env.NEXT_PUBLIC_BUNNY_LIBRARY_ID?.trim();
  if (fromEnv) return fromEnv;
  return DEFAULT_BUNNY_LIBRARY_ID;
}

export type BunnyVideoMetadata = {
  title: string;
  description: string | null;
  lengthSeconds: number;
};

export function cleanBunnyVideoTitle(raw: string): string {
  return raw.trim().replace(/\.(mp4|mov|m4v|webm)$/i, "");
}

export function formatBunnyDuration(lengthSeconds: number): string {
  if (!Number.isFinite(lengthSeconds) || lengthSeconds <= 0) return "";
  const total = Math.round(lengthSeconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
