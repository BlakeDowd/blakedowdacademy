"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { WeeklyGoalsBar } from "@/components/goals/WeeklyGoalsBar";
import { WEEKLY_GOAL_XP } from "@/lib/weeklyGoals";

// Depends on the signed-in user, which only exists in the browser.
const GoalAccountabilityModule = dynamic(
  () => import("@/components/Dashboard").then((m) => m.GoalAccountabilityModule),
  { ssr: false },
);

export default function GoalsPage() {
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-md flex-col overflow-x-hidden bg-stone-50">
      <header className="shrink-0 px-4 pt-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 py-1.5 pr-2 text-sm font-semibold text-stone-600 hover:text-stone-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Home
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-stone-900">Weekly goals</h1>
        <p className="mt-0.5 text-sm text-stone-500">
          Finish every goal by Sunday to earn {WEEKLY_GOAL_XP.toLocaleString()} XP. Goals reset each Monday.
        </p>
      </header>

      <div className="w-full flex-1 space-y-3 px-4 pb-32 pt-4">
        <WeeklyGoalsBar />
        <GoalAccountabilityModule />
      </div>
    </div>
  );
}
