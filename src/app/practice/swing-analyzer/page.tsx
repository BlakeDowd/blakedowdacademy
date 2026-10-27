"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import LocalSwingAnalyzer from "@/components/practice/LocalSwingAnalyzer";
import { trackScreen } from "@/lib/appUsage";

export default function SwingAnalyzerPage() {
  useEffect(() => {
    trackScreen("swing-analyzer");
  }, []);

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-white px-4 pb-24 pt-4">
      <Link
        href="/practice"
        className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-[#014421]"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Practice
      </Link>
      <h1 className="text-xl font-bold tracking-tight text-stone-900">Swing Analyser</h1>
      <p className="mt-1 text-sm text-stone-500">
        Frame-by-frame review with drawing tools — available to every player.
      </p>
      <div className="mt-4">
        <LocalSwingAnalyzer />
      </div>
    </div>
  );
}
