"use client";

import { useState, useRef, useEffect } from "react";

interface InfoBubbleProps {
  content: React.ReactNode;
  /** Tailwind classes for the "i" button */
  buttonClassName?: string;
  /** Inline styles for the "i" button (e.g. dynamic colors) */
  buttonStyle?: React.CSSProperties;
  /** Tailwind classes for the tooltip container (width, positioning) */
  tooltipClassName?: string;
}

/**
 * Info bubble that shows a tooltip on both hover (desktop) and tap (mobile).
 * Tap the "i" icon to toggle the tooltip; tap outside to close.
 */
export function InfoBubble({
  content,
  buttonClassName = "w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-[10px] font-bold cursor-help border border-gray-200",
  buttonStyle,
  tooltipClassName = "left-1/2 -translate-x-1/2 bottom-full mb-2 w-48 max-w-[200px]",
}: InfoBubbleProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (ref.current && !ref.current.contains(target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("click", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("click", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [isOpen]);

  return (
    <div ref={ref} className="group relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen((o) => !o);
        }}
        className={buttonClassName}
        style={buttonStyle}
        aria-label="Show explanation"
        aria-expanded={isOpen}
      >
        i
      </button>
      <div
        className={`absolute bg-gray-900 text-white text-xs rounded-lg p-2 shadow-xl z-50 max-w-[200px] whitespace-normal break-words ${
          isOpen ? "block" : "hidden group-hover:block"
        } ${tooltipClassName}`}
      >
        {content}
      </div>
    </div>
  );
}
