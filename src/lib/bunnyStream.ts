export const DEFAULT_BUNNY_VIDEO_ID = "bf910a98-d8f4-4668-8e8c-d2d1fbddbb64"; // Hell Drill (1080×1920)
export const HELL_DRILL_TOP_BUNNY_VIDEO_ID = "769c0000-f055-4a28-9b9b-b4319ffe43a7"; // Hell Drill Top Variation (1080×1920)
export const RECENTRE_DRILL_BUNNY_VIDEO_ID = "fc21a642-e8af-46d8-9025-e5d258d213ae";
export const THREE_FINGER_DRILL_BUNNY_VIDEO_ID = "95c2e96c-41a6-4b8e-a8c0-e26d6174e20e";
export const ABDUCTION_DRILL_BUNNY_VIDEO_ID = "cccce901-fb9f-41b1-863a-1de2d7a38e27";
export const RIGHT_ARM_ONLY_BUNNY_VIDEO_ID = "335a81e1-e30d-4953-8045-ea6974f79f9b";
export const LEFT_HAND_ONLY_BUNNY_VIDEO_ID = "3e29d399-9252-402f-bbf3-7138a90a3e29";
export const ABDUCTION_STICK_BUNNY_VIDEO_ID = "f18e87ba-30f0-4cf5-9e0a-a004a571b8e4";
export const SHIFTING_PRESSURE_BUNNY_VIDEO_ID = "6d16011e-087c-47c7-b7f2-80e80332f36d";
export const TAKEAWAY_STEP_DRILL_BUNNY_VIDEO_ID = "2a8cbe1f-64a4-4263-9558-906357f559b8";
export const DOWNSWING_PRESSURE_SHIFT_BUNNY_VIDEO_ID = "f589f8a9-3faf-4caf-adc1-a99b55db1b30";
export const NINE_TO_THREE_DRILL_BUNNY_VIDEO_ID = "a93c2709-1c60-42a3-9118-5d04f586c63e";
export const STEP_STEP_DRILL_BUNNY_VIDEO_ID = "d90b31b7-d0d1-4f1f-a2da-73a3978e7023";
export const STEP_STEP_AWAY_BUNNY_VIDEO_ID = "0c036522-9d4d-4f23-a066-aa00aab7d34b";
export const TEE_DRILL_BUNNY_VIDEO_ID = "46927c36-2625-454d-9f91-abc88391198e";
export const HUG_DRILL_BUNNY_VIDEO_ID = "11752b6a-50c7-43ed-98dd-3c9268fdbe3b";
export const DEFAULT_BUNNY_LIBRARY_ID = "742155";
export const APP_VIDEO_COACH_NAME = "Blake Dowd";

/** Swing library drills that can appear as the homepage featured video. */
export const LIBRARY_SWING_VIDEOS = [
  {
    key: "hell-drill",
    libraryDrillId: "swing-hell-drill",
    bunnyVideoId: DEFAULT_BUNNY_VIDEO_ID,
    label: "Hell Drill",
  },
  {
    key: "hell-drill-top",
    libraryDrillId: "swing-hell-drill-top",
    bunnyVideoId: HELL_DRILL_TOP_BUNNY_VIDEO_ID,
    label: "Hell Drill Top",
  },
  {
    key: "recentre",
    libraryDrillId: "swing-recentre-drill",
    bunnyVideoId: RECENTRE_DRILL_BUNNY_VIDEO_ID,
    label: "Recentre",
  },
  {
    key: "three-finger",
    libraryDrillId: "swing-three-finger-drill",
    bunnyVideoId: THREE_FINGER_DRILL_BUNNY_VIDEO_ID,
    label: "3 Finger Drill",
  },
  {
    key: "abduction",
    libraryDrillId: "swing-abduction-drill",
    bunnyVideoId: ABDUCTION_DRILL_BUNNY_VIDEO_ID,
    label: "Abduction Drill",
  },
  {
    key: "right-arm-only",
    libraryDrillId: "swing-right-arm-only",
    bunnyVideoId: RIGHT_ARM_ONLY_BUNNY_VIDEO_ID,
    label: "Right Arm Only",
  },
  {
    key: "left-hand-only",
    libraryDrillId: "swing-left-hand-only",
    bunnyVideoId: LEFT_HAND_ONLY_BUNNY_VIDEO_ID,
    label: "Left Hand Only",
  },
  {
    key: "abduction-stick",
    libraryDrillId: "swing-abduction-stick",
    bunnyVideoId: ABDUCTION_STICK_BUNNY_VIDEO_ID,
    label: "Abduction Stick",
  },
  {
    key: "shifting-pressure",
    libraryDrillId: "swing-shifting-pressure",
    bunnyVideoId: SHIFTING_PRESSURE_BUNNY_VIDEO_ID,
    label: "Shifting Pressure",
  },
  {
    key: "takeaway-step-drill",
    libraryDrillId: "swing-takeaway-step-drill",
    bunnyVideoId: TAKEAWAY_STEP_DRILL_BUNNY_VIDEO_ID,
    label: "Takeaway Step Drill",
  },
  {
    key: "downswing-pressure-shift",
    libraryDrillId: "swing-downswing-pressure-shift",
    bunnyVideoId: DOWNSWING_PRESSURE_SHIFT_BUNNY_VIDEO_ID,
    label: "Downswing Pressure Shift",
  },
  {
    key: "nine-to-three",
    libraryDrillId: "swing-nine-to-three-drill",
    bunnyVideoId: NINE_TO_THREE_DRILL_BUNNY_VIDEO_ID,
    label: "9 to 3 Drill",
  },
  {
    key: "step-step",
    libraryDrillId: "swing-step-step-drill",
    bunnyVideoId: STEP_STEP_DRILL_BUNNY_VIDEO_ID,
    label: "Step Step Drill",
  },
  {
    key: "step-step-away",
    libraryDrillId: "swing-step-step-away",
    bunnyVideoId: STEP_STEP_AWAY_BUNNY_VIDEO_ID,
    label: "Step Step Away",
  },
  {
    key: "tee-drill",
    libraryDrillId: "swing-tee-drill",
    bunnyVideoId: TEE_DRILL_BUNNY_VIDEO_ID,
    label: "Tee Drill",
  },
  {
    key: "hug-drill",
    libraryDrillId: "swing-hug-drill",
    bunnyVideoId: HUG_DRILL_BUNNY_VIDEO_ID,
    label: "Hug Drill",
  },
] as const;

