"use client";

import { EMBLEMS, EmblemBadge } from "@/components/emblems/EmblemBadge";

const GOLF_ICONS = EMBLEMS;

interface IconPickerProps {
  selectedIcon: string | null;
  onSelectIcon: (iconId: string) => void;
}

export default function IconPicker({ selectedIcon, onSelectIcon }: IconPickerProps) {
  return (
    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-[280px] overflow-y-auto p-1 custom-scrollbar">
      {EMBLEMS.map((emblem) => {
        const selected = selectedIcon === emblem.id;
        return (
          <button
            key={emblem.id}
            type="button"
            onClick={() => onSelectIcon(emblem.id)}
            aria-pressed={selected}
            className={`flex flex-col items-center gap-1 rounded-xl border-2 px-1 py-2 transition-all hover:scale-105 ${
              selected ? "border-[#014421] bg-[#014421]/10 ring-2 ring-[#FFA500]" : "border-transparent bg-gray-50 hover:border-gray-200"
            }`}
            title={emblem.name}
          >
            <EmblemBadge emblem={emblem} size={44} />
            <span className={`w-full truncate text-center text-[10px] font-semibold leading-tight ${selected ? "text-[#014421]" : "text-gray-500"}`}>
              {emblem.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export { GOLF_ICONS };
