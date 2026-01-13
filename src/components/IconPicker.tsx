"use client";

import { useState } from "react";

// Golf-themed SVG icons
const GOLF_ICONS = [
  {
    id: 'golf-ball',
    name: 'Golf Ball',
    svg: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
        <circle cx="12" cy="12" r="10" fill="#014421" />
        <circle cx="12" cy="12" r="6" fill="white" opacity="0.3" />
        <path d="M12 6 Q14 8 12 10 Q10 8 12 6" fill="white" opacity="0.5" />
        <path d="M12 14 Q14 16 12 18 Q10 16 12 14" fill="white" opacity="0.5" />
      </svg>
    )
  },
  {
    id: 'golf-club',
    name: 'Golf Club',
    svg: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
        <rect x="10" y="2" width="4" height="16" fill="#014421" />
        <rect x="8" y="18" width="8" height="4" fill="#FFA500" />
        <circle cx="12" cy="20" r="1.5" fill="#014421" />
      </svg>
    )
  },
  {
    id: 'flag',
    name: 'Flag',
    svg: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
        <rect x="2" y="4" width="2" height="16" fill="#014421" />
        <path d="M4 4 L18 4 L14 8 L18 12 L4 12 Z" fill="#FFA500" />
      </svg>
    )
  },
  {
    id: 'trophy',
    name: 'Trophy',
    svg: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
        <path d="M6 4 L18 4 L17 8 L19 8 L18 12 L6 12 L5 8 L7 8 Z" fill="#FFA500" />
        <rect x="9" y="12" width="6" height="4" fill="#FFA500" />
        <rect x="10" y="16" width="4" height="2" fill="#014421" />
        <circle cx="12" cy="9" r="2" fill="#014421" />
      </svg>
    )
  },
  {
    id: 'target',
    name: 'Target',
    svg: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
        <circle cx="12" cy="12" r="10" fill="none" stroke="#014421" strokeWidth="2" />
        <circle cx="12" cy="12" r="6" fill="none" stroke="#014421" strokeWidth="2" />
        <circle cx="12" cy="12" r="2" fill="#FFA500" />
      </svg>
    )
  },
  {
    id: 'star',
    name: 'Star',
    svg: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
        <path d="M12 2 L15 9 L22 10 L17 15 L18 22 L12 18 L6 22 L7 15 L2 10 L9 9 Z" fill="#FFA500" />
      </svg>
    )
  },
  {
    id: 'shield',
    name: 'Shield',
    svg: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
        <path d="M12 2 L4 6 L4 12 Q4 18 12 22 Q20 18 20 12 L20 6 Z" fill="#014421" />
        <path d="M12 4 L6 7 L6 12 Q6 16 12 19 Q18 16 18 12 L18 7 Z" fill="#FFA500" />
      </svg>
    )
  },
  {
    id: 'diamond',
    name: 'Diamond',
    svg: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
        <path d="M12 2 L18 8 L12 22 L6 8 Z" fill="#014421" />
        <path d="M12 4 L16 8 L12 18 L8 8 Z" fill="#FFA500" />
      </svg>
    )
  }
];

interface IconPickerProps {
  selectedIcon: string | null;
  onSelectIcon: (iconId: string) => void;
}

export default function IconPicker({ selectedIcon, onSelectIcon }: IconPickerProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-3">
        Choose Your Icon
      </label>
      <div className="grid grid-cols-4 gap-3">
        {GOLF_ICONS.map((icon) => (
          <button
            key={icon.id}
            type="button"
            onClick={() => onSelectIcon(icon.id)}
            className={`w-16 h-16 rounded-xl border-2 transition-all hover:scale-110 ${
              selectedIcon === icon.id
                ? 'border-[#014421] bg-[#014421]/10 ring-2 ring-[#FFA500]'
                : 'border-gray-300 bg-white hover:border-[#014421]'
            }`}
            style={{ color: selectedIcon === icon.id ? '#014421' : '#014421' }}
          >
            {icon.svg}
          </button>
        ))}
      </div>
    </div>
  );
}

export { GOLF_ICONS };
