"use client";

import { 
  Flag, Trophy, Target, Star, Medal, Crown, 
  Zap, Activity, Award, Dumbbell, Timer, Clover, 
  Waves, Cloud, Flame, Heart, Compass, MapPin 
} from "lucide-react";
import React from "react";

// Lucide React icons for profile pictures
const GOLF_ICONS = [
  { id: 'golf-flag', icon: Flag, name: 'Golf Flag' },
  { id: 'trophy', icon: Trophy, name: 'Trophy' },
  { id: 'target', icon: Target, name: 'Target' },
  { id: 'star', icon: Star, name: 'Star' },
  { id: 'medal', icon: Medal, name: 'Medal' },
  { id: 'crown', icon: Crown, name: 'Crown' },
  { id: 'zap', icon: Zap, name: 'Lightning' },
  { id: 'activity', icon: Activity, name: 'Activity' },
  { id: 'award', icon: Award, name: 'Award' },
  { id: 'dumbbell', icon: Dumbbell, name: 'Dumbbell' },
  { id: 'timer', icon: Timer, name: 'Timer' },
  { id: 'clover', icon: Clover, name: 'Clover' },
  { id: 'waves', icon: Waves, name: 'Waves' },
  { id: 'cloud', icon: Cloud, name: 'Cloud' },
  { id: 'fire', icon: Flame, name: 'Fire' }, // Using 'fire' as ID to avoid conflict with legacy 'flame' bug
  { id: 'heart', icon: Heart, name: 'Heart' },
  { id: 'compass', icon: Compass, name: 'Compass' },
  { id: 'map-pin', icon: MapPin, name: 'Map Pin' }
];

interface IconPickerProps {
  selectedIcon: string | null;
  onSelectIcon: (iconId: string) => void;
}

export default function IconPicker({ selectedIcon, onSelectIcon }: IconPickerProps) {
  return (
    <div className="grid grid-cols-4 sm:grid-cols-5 gap-3 max-h-[250px] overflow-y-auto p-2 custom-scrollbar">
      {GOLF_ICONS.map((iconData) => {
        const IconComponent = iconData.icon;
        return (
          <button
            key={iconData.id}
            type="button"
            onClick={() => onSelectIcon(iconData.id)}
            className={`p-3 rounded-xl border-2 transition-all hover:scale-105 flex items-center justify-center ${
              selectedIcon === iconData.id
                ? 'border-[#014421] bg-[#014421]/10 ring-2 ring-[#FFA500]'
                : 'border-gray-200 bg-gray-50 hover:border-[#014421]'
            }`}
            title={iconData.name}
          >
            <IconComponent 
              className={`w-6 h-6 ${selectedIcon === iconData.id ? 'text-[#014421]' : 'text-gray-500'}`} 
              strokeWidth={selectedIcon === iconData.id ? 2.5 : 2}
            />
          </button>
        );
      })}
    </div>
  );
}

export { GOLF_ICONS };
