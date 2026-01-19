"use client";

import { 
  Trophy, 
  Clock, 
  Target, 
  Flame, 
  BookOpen, 
  Star, 
  Zap, 
  Crown, 
  Medal, 
  Award 
} from "lucide-react";

interface TrophyCardProps {
  trophy_name: string;
  trophy_icon?: string;
  id?: string;
  description?: string;
  onClick: () => void;
}

// Map trophy_id to icon components (shared with Dashboard and Academy)
const getTrophyIcon = (trophyId: string) => {
  const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    'first-steps': Clock,
    'dedicated': Clock,
    'practice-master': Target,
    'practice-legend': Flame,
    'student': BookOpen,
    'scholar': BookOpen,
    'expert': BookOpen,
    'first-round': Trophy,
    'consistent': Trophy,
    'tracker': Trophy,
    'rising-star': Star,
    'champion': Zap,
    'elite': Crown,
    'goal-achiever': Medal,
    'birdie-hunter': Target,
    'breaking-90': Trophy,
    'breaking-80': Trophy,
    'breaking-70': Trophy,
    'eagle-eye': Star,
    'birdie-machine': Zap,
    'par-train': Trophy,
    'week-warrior': Flame,
    'monthly-legend': Crown,
    'putting-professor': BookOpen,
    'wedge-wizard': BookOpen,
    'coachs-pet': Award
  };
  return iconMap[trophyId] || Trophy;
};

// Unified Component: Shared TrophyCard component that takes trophy_name, icon, and description as props
export default function TrophyCard({ trophy_name, trophy_icon, id, onClick }: TrophyCardProps) {
  // Icon Mapping: Use the same emoji or SVG icons from Academy (star, target, lightning bolt)
  const trophyId = id || trophy_name.toLowerCase().replace(/\s+/g, '-');
  const IconComponent = trophy_icon ? Trophy : getTrophyIcon(trophyId);
  const displayIcon = trophy_icon || null;

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center rounded-lg p-1.5 border-2 border-[#FFA500] bg-white shadow-sm transition-all duration-300 hover:scale-105 cursor-pointer aspect-square"
    >
      {displayIcon ? (
        <span className="text-3xl mb-1">{displayIcon}</span>
      ) : (
        <IconComponent className="w-8 h-8 mb-1" style={{ color: '#FFA500' }} />
      )}
      {/* Fix Text Truncation: Use line-clamp-2 so the full name fits */}
      <span className="text-xs text-gray-600 text-center mt-1 line-clamp-2 w-full">
        {trophy_name}
      </span>
    </button>
  );
}
