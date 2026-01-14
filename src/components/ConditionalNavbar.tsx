"use client";

import { usePathname } from "next/navigation";
import Navbar from "./Navbar";

export default function ConditionalNavbar() {
  const pathname = usePathname();

  // Debug Navigation: Add console.log to see if Navbar is being rendered
  // Force Render: Ensure ConditionalNavbar renders even if loading is true, so we can always switch pages
  console.log('Navbar Mounted - ConditionalNavbar rendered, pathname:', pathname);

  // Force Render: Always render navbar (except login page) - don't check loading state
  // Hide navbar on login page
  if (pathname === "/login") {
    console.log('Navbar Mounted - Hiding navbar on login page');
    return null;
  }

  // Force Render: Render navbar regardless of loading state
  // Global Unblock: Wrap the entire ConditionalNavbar return in a div with fixed positioning and high z-index
  // Force Navbar: Ensure the ConditionalNavbar has style={{ pointerEvents: 'all' }} to override any invisible layers
  console.log('Navbar Mounted - Rendering Navbar component (forced render, not checking loading)');
  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 99999, pointerEvents: 'all' }}>
      <Navbar />
    </div>
  );
}

