import { createHash } from "crypto";
import { resolveBunnyLibraryId } from "@/lib/bunnyStream";

const BUNNY_VIDEO_API = "https://video.bunnycdn.com";
export const BUNNY_TUS_ENDPOINT = "https://video.bunnycdn.com/tusupload";

export function getBunnyStreamApiKey(): string | null {
  const key = process.env.BUNNY_STREAM_API_KEY?.trim();
  const libraryId = resolveBunnyLibraryId();
  if (!key) return null;
  // Common misconfig: people paste the library ID as the API key.
  if (key === libraryId) return null;
  return key;
}

export function bunnyApiConfigured(): boolean {
  return Boolean(getBunnyStreamApiKey() && resolveBunnyLibraryId());
}

export function bunnyAuthHeaders(apiKey: string, json = false): HeadersInit {
  return {
    AccessKey: apiKey,
    Accept: "application/json",
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

export type BunnyVideoDetails = {
  guid: string;
  title: string;
  length: number;
  status: number;
  hasOriginal?: boolean | null;
  dateUploaded?: string;
  thumbnailFileName?: string | null;
};

export type BunnyTusUploadCredentials = {
  videoId: string;
  libraryId: string;
  expirationTime: number;
  signature: string;
  endpoint: string;
  title: string;
};

export async function bunnyListVideos(limit = 20): Promise<BunnyVideoDetails[]> {
  const apiKey = getBunnyStreamApiKey();
  const libraryId = resolveBunnyLibraryId();
  if (!apiKey || !libraryId) {
    throw new Error(
      "Bunny Stream is not configured. Set BUNNY_STREAM_API_KEY to your library Stream API key (not the library ID).",
    );
  }

  const response = await fetch(
    `${BUNNY_VIDEO_API}/library/${libraryId}/videos?page=1&itemsPerPage=${limit}&orderBy=date`,
    { headers: bunnyAuthHeaders(apiKey), cache: "no-store" },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Bunny list failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const payload = (await response.json()) as {
    items?: Array<Record<string, unknown>>;
  };
  const items = Array.isArray(payload.items) ? payload.items : [];
  return items
    .map((item) => ({
      guid: String(item.guid || ""),
      title: String(item.title || "Untitled"),
      length: typeof item.length === "number" ? item.length : 0,
      status: typeof item.status === "number" ? item.status : 0,
      hasOriginal: typeof item.hasOriginal === "boolean" ? item.hasOriginal : null,
      dateUploaded: typeof item.dateUploaded === "string" ? item.dateUploaded : undefined,
      thumbnailFileName:
        typeof item.thumbnailFileName === "string" ? item.thumbnailFileName : null,
    }))
    .filter((v) => v.guid);
}

export async function bunnyGetVideo(videoId: string): Promise<BunnyVideoDetails> {
  const apiKey = getBunnyStreamApiKey();
  const libraryId = resolveBunnyLibraryId();
  if (!apiKey || !libraryId) {
    throw new Error("Bunny Stream is not configured.");
  }

  const response = await fetch(
    `${BUNNY_VIDEO_API}/library/${libraryId}/videos/${videoId}`,
    { headers: bunnyAuthHeaders(apiKey), cache: "no-store" },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Bunny get video failed (${response.status}): ${text.slice(0, 200)}`);
  }
  const item = (await response.json()) as Record<string, unknown>;
  return {
    guid: String(item.guid || videoId),
    title: String(item.title || "Untitled"),
    length: typeof item.length === "number" ? item.length : 0,
    status: typeof item.status === "number" ? item.status : 0,
    hasOriginal: typeof item.hasOriginal === "boolean" ? item.hasOriginal : null,
    dateUploaded: typeof item.dateUploaded === "string" ? item.dateUploaded : undefined,
  };
}

export async function bunnyCreateVideo(title: string): Promise<{ guid: string; title: string }> {
  const apiKey = getBunnyStreamApiKey();
  const libraryId = resolveBunnyLibraryId();
  if (!apiKey || !libraryId) {
    throw new Error(
      "Bunny Stream is not configured. Set BUNNY_STREAM_API_KEY to your library Stream API key (not the library ID).",
    );
  }

  const createRes = await fetch(`${BUNNY_VIDEO_API}/library/${libraryId}/videos`, {
    method: "POST",
    headers: bunnyAuthHeaders(apiKey, true),
    body: JSON.stringify({ title: title || "Swing upload" }),
  });
  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`Bunny create failed (${createRes.status}): ${text.slice(0, 200)}`);
  }
  const created = (await createRes.json()) as { guid?: string; title?: string };
  const videoId = created.guid?.trim();
  if (!videoId) throw new Error("Bunny create returned no video id.");
  return { guid: videoId, title: created.title || title || "Swing upload" };
}

/** Pre-signed TUS credentials so the browser can upload directly to Bunny (bypasses Vercel body limits). */
export function createBunnyTusUploadCredentials(
  videoId: string,
  title: string,
  expiresInSeconds = 3600,
): BunnyTusUploadCredentials {
  const apiKey = getBunnyStreamApiKey();
  const libraryId = resolveBunnyLibraryId();
  if (!apiKey || !libraryId) {
    throw new Error("Bunny Stream is not configured.");
  }
  const expirationTime = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const signature = createHash("sha256")
    .update(`${libraryId}${apiKey}${expirationTime}${videoId}`)
    .digest("hex");
  return {
    videoId,
    libraryId,
    expirationTime,
    signature,
    endpoint: BUNNY_TUS_ENDPOINT,
    title,
  };
}

export async function bunnyCreateAndUploadVideo(
  title: string,
  file: Blob,
  fileName: string,
): Promise<BunnyVideoDetails> {
  const created = await bunnyCreateVideo(title || fileName || "Swing upload");
  const apiKey = getBunnyStreamApiKey();
  const libraryId = resolveBunnyLibraryId();
  if (!apiKey || !libraryId) {
    throw new Error("Bunny Stream is not configured.");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const uploadRes = await fetch(
    `${BUNNY_VIDEO_API}/library/${libraryId}/videos/${created.guid}`,
    {
      method: "PUT",
      headers: {
        AccessKey: apiKey,
        Accept: "application/json",
        "Content-Type": "application/octet-stream",
      },
      body: bytes,
    },
  );
  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    throw new Error(`Bunny upload failed (${uploadRes.status}): ${text.slice(0, 200)}`);
  }

  return bunnyGetVideo(created.guid);
}

export async function bunnyDeleteVideo(videoId: string): Promise<void> {
  const apiKey = getBunnyStreamApiKey();
  const libraryId = resolveBunnyLibraryId();
  if (!apiKey || !libraryId) {
    throw new Error("Bunny Stream is not configured.");
  }

  const response = await fetch(
    `${BUNNY_VIDEO_API}/library/${libraryId}/videos/${videoId}`,
    { method: "DELETE", headers: bunnyAuthHeaders(apiKey), cache: "no-store" },
  );
  if (!response.ok && response.status !== 404) {
    const text = await response.text();
    throw new Error(`Bunny delete failed (${response.status}): ${text.slice(0, 200)}`);
  }
}

/** CDN hostname for original/raw file downloads (Keep Original Files must be on). */
export function resolveBunnyCdnHostname(): string | null {
  return (
    process.env.NEXT_PUBLIC_BUNNY_CDN_HOSTNAME?.trim() ||
    process.env.BUNNY_CDN_HOSTNAME?.trim() ||
    null
  );
}

export function buildBunnyOriginalUrl(videoId: string): string | null {
  const host = resolveBunnyCdnHostname();
  if (!host) return null;
  const clean = host.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return `https://${clean}/${videoId}/original`;
}