export type LibrarySwingVideoKey = (typeof LIBRARY_SWING_VIDEOS)[number]["key"];

/**
 * Homepage featured video rotates through LIBRARY_SWING_VIDEOS, one per day.
 * To pin a single drill instead, set this to a key (e.g. "hell-drill")
 * or set NEXT_PUBLIC_FEATURED_HOME_VIDEO_KEY in env.
 */
export const FEATURED_HOME_VIDEO_KEY: LibrarySwingVideoKey | null = null;

export function resolveFeaturedHomeVideo(now: Date = new Date()): (typeof LIBRARY_SWING_VIDEOS)[number] {
  const fromEnv = process.env.NEXT_PUBLIC_FEATURED_HOME_VIDEO_KEY?.trim().toLowerCase();
  const pinned =
    LIBRARY_SWING_VIDEOS.find((v) => v.key === fromEnv) ||
    LIBRARY_SWING_VIDEOS.find((v) => v.key === FEATURED_HOME_VIDEO_KEY);
  if (pinned) return pinned;

  // Local calendar day, so the video changes at the viewer's midnight.
  const dayNumber = Math.floor(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000,
  );
  return LIBRARY_SWING_VIDEOS[dayNumber % LIBRARY_SWING_VIDEOS.length];
}

/** Bunny CDN thumbnail for a Stream video (needs NEXT_PUBLIC_BUNNY_CDN_HOSTNAME). */
export function buildBunnyThumbnailUrl(videoId: string): string | null {
  const id = videoId.trim();
  if (!id) return null;
  const host =
    process.env.NEXT_PUBLIC_BUNNY_CDN_HOSTNAME?.trim() ||
    process.env.BUNNY_CDN_HOSTNAME?.trim();
  if (!host) return null;
  const clean = host.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return `https://${clean}/${id}/thumbnail.jpg`;
}

/** Library/drill videos that must never be deleted from Bunny via the coaching UI. */
export const PROTECTED_LIBRARY_BUNNY_VIDEO_IDS = new Set<string>(
  [
    ...LIBRARY_SWING_VIDEOS.map((v) => v.bunnyVideoId),
    // Legacy landscape encodes (safe to delete in Bunny dashboard once unused)
    "02c9519f-71c8-4f45-babc-8c3b8d29e33e",
    "f113cd66-8670-48b1-bc4e-0af236e12204",
  ].map((id) => id.toLowerCase()),
);

export function isProtectedLibraryBunnyVideo(videoId: string | null | undefined): boolean {
  const id = videoId?.trim().toLowerCase();
  if (!id) return false;
  return PROTECTED_LIBRARY_BUNNY_VIDEO_IDS.has(id);
}

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
  width?: number | null;
  height?: number | null;
};

/** True when Bunny reports a portrait encode (e.g. 1080×1920). */
export function isBunnyPortraitVideo(
  meta: Pick<BunnyVideoMetadata, "width" | "height"> | null | undefined,
): boolean {
  const w = meta?.width;
  const h = meta?.height;
  return typeof w === "number" && typeof h === "number" && w > 0 && h > w;
}

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
