"use client";

import { usePathname } from "next/navigation";
import {
  Home,
  Target,
  BookOpen,
  User,
} from "lucide-react";

const navItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/practice", label: "Practice", icon: Target },
  { href: "/library", label: "Library", icon: BookOpen },
  { href: "/profile", label: "Profile", icon: User },
];

export default function Navbar() {
  const pathname = usePathname();

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
          <a
            key={item.href}
            href={item.href}
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
          </a>
        );
      })}
    </nav>
  );
}
