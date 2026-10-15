"use client";

import { useState } from "react";
import { Sprout, User } from "lucide-react";

/** World Handicap System maximum, the handicap new golfers start on. */
export const BEGINNER_HANDICAP = 54;

/** Best plus handicap accepted (+5.0, stored as -5). */
export const MAX_PLUS_HANDICAP = 5;

/**
 * Handicap input with a "Beginner, no handicap yet" option that fills in {@link BEGINNER_HANDICAP}.
 * Plus handicaps are picked with a toggle (phone number pads have no minus key) and stored as negatives.
 */
export default function HandicapField({
  value,
  onChange,
  required = false,
}: {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const [beginner, setBeginner] = useState(false);
  const [plus, setPlusState] = useState(() => value.trim().startsWith("-"));
  const shown = value.trim().replace(/^[-+]/, "");

  const choose = (next: boolean) => {
    setBeginner(next);
    onChange(next ? String(BEGINNER_HANDICAP) : "");
  };

  const setPlus = (next: boolean) => {
    if (next === plus) return;
    setPlusState(next);
    onChange(next && shown ? `-${shown}` : shown);
  };

  const typed = (raw: string) => {
    const digits = raw.replace(/^[-+]/, "");
    onChange(plus && digits ? `-${digits}` : digits);
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
        <>
          <div className="mb-2 grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1" role="radiogroup" aria-label="Handicap type">
            {[
              { id: false, label: "Standard" },
              { id: true, label: "Plus (+)" },
            ].map((opt) => (
              <button
                key={opt.label}
                type="button"
                role="radio"
                aria-checked={plus === opt.id}
                onClick={() => setPlus(opt.id)}
                className={`rounded-md py-1.5 text-sm font-semibold transition-colors ${
                  plus === opt.id ? "bg-white text-[#054d2b] shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="relative">
            {plus ? (
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-bold text-[#054d2b]" aria-hidden>
                +
              </span>
            ) : (
              <User className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            )}
            <input
              id="handicap"
              type="number"
              step="0.1"
              inputMode="decimal"
              value={shown}
              onChange={(e) => typed(e.target.value)}
              className="w-full rounded-lg border border-gray-200 py-3 pl-10 pr-4 outline-none transition-all focus:border-[#054d2b] focus:ring-2 focus:ring-[#054d2b]"
              placeholder={plus ? "e.g., 2.3" : "e.g., 12.0"}
              required={required}
              min={0}
              max={plus ? MAX_PLUS_HANDICAP : BEGINNER_HANDICAP}
            />
          </div>
          {plus && (
            <p className="mt-1 text-xs text-gray-500">Better than scratch, e.g. +2.3 on your Golf Australia record.</p>
          )}
        </>
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
