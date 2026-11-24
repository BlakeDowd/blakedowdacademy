"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  Target,
  BookOpen,
  User,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useStats } from "@/contexts/StatsContext";

const navItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/practice", label: "Practice", icon: Target },
  { href: "/library", label: "Library", icon: BookOpen },
  { href: "/profile", label: "Profile", icon: User },
];

function scrollAppToTop() {
  const main = document.querySelector<HTMLElement>(".app-frame-main");
  if (main) {
    main.scrollTo({ top: 0, behavior: "smooth" });
  } else {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { refreshUser } = useAuth();
  const {
    refreshRounds,
    refreshCommunityRounds,
    refreshDrills,
    refreshPracticeSessions,
    refreshPracticeLogs,
  } = useStats();

  const refreshHome = () => {
    scrollAppToTop();
    void refreshUser();
    refreshRounds();
    refreshCommunityRounds();
    refreshDrills();
    refreshPracticeSessions();
    refreshPracticeLogs();
    window.dispatchEvent(new Event("roundsUpdated"));
    window.dispatchEvent(new Event("practiceActivityUpdated"));
    window.dispatchEvent(new Event("homeRefresh"));
    router.refresh();
  };

  return (
    <nav
      className="grid w-full grid-cols-4 items-center bg-[#014421] h-20 min-h-20 pt-2 pb-6 shadow-[0_-2px_10px_rgba(0,0,0,0.1)] z-50"
      style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))" }}
    >
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={(e) => {
              if (item.href === "/" && pathname === "/") {
                e.preventDefault();
                refreshHome();
              }
            }}
            className="flex flex-col items-center justify-center gap-1 transition-opacity hover:opacity-80"
          >
            <Icon
              className="w-5 h-5"
              style={isActive ? { color: '#FFA500', fill: '#FFA500' } : { color: 'white' }}
            />
            <span
              className="text-xs"
              style={isActive ? { color: '#86efac' } : { color: 'white' }}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
