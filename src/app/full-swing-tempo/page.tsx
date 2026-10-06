"use client";

import Link from "next/link";
import { ArrowLeft, Timer } from "lucide-react";
import LongGameTempoTrainer from "@/components/tempo/LongGameTempoTrainer";

export default function FullSwingTempoPage() {
  return (
    <div className="min-h-screen bg-[#f4f6f4]">
      <header className="bg-[#014421] px-4 pb-4 pt-3 text-white">
        <Link
          href="/"
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-white/85 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Home
        </Link>
        <div className="flex items-center gap-2">
          <Timer className="h-5 w-5" aria-hidden />
          <h1 className="text-xl font-bold tracking-tight">Full Swing Tempo</h1>
        </div>
        <p className="mt-1 text-xs font-medium text-white/80">3:1 backswing to downswing · drivers, woods &amp; irons</p>
      </header>
      <main className="px-4 py-6 pb-28 sm:py-8">
        <div className="mx-auto max-w-md">
          <LongGameTempoTrainer hideHeader />
        </div>
      </main>
    </div>
  );
}
