"use client";

import { useEffect } from "react";

/**
 * Development-only component to set up mock authentication
 * This bypasses the login screen for development purposes
 */
export default function MockAuthSetup() {
  useEffect(() => {
    if (typeof window !== "undefined") {
      // Set up mock user: Jordan Mills
      const mockUser = {
        email: "jordan.mills@example.com",
        initialHandicap: 8.7,
        createdAt: new Date().toISOString(),
      };

      // Set authentication status
      localStorage.setItem("isAuthenticated", "true");
      localStorage.setItem("user", JSON.stringify(mockUser));
      localStorage.setItem("initialHandicap", "8.7");

      // Set up mock user progress with 1,250 XP
      const mockUserProgress = {
        completedDrills: [],
        totalXP: 1250,
        totalMinutes: 0,
      };

      // Only set if it doesn't exist (preserve existing progress)
      if (!localStorage.getItem("userProgress")) {
        localStorage.setItem("userProgress", JSON.stringify(mockUserProgress));
      } else {
        // Update XP if it exists but is less than 1250
        const existingProgress = JSON.parse(localStorage.getItem("userProgress") || "{}");
        if (existingProgress.totalXP < 1250) {
          existingProgress.totalXP = 1250;
          localStorage.setItem("userProgress", JSON.stringify(existingProgress));
        }
      }
    }
  }, []);

  return null; // This component doesn't render anything
}

