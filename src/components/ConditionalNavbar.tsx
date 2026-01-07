"use client";

import { usePathname } from "next/navigation";
import Navbar from "./Navbar";

export default function ConditionalNavbar() {
  const pathname = usePathname();

  // Always show navbar (including Sign Out button) even during loading
  // Only hide on login page
  if (pathname === "/login") {
    return null;
  }

  // Ensure Sign Out button is visible even during loading state
  return <Navbar />;
}

