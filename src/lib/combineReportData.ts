/** Helpers for reading saved combine sessions back into report data. */

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** `notes` is stored as a JSON string (or occasionally an object). */
export function parseNotes(notes: unknown): Record<string, unknown> | null {
  if (typeof notes !== "string") return asRecord(notes);
  try {
    return asRecord(JSON.parse(notes));
  } catch {
    return null;
  }
}

export function oneOf<T extends string>(value: unknown, options: readonly T[]): T | null {
  return typeof value === "string" && (options as readonly string[]).includes(value) ? (value as T) : null;
}
