"use client";

import { useEffect } from "react";

export default function SignOutPage() {
  useEffect(() => {
    const handleSignOut = async () => {
      try {
        // Import and create Supabase client
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        
        // Sign out from Supabase
        console.log('SignOut: Signing out from Supabase...');
        await supabase.auth.signOut();
        
        // Clear all localStorage
        console.log('SignOut: Clearing localStorage...');
        if (typeof window !== 'undefined') {
          localStorage.clear();
        }
        
        // Clear all cookies
        console.log('SignOut: Clearing cookies...');
        if (typeof document !== 'undefined') {
          document.cookie.split(";").forEach((c) => {
            document.cookie = c
              .replace(/^ +/, "")
              .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
          });
        }
        
        // Wait a moment for cleanup
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Force hard redirect to login
        console.log('SignOut: Redirecting to login...');
        window.location.href = '/login';
      } catch (error) {
        console.error('SignOut: Error during sign out:', error);
        // Still redirect even if there's an error
        window.location.href = '/login';
      }
    };

    handleSignOut();
  }, []);

  // Show loading state while signing out
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-[#014421] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-700 font-medium">Signing out...</p>
      </div>
    </div>
  );
}
