"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

export type PlaysLikeOnboardingProps = {
  /** Primary CTA — full-swing carry / bag setup. */
  bagSetupHref?: string;
  /** Shot Blueprint (on-course calculator). */
  blueprintHref?: string;
  /** Optional link for launch-monitor / premium ball-flight fields. */
  advancedDataHref?: string;
  className?: string;
};

const STEPS = [
  {
    n: "1",
    title: "Set your bag",
    body: "Enter carry distance for each club (metres, carry — not total).",
  },
  {
    n: "2",
    title: "Open Shot Blueprint",
    body: "On the tee or approach, put in the yardage to the target.",
  },
  {
    n: "3",
    title: "Add wind & slope",
    body: "Dial conditions. Plays Like shows a plays-like distance and the club to hit.",
  },
] as const;

export function PlaysLikeOnboarding({
  bagSetupHref = "/virtual-caddie/bag",
  blueprintHref = "/virtual-caddie/shot-blueprint",
  advancedDataHref = "/virtual-caddie/bag?advanced=1",
  className = "",
}: PlaysLikeOnboardingProps) {
  return (
    <div className={`mx-auto w-full max-w-2xl space-y-5 ${className}`.trim()}>
      <header className="space-y-1.5">
        <h2 className="text-xl font-bold tracking-tight text-stone-900 sm:text-2xl">
          How to use it
        </h2>
        <p className="text-sm leading-snug text-stone-600">
          Get a club for the shot in front of you — adjusted for wind and slope from{" "}
          <span className="font-medium text-stone-800">your</span> carry numbers.
        </p>
      </header>

      <ol className="space-y-3">
        {STEPS.map((step) => (
          <li
            key={step.n}
            className="flex gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3.5 shadow-sm"
          >
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#014421] text-xs font-bold text-white"
              aria-hidden
            >
              {step.n}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-sm font-semibold text-stone-900">{step.title}</p>
              <p className="mt-0.5 text-sm leading-snug text-stone-600">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="flex flex-col gap-2.5 sm:flex-row">
        <Link
          href={bagSetupHref}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-[#014421]/25 bg-white px-5 py-3.5 text-sm font-semibold text-[#014421] transition hover:bg-[#014421]/[0.04] active:scale-[0.99]"
        >
          Set up my bag
          <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
        </Link>
        <Link
          href={blueprintHref}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#014421] px-5 py-3.5 text-sm font-semibold text-white shadow-md transition hover:bg-[#013318] active:scale-[0.99]"
        >
          Open Shot Blueprint
          <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
        </Link>
      </div>

      <p className="text-center text-xs text-stone-500 sm:text-left">
        Have Trackman / FlightScope numbers?{" "}
        <Link
          href={advancedDataHref}
          className="font-semibold text-[#014421] underline-offset-2 hover:underline"
        >
          Add launch-monitor data
        </Link>{" "}
        (optional).
      </p>
    </div>
  );
}
