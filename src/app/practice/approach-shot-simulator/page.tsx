"use client";

import Link from "next/link";
import { ArrowLeft, Target } from "lucide-react";
import ApproachShotSimulator from "@/components/practice/ApproachShotSimulator";
import { trackScreen } from "@/lib/appUsage";
import { useEffect } from "react";

export default function ApproachShotSimulatorPage() {
  useEffect(() => {
    trackScreen("approach-shot-sim");
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
          <Target className="h-5 w-5 text-[#FFA500]" aria-hidden />
          <h1 className="text-xl font-bold tracking-tight">Approach Shot Simulator</h1>
        </div>
        <p className="mt-1 text-xs font-medium text-white/80">
          Random greens &amp; hazards · radar or finger dispersion · score /100
        </p>
      </header>
      <main className="mx-auto max-w-lg px-3 pt-3">
        <ApproachShotSimulator />
      </main>
    </div>
  );
}
