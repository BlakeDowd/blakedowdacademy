"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Mail, Lock, User, LogIn, UserPlus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function LoginPage() {
  const router = useRouter();
  const { login, signup } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [initialHandicap, setInitialHandicap] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showRetry, setShowRetry] = useState(false);

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

    if (isSignUp && (!fullName || !initialHandicap)) {
      setError("Please fill in all required fields");
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
          signup(email, password, fullName, handicap),
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

  const handleGoogleLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      
      // Credentials are hardcoded in client.ts, no need to check env vars
      
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/`,
        },
      });
      if (error) {
        setError(error.message || "Failed to sign in with Google");
        setLoading(false);
      }
      // Note: If successful, the user will be redirected, so we don't set loading to false here
    } catch (err: any) {
      setError(err.message || "An error occurred with Google login");
      setLoading(false);
    }
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center px-4 py-12 relative overflow-hidden"
      style={{ 
        backgroundColor: '#014421',
        backgroundImage: 'linear-gradient(135deg, rgba(1, 68, 33, 0.95) 0%, rgba(1, 90, 46, 0.95) 100%)'
      }}
    >
      {/* Optional: Add a blurred golf course image background here */}
      <div 
        className="absolute inset-0"
        style={{ background: 'linear-gradient(to bottom right, rgba(20, 83, 45, 0.2), rgba(22, 101, 52, 0.2))' }}
      />
      
      <div className="relative z-10 w-full max-w-md px-4">
        {/* Logo and Branding */}
        <div className="text-center mb-8">
          {/* Logo Image */}
          <div className="flex justify-center mb-4">
            <img src="/logo.png" alt="Logo" className="h-12 w-auto object-contain" />
          </div>
          <div 
            className="text-6xl font-bold mb-4"
            style={{ 
              color: '#FFA500',
              fontFamily: 'Georgia, serif',
              textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              letterSpacing: '0.05em'
            }}
          >
            The Academy
          </div>
          <p className="text-white/80 text-sm">
            {isSignUp ? "Create your account" : "Welcome back"}
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
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
                  style={{ backgroundColor: '#014421' }}
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
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#014421] focus:border-[#014421] outline-none transition-all"
                  placeholder="your@email.com"
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#014421] focus:border-[#014421] outline-none transition-all"
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
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#014421] focus:border-[#014421] outline-none transition-all"
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
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#014421] focus:border-[#014421] outline-none transition-all"
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

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-lg font-semibold text-white transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: '#014421' }}
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

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">Or continue with</span>
            </div>
          </div>

          {/* Google Login Button */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            className="w-full py-3 rounded-full bg-white border-2 border-gray-300 font-medium text-gray-700 hover:border-gray-400 hover:shadow-md transition-all flex items-center justify-center gap-3"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </button>

          {/* Footer Text */}
          <p className="text-center text-xs text-gray-500 mt-6">
            {isSignUp ? (
              <>
                By signing up, you agree to our{" "}
                <a href="#" className="text-[#014421] hover:underline">
                  Terms of Service
                </a>{" "}
                and{" "}
                <a href="#" className="text-[#014421] hover:underline">
                  Privacy Policy
                </a>
              </>
            ) : (
              <>
                Don't have an account?{" "}
                <button
                  type="button"
                  onClick={() => setIsSignUp(true)}
                  className="text-[#014421] font-medium hover:underline"
                >
                  Sign up
                </button>
              </>
            )}
          </p>

        </div>
      </div>
    </div>
  );
}

