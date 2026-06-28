"use client";

import Link from "next/link";
import { ArrowLeft, Crosshair } from "lucide-react";
import { PlaysLikeCalculator } from "@/components/PlaysLikeShotBlueprint";

export default function ShotBlueprintPage() {
  return (
    <div className="min-h-full bg-[#f4f6f4]">
      <header className="bg-[#014421] px-4 pb-4 pt-3 text-white shadow-md">
        <Link
          href="/virtual-caddie"
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-white/85 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Virtual Caddie
        </Link>
        <div className="flex items-center gap-2">
          <Crosshair className="h-5 w-5" aria-hidden />
          <h1 className="text-xl font-bold tracking-tight">Plays Like / Shot Blueprint</h1>
        </div>
        <p className="mt-1 text-xs font-medium text-white/80">
          Wind, slope &amp; club matching
        </p>
      </header>
      <main className="px-4 py-6 sm:py-8">
        <PlaysLikeCalculator />
      </main>
    </div>
  );
}
