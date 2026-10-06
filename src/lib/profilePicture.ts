import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient, SUPABASE_URL } from "@/lib/supabase/client";

/**
 * profiles.preferred_icon_id holds either an emblem id ("trophy") or an uploaded photo
 * ("photo:{userId}/{timestamp}.jpg", a path in the public "avatars" bucket).
 */
export const PHOTO_PREFIX = "photo:";
export const AVATAR_BUCKET = "avatars";
const PHOTO_SIZE = 512;

export function isPhotoPicture(value: string | null | undefined): value is string {
  return !!value && value.startsWith(PHOTO_PREFIX);
}

export function photoPathOf(value: string): string {
  return value.slice(PHOTO_PREFIX.length);
}

export function photoUrl(value: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${AVATAR_BUCKET}/${photoPathOf(value)}`;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file couldn't be read as an image. Try a JPG or PNG."));
    };
    img.src = url;
  });
}

/** Centre-crops to a square and shrinks to 512px so avatars load fast everywhere. */
async function toSquareJpeg(file: File): Promise<Blob> {
  const img = await loadImage(file);
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - side) / 2;
  const sy = (img.naturalHeight - side) / 2;
  const out = Math.min(PHOTO_SIZE, side);
  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser couldn't process that photo.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, side, side, 0, 0, out, out);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't prepare that photo."))), "image/jpeg", 0.86);
  });
}

/** Uploads the photo and returns the value to store in profiles.preferred_icon_id. */
export async function uploadProfilePhoto(supabase: SupabaseClient, userId: string, file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose a photo.");
  const blob = await toSquareJpeg(file);
  const path = `${userId}/${Date.now()}.jpg`;
  const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, blob, {
    contentType: "image/jpeg",
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) {
    if (/bucket not found/i.test(error.message)) {
      throw new Error("Photo uploads aren't switched on yet. Run the profile photos migration in Supabase.");
    }
    throw new Error(error.message || "Upload failed. Please try again.");
  }
  return `${PHOTO_PREFIX}${path}`;
}

/** Best-effort cleanup of a replaced photo; failures just leave an orphaned file. */
export async function removeProfilePhoto(supabase: SupabaseClient, value: string | null | undefined): Promise<void> {
  if (!isPhotoPicture(value)) return;
  try {
    await supabase.storage.from(AVATAR_BUCKET).remove([photoPathOf(value)]);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Batched picture lookup for places that only know a user id (coaching feed etc.)

const pictureCache = new Map<string, string | null>();
const listeners = new Set<() => void>();
let queued = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function notify() {
  listeners.forEach((l) => l());
}

async function flush() {
  flushTimer = null;
  const ids = [...queued];
  queued = new Set();
  if (ids.length === 0) return;
  try {
    const { data, error } = await createClient().from("profiles").select("id, preferred_icon_id").in("id", ids);
    if (error) throw error;
    const found = new Map((data ?? []).map((r: { id: string; preferred_icon_id: string | null }) => [r.id, r.preferred_icon_id]));
    ids.forEach((id) => pictureCache.set(id, found.get(id) ?? null));
  } catch {
    ids.forEach((id) => pictureCache.set(id, null));
  }
  notify();
}

export function requestProfilePicture(userId: string) {
  if (pictureCache.has(userId) || queued.has(userId)) return;
  queued.add(userId);
  if (!flushTimer) flushTimer = setTimeout(flush, 30);
}

export function getCachedProfilePicture(userId: string): string | null | undefined {
  return pictureCache.get(userId);
}

export function setCachedProfilePicture(userId: string, value: string | null) {
  pictureCache.set(userId, value);
  notify();
}

export function subscribeProfilePictures(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
