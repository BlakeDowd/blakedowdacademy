"use client";

import { useEffect, useState } from "react";
import { Check, Copy, KeyRound, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type State =
  | { status: "loading" }
  | { status: "ready"; email: string | null }
  | { status: "setup" }
  | { status: "error" };

/** The player's login email for coaches, with copy and "send password reset" shortcuts. */
export function PlayerEmail({ playerId, playerName }: { playerId: string; playerName: string }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [copied, setCopied] = useState(false);
  const [resetState, setResetState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  useEffect(() => {
    let cancelled = false;
    void createClient()
      .rpc("coach_player_email", { p_player: playerId })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          const missing = error.code === "PGRST202" || /coach_player_email/.test(error.message ?? "");
          setState({ status: missing ? "setup" : "error" });
        } else {
          setState({ status: "ready", email: typeof data === "string" && data ? data : null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  if (state.status === "loading" || state.status === "error") return null;
  if (state.status === "setup") {
    return (
      <p className="text-[11px] text-amber-700">
        To see emails here, run supabase/migrations/20261007140000_coach_player_email.sql in Supabase.
      </p>
    );
  }
  if (!state.email) return null;
  const email = state.email;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy email", email);
    }
  };

  const sendReset = async () => {
    if (!window.confirm(`Email ${playerName} a password reset link and code at ${email}?`)) return;
    setResetState("sending");
    const { error } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetState(error ? "failed" : "sent");
  };

  return (
    <div className="mt-0.5 space-y-0.5">
      <div className="flex min-w-0 items-center gap-1 text-xs text-stone-600">
        <Mail className="h-3.5 w-3.5 shrink-0 text-stone-400" aria-hidden />
        <a href={`mailto:${email}`} className="truncate hover:text-[#014421] hover:underline">
          {email}
        </a>
        <button
          type="button"
          onClick={() => void copy()}
          className="shrink-0 rounded-full p-1 text-stone-400 hover:bg-stone-200 hover:text-stone-700"
          aria-label="Copy email"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-[#014421]" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
        </button>
      </div>
      <button
        type="button"
        onClick={() => void sendReset()}
        disabled={resetState === "sending" || resetState === "sent"}
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#014421] hover:underline disabled:text-stone-500 disabled:no-underline"
      >
        <KeyRound className="h-3 w-3" aria-hidden />
        {resetState === "sending"
          ? "Sending…"
          : resetState === "sent"
            ? "Password reset email sent"
            : resetState === "failed"
              ? "Couldn't send. Try again in a minute"
              : "Send password reset"}
      </button>
    </div>
  );
}
