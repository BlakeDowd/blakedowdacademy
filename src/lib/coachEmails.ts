export const COACH_EMAILS = [
  "bdowd@pgamember.org.au",
  "allendowd86@gmail.com",
] as const;

export function isCoachEmail(email: string | null | undefined): boolean {
  const normalized = (email || "").toLowerCase().trim();
  return (COACH_EMAILS as readonly string[]).includes(normalized);
}
