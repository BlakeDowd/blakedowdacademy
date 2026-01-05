"use client";

import { usePathname } from "next/navigation";
import Navbar from "./Navbar";

export default function ConditionalNavbar() {
  const pathname = usePathname();

  // Development mode: Always show navbar except on login page
  // Mock user is set up in MockAuthSetup component
  if (pathname === "/login") {
    return null;
  }

  return <Navbar />;
}

