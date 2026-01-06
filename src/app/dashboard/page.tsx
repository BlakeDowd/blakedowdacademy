"use client";

// Note: dynamic and revalidate exports don't work in client components,
// but kept here as requested. The cache bypass is handled via Supabase client config.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useStats } from "@/contexts/StatsContext";
import HomeDashboard from "@/components/HomeDashboard";

export default function DashboardPage() {
  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { rounds, loading: statsLoading } = useStats();
  
  // Ensure rounds is always an array, never null or undefined
  const safeRounds = rounds || [];
  
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, authLoading, router]);

  // Show loading if either auth or stats are loading
  if (authLoading || statsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[#014421] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect
  }

  return <HomeDashboard />;
}

