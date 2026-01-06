"use client";

// Force dynamic rendering to prevent caching
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { 
  Home, 
  Target, 
  BookOpen, 
  BarChart3, 
  Trophy,
  LogOut
} from "lucide-react";

const navItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/practice", label: "Practice", icon: Target },
  { href: "/library", label: "Library", icon: BookOpen },
  { href: "/stats", label: "Stats", icon: BarChart3 },
  { href: "/academy", label: "Academy", icon: Trophy },
];

export default function Navbar() {
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    try {
      setSigningOut(true);
      const supabase = createClient();
      await supabase.auth.signOut();
      // Clear all local site data and redirect to login
      window.location.href = '/login';
    } catch (error) {
      console.error('Error signing out:', error);
      setSigningOut(false);
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center">
      <nav className="w-full max-w-md flex items-center justify-around py-3" style={{ backgroundColor: '#014421' }}>
        {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href;
        
        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex flex-col items-center gap-1 transition-opacity hover:opacity-80"
          >
            <Icon 
              className={`w-6 h-6 ${isActive ? "" : "text-white"}`}
              style={isActive ? { color: '#FFA500', fill: '#FFA500' } : {}}
            />
            <span className="text-white text-xs">{item.label}</span>
          </Link>
        );
      })}
      <button
        onClick={handleSignOut}
        disabled={signingOut}
        className="flex flex-col items-center gap-1 transition-opacity hover:opacity-80 disabled:opacity-50"
        title="Sign Out"
      >
        <LogOut className="w-6 h-6 text-white" />
        <span className="text-white text-xs">Sign Out</span>
      </button>
      </nav>
    </div>
  );
}

