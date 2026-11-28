"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { YearCalendarTool } from "@/components/practice/YearCalendarTool";

export default function YearCalendarPage() {
  return (
    <div className="min-h-screen bg-stone-50">
      <div className="mx-auto max-w-lg px-4 py-6 pb-28">
        <Link
          href="/practice"
          className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-stone-600 hover:text-[#014421]"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Practice
        </Link>
        <div className="rounded-3xl border border-stone-100 bg-white p-4 shadow-sm sm:p-5">
          <YearCalendarTool />
        </div>
      </div>
    </div>
  );
}
