/** Joke placeholder videos that were left on some drills (e.g. the Rick Roll). */
const PLACEHOLDER_VIDEO_IDS = ["dQw4w9WgXcQ"];

/** The drill's video link, or undefined when it's empty or a placeholder. */
export function realVideoUrl(url: string | null | undefined): string | undefined {
  const trimmed = String(url ?? "").trim();
  if (!trimmed || PLACEHOLDER_VIDEO_IDS.some((id) => trimmed.includes(id))) return undefined;
  return trimmed;
}
