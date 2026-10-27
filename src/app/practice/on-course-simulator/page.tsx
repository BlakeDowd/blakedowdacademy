"use client";

import Link from "next/link";
import { ArrowLeft, Map } from "lucide-react";
import OnCourseSimulator from "@/components/practice/OnCourseSimulator";
import { trackScreen } from "@/lib/appUsage";
import { useEffect } from "react";

export default function OnCourseSimulatorPage() {
  useEffect(() => {
    trackScreen("on-course-sim");
  }, []);

  return (
    <div className="min-h-screen bg-stone-100 pb-24">
      <header className="bg-gradient-to-br from-[#014421] to-[#0b6634] px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] text-white">
        <Link
          href="/practice"
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-white/85 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Practice
        </Link>
        <div className="flex items-center gap-2">
          <Map className="h-5 w-5 text-[#FFA500]" aria-hidden />
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            On-Course Simulator
            <span className="rounded-full bg-[#FFA500] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#3d2600]">
              Beta
            </span>
          </h1>
        </div>
        <p className="mt-1 text-xs font-medium text-white/80">
          Stonecutters Ridge · hole layouts still being refined
        </p>
      </header>
      <main className="mx-auto max-w-lg px-3 pt-3">
        <OnCourseSimulator />
      </main>
    </div>
  );
}
