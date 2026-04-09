"use client";

import Link from "next/link";
import { ChevronLeft, Target } from "lucide-react";
import { PuttingTest9Runner } from "@/components/PuttingTest9Runner";
import { puttingTest9Config } from "@/lib/puttingTest9Config";

export default function PuttingTest9Page() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-6 pb-24">
        <Link
          href="/practice"
          className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-[#014421] mb-6"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Practice
        </Link>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-50 border-2 border-gray-200"
              aria-hidden
            >
              <Target className="w-5 h-5 text-gray-600" />
            </div>
            <h1 className="text-xl font-semibold leading-snug text-gray-900">
              {puttingTest9Config.testName}
            </h1>
          </div>
          <p className="text-sm text-gray-600 mt-2">
            Nine-hole combine: shuffled distances and break mix. Highest single-session score appears on
            the Academy leaderboard.
          </p>
          <PuttingTest9Runner />
        </div>
      </div>
    </div>
  );
}
