"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import RoutineBuilder from "@/components/routine/RoutineBuilder";

export default function RoutineBuilderPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-lg px-4 py-6 pb-24">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link
            href="/practice"
            className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-[#014421]"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Practice
          </Link>
          <span className="flex items-center gap-1.5 truncate text-xs font-semibold uppercase tracking-wide text-gray-400">
            Routine builder
            <span className="rounded bg-[#FFA500]/15 px-1.5 py-0.5 text-[10px] font-bold normal-case tracking-wide text-[#c77c00]">
              Beta
            </span>
          </span>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <RoutineBuilder />
        </div>
      </div>
    </div>
  );
}
