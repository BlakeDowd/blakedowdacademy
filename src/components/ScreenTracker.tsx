"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { isCoachEmail } from "@/lib/coachEmails";
import { screenKeyForPath, setUsageUser, trackScreen } from "@/lib/appUsage";

/** Counts which screens players open, for the coach's Usage tab. Coaches aren't counted. */
export default function ScreenTracker() {
  const pathname = usePathname();
  const { user } = useAuth();
  const isCoach = isCoachEmail(user?.email) || user?.role === "coach";
  const userId = user?.id && !isCoach ? user.id : null;

  useEffect(() => {
    setUsageUser(userId);
  }, [userId]);

  useEffect(() => {
    if (!userId || !pathname) return;
    const screen = screenKeyForPath(pathname);
    if (screen) trackScreen(screen);
  }, [userId, pathname]);

  return null;
}
