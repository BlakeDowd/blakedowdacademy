"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

export default function ProfileGuard({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, profileLoading, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Wait until auth and profile are done loading
    if (loading || profileLoading) return;

    // We only care about authenticated users
    if (!isAuthenticated || !user) return;

    // Paths that don't require a complete profile
    const allowedPaths = ["/login", "/finish-profile", "/auth/signout", "/reset-password"];
    if (allowedPaths.includes(pathname)) return;

    // Check if profile is incomplete
    // Based on user request: only redirect if fullName is explicitly null or empty string
    const isProfileIncomplete = user.fullName === null || user.fullName === undefined || user.fullName.trim() === '';

    if (isProfileIncomplete) {
      console.log('ProfileGuard: Redirecting to /finish-profile due to incomplete profile', user);
      router.push("/finish-profile");
    }
  }, [user, isAuthenticated, profileLoading, loading, pathname, router]);

  return <>{children}</>;
}