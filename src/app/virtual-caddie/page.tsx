"use client";

import Link from "next/link";
import { ArrowLeft, Bot } from "lucide-react";
import { PlaysLikeOnboarding } from "@/components/PlaysLikeOnboarding";

export default function VirtualCaddiePage() {
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
          <Bot className="h-5 w-5" aria-hidden />
          <h1 className="text-xl font-bold tracking-tight">Virtual Caddie</h1>
        </div>
        <p className="mt-1 text-xs font-medium text-white/80">
          Club for the shot — wind, slope &amp; your carries
        </p>
      </header>
      <main className="px-4 py-6 pb-24 sm:py-8">
        <PlaysLikeOnboarding />
      </main>
    </div>
  );
}
