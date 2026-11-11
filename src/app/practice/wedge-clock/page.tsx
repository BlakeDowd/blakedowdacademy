"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import WedgeClockTool from "@/components/practice/WedgeClockTool";
import { trackScreen } from "@/lib/appUsage";

export default function WedgeClockPage() {
  useEffect(() => {
    trackScreen("wedge-clock");
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
      <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-stone-900">
        Wedge Clock
        <span className="rounded bg-[#FFA500]/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#c77c00]">
          Beta
        </span>
      </h1>
      <p className="mt-1 text-sm text-stone-500">
        Hit to a clock length. Log club, goal, and carry from your radar.
      </p>
      <div className="mt-4">
        <WedgeClockTool />
      </div>
    </div>
  );
}
