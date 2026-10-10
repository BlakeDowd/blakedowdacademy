"use client";

import { useState } from "react";
import { Sprout, User } from "lucide-react";

/** World Handicap System maximum, the handicap new golfers start on. */
export const BEGINNER_HANDICAP = 54;

/** Handicap input with a "Beginner, no handicap yet" option that fills in {@link BEGINNER_HANDICAP}. */
export default function HandicapField({
  value,
  onChange,
  required = false,
  min = -5,
}: {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  min?: number;
}) {
  const [beginner, setBeginner] = useState(false);

  const choose = (next: boolean) => {
    setBeginner(next);
    onChange(next ? String(BEGINNER_HANDICAP) : "");
  };

  return (
    <div>
      <label htmlFor="handicap" className="mb-1.5 block text-sm font-medium text-gray-700">
        Current Handicap
      </label>
      {beginner ? (
        <div className="flex items-center gap-3 rounded-lg border border-[#054d2b] bg-green-50 px-3 py-3">
          <Sprout className="h-5 w-5 shrink-0 text-[#054d2b]" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900">Beginner</p>
            <p className="text-xs text-gray-600">
              You&apos;ll start on {BEGINNER_HANDICAP}. Update it any time once you have a handicap.
            </p>
          </div>
        </div>
      ) : (
        <div className="relative">
          <User className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            id="handicap"
            type="number"
            step="0.1"
            inputMode="decimal"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-lg border border-gray-200 py-3 pl-10 pr-4 outline-none transition-all focus:border-[#054d2b] focus:ring-2 focus:ring-[#054d2b]"
            placeholder="e.g., 12.0"
            required={required}
            min={min}
            max={BEGINNER_HANDICAP}
          />
        </div>
      )}
      <button
        type="button"
        onClick={() => choose(!beginner)}
        className="mt-2 text-sm font-semibold text-[#054d2b] underline-offset-2 hover:underline"
      >
        {beginner ? "I have a handicap" : "No handicap yet? I'm a beginner"}
      </button>
    </div>
  );
}
