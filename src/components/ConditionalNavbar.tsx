"use client";

import { usePathname } from "next/navigation";
import Navbar from "./Navbar";

export default function ConditionalNavbar() {
  const pathname = usePathname();

  // Only hide on login; no user/loading checks so nav persists on Vercel initial load
  if (pathname === "/login") {
    return null;
  }

  return <Navbar />;
}

