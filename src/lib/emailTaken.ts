import { createClient } from "@/lib/supabase/client";

export const EMAIL_TAKEN_MESSAGE =
  "This email already has an account. Log in instead, or reset your password if you've forgotten it.";

/**
 * True when someone has already signed up with this email (ignoring case, spaces, and Gmail dots/+tags).
 * Null when the check can't run (offline, or the duplicate_accounts migration hasn't been run yet).
 */
export async function isEmailRegistered(email: string): Promise<boolean | null> {
  const value = email.trim();
  if (!/^[^@\s]+@[^@\s]+$/.test(value)) return null;
  try {
    const { data, error } = await createClient().rpc("email_already_registered", { p_email: value });
    if (error) return null;
    return data === true;
  } catch {
    return null;
  }
}
