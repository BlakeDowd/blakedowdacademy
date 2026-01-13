"use client";

// Simple emoji-based golf icons for one-tap selection
const GOLF_ICONS = [
  { id: 'ball', emoji: '⛳', name: 'Golf Ball' },
  { id: 'club', emoji: '🏌️', name: 'Golf Club' },
  { id: 'bag', emoji: '👜', name: 'Golf Bag' },
  { id: 'flag', emoji: '🚩', name: 'Flag' },
  { id: 'trophy', emoji: '🏆', name: 'Trophy' },
  { id: 'cart', emoji: '🛒', name: 'Cart' }
];

interface IconPickerProps {
  selectedIcon: string | null;
  onSelectIcon: (iconId: string) => void;
}

export default function IconPicker({ selectedIcon, onSelectIcon }: IconPickerProps) {
  return (
    <div className="flex items-center gap-2">
      {GOLF_ICONS.map((icon) => (
        <button
          key={icon.id}
          type="button"
          onClick={() => onSelectIcon(icon.id)}
          className={`text-3xl p-2 rounded-lg border-2 transition-all hover:scale-110 ${
            selectedIcon === icon.id
              ? 'border-[#014421] bg-[#014421]/10 ring-2 ring-[#FFA500]'
              : 'border-gray-300 bg-white hover:border-[#014421]'
          }`}
          title={icon.name}
        >
          {icon.emoji}
        </button>
      ))}
    </div>
  );
}

export { GOLF_ICONS };
