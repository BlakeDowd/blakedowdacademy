"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useStats } from "@/contexts/StatsContext";
import HomeDashboard from "@/components/HomeDashboard";

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { rounds, loading: statsLoading } = useStats();
  const [forceLoaded, setForceLoaded] = useState(false); // Emergency timeout bypass
  
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
  if ((authLoading || statsLoading) && !forceLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
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
