"use client";

import { usePathname } from "next/navigation";
import Navbar from "./Navbar";

export default function ConditionalNavbar() {
  const pathname = usePathname();

  // Debug Navigation: Add console.log to see if Navbar is being rendered
  console.log('Navbar Mounted - ConditionalNavbar rendered, pathname:', pathname);

  // Hide navbar on login page
  if (pathname === "/login") {
    console.log('Navbar Mounted - Hiding navbar on login page');
    return null;
  }

  console.log('Navbar Mounted - Rendering Navbar component');
  return <Navbar />;
}

