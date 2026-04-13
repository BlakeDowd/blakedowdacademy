"use client";

import { ChevronLeft } from "lucide-react";

type Props = {
  onBack: () => void;
  label?: string;
  className?: string;
};

/** Text button for stepping back inside a combine flow (phase or last logged entry). */
export function CombineFlowBackControl({
  onBack,
  label = "Go back",
  className = "",
}: Props) {
  return (
    <button
      type="button"
      onClick={onBack}
      className={`inline-flex items-center gap-1.5 rounded-lg py-1.5 pl-0 pr-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-[#014421] ${className}`.trim()}
    >
      <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
      {label}
    </button>
  );
}
