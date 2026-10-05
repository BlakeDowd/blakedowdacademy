"use client";

import { useState } from "react";
import { CheckCircle2, MessageSquare, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const MAX_LENGTH = 2000;

export function FeedbackBox() {
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || status === "sending") return;

    setStatus("sending");
    setError(null);
    try {
      const { data: sessionData } = await createClient().auth.getSession();
      const token = sessionData.session?.access_token;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch("/api/feedback", {
        method: "POST",
        headers,
        body: JSON.stringify({ message: trimmed }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Couldn't send your feedback.");
      setMessage("");
      setStatus("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send your feedback.");
      setStatus("error");
    }
  };

  return (
    <div className="w-full">
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <MessageSquare className="h-5 w-5 shrink-0 text-[#014421]" aria-hidden />
          <h2 className="text-base font-bold text-gray-900">Send feedback</h2>
        </div>

        {status === "sent" ? (
          <div className="flex flex-col items-center gap-2 rounded-xl bg-green-50 p-4 text-center">
            <CheckCircle2 className="h-6 w-6 text-[#014421]" aria-hidden />
            <p className="text-sm font-semibold text-[#014421]">Thanks — Blake has your feedback.</p>
            <button
              type="button"
              onClick={() => setStatus("idle")}
              className="text-xs font-medium text-gray-600 underline underline-offset-2"
            >
              Send more feedback
            </button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <p className="mb-3 text-sm text-gray-600">
              Ideas, bugs or anything you&apos;d like to see in the app? Let Blake know.
            </p>
            <label htmlFor="app-feedback" className="sr-only">
              Your feedback
            </label>
            <textarea
              id="app-feedback"
              value={message}
              onChange={(e) => {
                setMessage(e.target.value.slice(0, MAX_LENGTH));
                if (status === "error") setStatus("idle");
              }}
              rows={4}
              placeholder="Type your feedback here…"
              className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#014421] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#014421]/20"
            />
            {status === "error" && error ? (
              <p className="mt-2 text-xs font-medium text-red-600">{error}</p>
            ) : null}
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-[11px] text-gray-400 tabular-nums">
                {message.length}/{MAX_LENGTH}
              </span>
              <button
                type="submit"
                disabled={!message.trim() || status === "sending"}
                className="flex items-center gap-2 rounded-xl bg-[#014421] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-4 w-4" aria-hidden />
                {status === "sending" ? "Sending…" : "Send feedback"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
