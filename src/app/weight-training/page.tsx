"use client";

import Link from "next/link";
import { Barlow_Condensed } from "next/font/google";
import { ArrowLeft } from "lucide-react";
import { WeightTrainingApp } from "@/components/weight/WeightTrainingApp";

const strengthDisplay = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-strength",
});

export default function WeightTrainingPage() {
  return (
    <div className={`${strengthDisplay.variable} strength-log min-h-screen bg-[#f3f1ea]`}>
      <header className="strength-fairway relative overflow-hidden px-4 pb-5 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
        <div className="strength-fairway-noise pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative">
          <Link
            href="/"
            className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.14em] text-white/70 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Home
          </Link>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#FFC966]">Blake Dowd</p>
          <h1 className="strength-display mt-1 text-4xl font-bold uppercase leading-none tracking-wide">
            Gym Planner
          </h1>
          <p className="mt-2 max-w-[18rem] text-sm text-white/75">
            Sets, routines and history — logged like a range notebook.
          </p>
        </div>
      </header>
      <main className="px-4 py-5 pb-28">
        <div className="mx-auto max-w-md">
          <WeightTrainingApp />
        </div>
      </main>
    </div>
  );
}
