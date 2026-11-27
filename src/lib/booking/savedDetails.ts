const STORAGE_KEY = "blake-booking-details";

export type SavedDetails = {
  name: string;
  email: string;
  phone: string;
};

export function loadSavedDetails(): SavedDetails | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedDetails>;
    const name = String(parsed.name || "").trim();
    const email = String(parsed.email || "").trim();
    const phone = String(parsed.phone || "").trim();
    if (name.length < 2 || !email.includes("@")) return null;
    return { name, email, phone };
  } catch {
    return null;
  }
}

export function storeSavedDetails(details: SavedDetails, remember: boolean) {
  if (typeof window === "undefined") return;
  if (!remember) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ name: details.name.trim(), email: details.email.trim(), phone: details.phone.trim() }),
  );
}
