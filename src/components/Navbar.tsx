"use client";

import { usePathname } from "next/navigation";
import { 
  Home, 
  Target, 
  BookOpen, 
  BarChart3, 
  Trophy
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

  // Debug Navigation: Add console.log to see if Navbar is being rendered
  console.log('Navbar Mounted - Navbar component rendered, pathname:', pathname);

  // Native Navigation: Replace the handleNavigation function logic with window.location.href = href
  // This bypasses React entirely and forces a hard browser load to the new page
  const handleNavigation = (href: string) => {
    window.location.href = href;
  };

  // Z-Index Check: Ensure navbar z-[60] is higher than modals (z-40) so navigation is never covered
  return (
    <div className="fixed bottom-0 left-0 right-0 z-[60] flex justify-center">
      <nav className="w-full max-w-md flex items-center justify-around py-3" style={{ backgroundColor: '#014421' }}>
        {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href;
        
        return (
          <button
            key={item.href}
            onClick={() => handleNavigation(item.href)}
            className="flex flex-col items-center gap-1 transition-opacity hover:opacity-80"
            type="button"
          >
            <Icon 
              className={`w-6 h-6 ${isActive ? "" : "text-white"}`}
              style={isActive ? { color: '#FFA500', fill: '#FFA500' } : {}}
            />
            <span className="text-white text-xs">{item.label}</span>
          </button>
        );
      })}
      </nav>
    </div>
  );
}

