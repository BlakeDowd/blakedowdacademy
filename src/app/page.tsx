"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useStats } from "@/contexts/StatsContext";
import HomeDashboard from "@/components/HomeDashboard";

export default function Home() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const { rounds, loading: statsLoading } = useStats();
  const [forceLoaded, setForceLoaded] = useState(false); // Emergency timeout bypass
  
  // Console Log Check: Add console.log to see if the app knows who is logged in
  useEffect(() => {
    console.log('Current User State:', user);
    console.log('Current User ID:', user?.id);
    console.log('Current User Email:', user?.email);
    console.log('Current User Full Name:', user?.fullName);
    console.log('Is Authenticated:', isAuthenticated);
    console.log('Auth Loading:', authLoading);
  }, [user, isAuthenticated, authLoading]);
  
  // Ensure rounds is always an array, never null or undefined
  const safeRounds = rounds || [];
  
  // Emergency Timeout: Force setForceLoaded(true) after 3 seconds if data hasn't arrived
  useEffect(() => {
    const timeout = setTimeout(() => {
      setForceLoaded(true);
      console.log('Emergency timeout: Forcing Home component to render after 3 seconds');
    }, 3000);

    return () => clearTimeout(timeout);
  }, []);
  
  // Log rounds data for debugging
  useEffect(() => {
    console.log('Rounds data in Home page:', safeRounds);
    console.log('Stats loading state:', statsLoading);
  }, [safeRounds, statsLoading]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, authLoading, router]);

  // Show loading if either auth or stats are loading (with emergency timeout bypass)
  // Disable Overlays: Add pointer-events-none so loading overlay doesn't block the Navbar
  if ((authLoading || statsLoading) && !forceLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 pointer-events-none">
        <div className="text-center pointer-events-auto">
          <div className="w-8 h-8 border-4 border-[#014421] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // After forceLoaded timeout, always render the dashboard
  // The useEffect above will handle redirecting to /login if not authenticated
  // This prevents the blank page issue
  return <HomeDashboard />;
}
