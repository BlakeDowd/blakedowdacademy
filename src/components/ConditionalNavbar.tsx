"use client";

import { usePathname } from "next/navigation";
import Navbar from "./Navbar";

export default function ConditionalNavbar() {
  const pathname = usePathname();

  // Hide navbar on login page
  if (pathname === "/login") {
    return null;
  }

  return <Navbar />;
}

