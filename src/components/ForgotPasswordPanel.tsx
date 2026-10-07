"use client";

import { useEffect, useState } from "react";
import { KeyRound, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const RESEND_SECONDS = 60;

const inputClass =
  "w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#054d2b] focus:border-[#054d2b] outline-none";

function friendlyError(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : "";
  if (/expired|invalid/i.test(message)) return "That code is wrong or has expired. Check the latest email, or send a new one.";
  if (/rate limit|security purposes|seconds/i.test(message)) return "Please wait a minute before asking for another email.";
  return message || fallback;
}

/**
 * Forgot-password flow: email a reset link plus a one-time code. The code works in whatever app or
 * browser the player is using, even when the link opens somewhere else.
 */
export default function ForgotPasswordPanel({
  initialEmail = "",
  notice,
  onBack,
}: {
  initialEmail?: string;
  /** Shown above the form, e.g. why a reset link didn't work. */
  notice?: string;
  onBack: () => void;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const send = async (address: string) => {
    setError("");
    if (!address.trim()) {
      setError("Please enter your email address");
      return;
    }
    setLoading(true);
    try {
      const { error: resetError } = await createClient().auth.resetPasswordForEmail(address.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetError) throw resetError;
      setSentTo(address.trim());
      setCode("");
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      setError(friendlyError(err, "Failed to send reset email. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sentTo) return;
    const token = code.replace(/\s/g, "");
    if (!/^\d{6,10}$/.test(token)) {
      setError("Enter the code from the email (numbers only).");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const { error: verifyError } = await createClient().auth.verifyOtp({ email: sentTo, token, type: "recovery" });
      if (verifyError) throw verifyError;
      window.location.assign("/reset-password");
    } catch (err) {
      setError(friendlyError(err, "Couldn't check that code. Please try again."));
      setLoading(false);
    }
  };

  const errorBox = error && (
    <div className="p-3 rounded-lg bg-red-50 border border-red-200">
      <p className="text-sm text-red-600">{error}</p>
    </div>
  );

  if (sentTo) {
    return (
      <form onSubmit={verify} className="space-y-4">
        <div className="p-4 rounded-lg" style={{ backgroundColor: "#f0fdf4" }}>
          <p className="text-sm" style={{ color: "#166534" }}>
            We&apos;ve emailed <span className="font-semibold">{sentTo}</span>. Tap the link in the email, or type the
            code from it below. If it&apos;s not there, check your spam folder.
          </p>
        </div>
        <div>
          <label htmlFor="reset-code" className="block text-sm font-medium text-gray-700 mb-1.5">
            Code from the email
          </label>
          <div className="relative">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              id="reset-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^\d\s]/g, "").slice(0, 12))}
              className={`${inputClass} tracking-[0.3em]`}
              placeholder="123456"
            />
          </div>
        </div>
        {errorBox}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 rounded-lg font-semibold text-white transition-all hover:shadow-lg disabled:opacity-50"
          style={{ backgroundColor: "#054d2b" }}
        >
          {loading ? "Checking..." : "Continue"}
        </button>
        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => {
              setSentTo(null);
              setError("");
            }}
            className="text-gray-500 hover:text-gray-700"
          >
            Use a different email
          </button>
          <button
            type="button"
            disabled={loading || cooldown > 0}
            onClick={() => void send(sentTo)}
            className="font-medium text-[#054d2b] hover:underline disabled:text-gray-400 disabled:no-underline"
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend email"}
          </button>
        </div>
        <button type="button" onClick={onBack} className="w-full py-2 text-sm text-gray-500 hover:text-gray-700">
          Back to Login
        </button>
      </form>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void send(email);
      }}
      className="space-y-4"
    >
      {notice && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
          <p className="text-sm text-amber-900">{notice}</p>
        </div>
      )}
      <p className="text-sm text-gray-600">Enter your email and we&apos;ll send you a link and a code to reset your password.</p>
      <div>
        <label htmlFor="forgot-email" className="block text-sm font-medium text-gray-700 mb-1.5">
          Email
        </label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            id="forgot-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="your@email.com"
            required
          />
        </div>
        <p className="text-xs text-gray-500 mt-1.5">
          Can&apos;t remember which email you signed up with? Message your coach and they can look it up for you.
        </p>
      </div>
      {errorBox}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-3.5 rounded-lg font-semibold text-white transition-all hover:shadow-lg disabled:opacity-50"
        style={{ backgroundColor: "#054d2b" }}
      >
        {loading ? "Sending..." : "Send reset email"}
      </button>
      <button type="button" onClick={onBack} className="w-full py-2 text-sm text-gray-500 hover:text-gray-700">
        Back to Login
      </button>
    </form>
  );
}
