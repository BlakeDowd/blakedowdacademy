"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Mail, Lock, User, LogIn, UserPlus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import IconPicker from "@/components/IconPicker";

export default function LoginPage() {
  const router = useRouter();
  const { login, signup } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [initialHandicap, setInitialHandicap] = useState("");
  const [selectedIcon, setSelectedIcon] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showRetry, setShowRetry] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordSuccess, setForgotPasswordSuccess] = useState(false);

  // Show success message when returning from password reset
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("reset") === "success") {
      setError("");
      window.history.replaceState({}, "", "/login");
      alert("Your password has been updated. You can now log in.");
    }
  }, []);

  // Check for existing session on mount - if session exists but spinner is stuck, force redirect
  useEffect(() => {
    // Debug: Log Supabase URL to verify correct project
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://zdhzarkguvvrwzjuiqdc.supabase.co';
    console.log('Login: NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl);
    
    const checkSession = async () => {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          console.log('Login: Session exists, forcing redirect to /academy');
          // Force hard redirect to break any spinner loop
          window.location.href = '/academy';
        }
      } catch (err) {
        console.error('Login: Error checking session:', err);
      }
    };

    checkSession();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Basic validation
    if (!email || !password) {
      setError("Please fill in all required fields");
      setLoading(false);
      return;
    }

    if (isSignUp && (!fullName || !initialHandicap || !selectedIcon)) {
      setError("Please fill in all required fields and select an icon");
      setLoading(false);
      return;
    }

    try {
      setShowRetry(false);
      // Create a timeout promise that rejects after 3 seconds
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error("Login timed out. Please check your connection and try again."));
        }, 3000);
      });

      // Race between the login/signup and the timeout
      if (isSignUp) {
        const handicap = parseFloat(initialHandicap);
        if (isNaN(handicap) || handicap < -5 || handicap > 54) {
          setError("Please enter a valid handicap (-5 to 54)");
          setLoading(false);
          return;
        }
        await Promise.race([
          signup(email, password, fullName, handicap, selectedIcon || undefined),
          timeoutPromise
        ]);
        // Wait 200ms for session to be saved before redirecting
        await new Promise(resolve => setTimeout(resolve, 200));
        // Verify session exists before redirecting
        try {
          const { createClient } = await import("@/lib/supabase/client");
          const supabase = createClient();
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            window.location.assign('/academy');
          }
        } catch (err) {
          console.error('Login: Error verifying session before redirect:', err);
          // Still redirect after delay
          setTimeout(() => window.location.assign('/academy'), 200);
        }
      } else {
        await Promise.race([
          login(email, password),
          timeoutPromise
        ]);
        // Wait 200ms for session to be saved before redirecting
        await new Promise(resolve => setTimeout(resolve, 200));
        // Verify session exists before redirecting
        try {
          const { createClient } = await import("@/lib/supabase/client");
          const supabase = createClient();
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            window.location.assign('/academy');
          }
        } catch (err) {
          console.error('Login: Error verifying session before redirect:', err);
          // Still redirect after delay
          setTimeout(() => window.location.assign('/academy'), 200);
        }
      }
    } catch (err: any) {
      setLoading(false);
      
      // Show error in alert for visibility on phone
      const errorMessage = err.message || "An error occurred. Please try again.";
      alert(`Login Error: ${errorMessage}`);
      
      // If timeout occurred, show retry button
      if (err.message && err.message.includes("timed out")) {
        setShowRetry(true);
        setError("Login timed out. Please check your connection.");
        
        // Also check for session and force redirect if session exists
        setTimeout(async () => {
          try {
            const { createClient } = await import("@/lib/supabase/client");
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
              console.log('Login: Session exists after timeout, forcing redirect to /academy');
              window.location.href = '/academy';
            }
          } catch (checkErr) {
            console.error('Login: Error checking session after timeout:', checkErr);
            alert(`Session Check Error: ${checkErr instanceof Error ? checkErr.message : String(checkErr)}`);
          }
        }, 500);
      } else {
        setError(errorMessage);
      }
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim()) {
      setError("Please enter your email address");
      return;
    }
    setLoading(true);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${typeof window !== "undefined" ? window.location.origin : ""}/reset-password`,
      });
      if (resetError) throw resetError;
      setForgotPasswordSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send reset email. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ backgroundColor: '#ffffff' }}
    >
      <div className="w-full max-w-md px-4">
        {/* Logo and Branding */}
        <div className="text-center mb-8 break-text shrink min-w-0">
          <div className="flex justify-center mb-4">
            <img src="/logo.png" alt="Blake Dowd Golf" className="w-64 object-contain" />
          </div>
          <h1 
            className="text-2xl font-bold break-text shrink"
            style={{ color: '#054d2b', letterSpacing: '0.02em' }}
          >
            Online Academy
          </h1>
          <p className="text-gray-500 text-sm mt-2">
            {showForgotPassword ? "Reset your password" : isSignUp ? "Create your account" : "Welcome back"}
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
          {/* Forgot Password View */}
          {showForgotPassword ? (
            <>
              {forgotPasswordSuccess ? (
                <div className="space-y-4">
                  <div 
                    className="p-4 rounded-lg"
                    style={{ backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }}
                  >
                    <p className="text-sm" style={{ color: '#166534' }}>
                      Check your email for a password reset link. If you don&apos;t see it, check your spam folder.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setShowForgotPassword(false); setForgotPasswordSuccess(false); setError(""); }}
                    className="w-full py-3 rounded-lg font-semibold text-white transition-all"
                    style={{ backgroundColor: '#054d2b' }}
                  >
                    Back to Login
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <p className="text-sm text-gray-600">
                    Enter your email and we&apos;ll send you a link to reset your password.
                  </p>
                  <div>
                    <label htmlFor="forgot-email" className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        id="forgot-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#054d2b] focus:border-[#054d2b] outline-none"
                        placeholder="your@email.com"
                        required
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
                    style={{ backgroundColor: '#054d2b' }}
                  >
                    {loading ? "Sending..." : "Send reset link"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowForgotPassword(false); setError(""); }}
                    className="w-full py-2 text-sm text-gray-500 hover:text-gray-700"
                  >
                    Back to Login
                  </button>
                </form>
              )}
            </>
          ) : (
          <>
          {/* Toggle between Login and Sign Up */}
          <div className="flex gap-2 mb-6 bg-gray-100 rounded-lg p-1">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(false);
                setError("");
              }}
              className={`flex-1 py-2.5 px-4 rounded-md font-medium text-sm transition-all ${
                !isSignUp
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <LogIn className="w-4 h-4" />
                Login
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsSignUp(true);
                setError("");
              }}
              className={`flex-1 py-2.5 px-4 rounded-md font-medium text-sm transition-all ${
                isSignUp
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <UserPlus className="w-4 h-4" />
                Sign Up
              </div>
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div 
              className="mb-4 p-3 border rounded-lg"
              style={{ 
                backgroundColor: '#fef2f2',
                borderColor: '#fecaca'
              }}
            >
              <p className="text-sm" style={{ color: '#dc2626' }}>{error}</p>
              {showRetry && (
                <button
                  onClick={() => window.location.reload()}
                  className="mt-3 w-full py-2 px-4 rounded-lg font-medium text-white transition-all hover:shadow-md"
                  style={{ backgroundColor: '#054d2b' }}
                >
                  Click here to retry
                </button>
              )}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#054d2b] focus:border-[#054d2b] outline-none transition-all"
                  placeholder="your@email.com"
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                {!isSignUp && (
                  <button
                    type="button"
                    onClick={() => { setShowForgotPassword(true); setError(""); }}
                    className="text-xs font-medium text-[#054d2b] hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#054d2b] focus:border-[#054d2b] outline-none transition-all"
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </div>
            </div>

            {/* Full Name Field (Sign Up Only) */}
            {isSignUp && (
              <div>
                <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#054d2b] focus:border-[#054d2b] outline-none transition-all"
                    placeholder="John Doe"
                    required={isSignUp}
                  />
                </div>
              </div>
            )}

            {/* Initial Handicap Field (Sign Up Only) */}
            {isSignUp && (
              <div>
                <label htmlFor="handicap" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Current Handicap
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    id="handicap"
                    type="number"
                    step="0.1"
                    value={initialHandicap}
                    onChange={(e) => setInitialHandicap(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#054d2b] focus:border-[#054d2b] outline-none transition-all"
                    placeholder="e.g., 12.0"
                    required={isSignUp}
                    min="-5"
                    max="54"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Enter your current golf handicap (-5 to +5 Pro, 0 to 54)
                </p>
              </div>
            )}

            {/* Icon Picker (Sign Up Only) */}
            {isSignUp && (
              <div>
                <IconPicker selectedIcon={selectedIcon} onSelectIcon={setSelectedIcon} />
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-lg font-semibold text-white transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: '#054d2b' }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {isSignUp ? "Creating Account..." : "Logging in..."}
                </span>
              ) : (
                isSignUp ? "Create Account" : "Login"
              )}
            </button>
          </form>

          {/* Footer Text */}
          <p className="text-center text-xs text-gray-500 mt-6">
            {isSignUp ? (
              <>
                By signing up, you agree to our{" "}
                <a href="#" className="text-[#054d2b] hover:underline">
                  Terms of Service
                </a>{" "}
                and{" "}
                <a href="#" className="text-[#054d2b] hover:underline">
                  Privacy Policy
                </a>
              </>
            ) : (
              <>
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  onClick={() => setIsSignUp(true)}
                  className="text-[#054d2b] font-medium hover:underline"
                >
                  Sign up
                </button>
              </>
            )}
          </p>
          </>
          )}
        </div>
      </div>
    </div>
  );
}

