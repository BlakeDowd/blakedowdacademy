"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { type EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const establishSession = async () => {
      const supabase = createClient();
      const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");

      // Handle token_hash + type (password recovery - works cross-device)
      const token_hash = params.get("token_hash");
      const type = params.get("type") as EmailOtpType | null;
      if (token_hash && type) {
        const { error: verifyError } = await supabase.auth.verifyOtp({ type, token_hash });
        if (!verifyError) {
          window.history.replaceState({}, "", "/reset-password");
          setHasSession(true);
          setAuthChecked(true);
          return;
        }
      }

      // Handle code (PKCE - same device only)
      const code = params.get("code");
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (!exchangeError) {
          window.history.replaceState({}, "", "/reset-password");
          setHasSession(true);
          setAuthChecked(true);
          return;
        }
      }

      // Check for existing session (covers hash-based redirect - detectSessionInUrl processes it)
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setHasSession(true);
      } else {
        // Brief delay for hash processing (Supabase may need a moment to parse URL fragment)
        await new Promise((r) => setTimeout(r, 500));
        const { data: { session: retrySession } } = await supabase.auth.getSession();
        if (retrySession) {
          setHasSession(true);
        } else {
          router.replace("/login");
        }
      }
      setAuthChecked(true);
    };
    establishSession();
  }, [router]);

  if (!authChecked || !hasSession) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ backgroundColor: "#ffffff" }}>
        <p className="text-gray-500">{!authChecked ? "Loading..." : "Redirecting..."}</p>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      await supabase.auth.signOut();
      setSuccess(true);
      setTimeout(() => router.replace("/login?reset=success"), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update password");
    } finally {
      setLoading(false);
    }
  };

  if (!hasSession) return null;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ backgroundColor: "#ffffff" }}>
      <div className="w-full max-w-md px-4">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="Blake Dowd Golf" className="w-48 mx-auto object-contain mb-4" />
          <h1 className="text-xl font-bold" style={{ color: "#054d2b" }}>
            Set new password
          </h1>
          <p className="text-gray-500 text-sm mt-2">
            Enter your new password below
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
          {success ? (
            <div
              className="p-4 rounded-lg text-center"
              style={{ backgroundColor: "#f0fdf4" }}
            >
              <p className="text-sm" style={{ color: "#166534" }}>
                Password updated. Redirecting to login...
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                  New password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#054d2b] focus:border-[#054d2b] outline-none"
                    placeholder="••••••••"
                    required
                    minLength={6}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Confirm password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    id="confirm"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#054d2b] focus:border-[#054d2b] outline-none"
                    placeholder="••••••••"
                    required
                    minLength={6}
                  />
                </div>
              </div>
              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-lg font-semibold text-white transition-all hover:shadow-lg disabled:opacity-50"
                style={{ backgroundColor: "#054d2b" }}
              >
                {loading ? "Updating..." : "Update password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
