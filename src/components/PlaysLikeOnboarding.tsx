"use client";

import Link from "next/link";
import {
  ArrowRight,
  Gauge,
  Layers,
  Sparkles,
  Target,
  Wind,
} from "lucide-react";

export type PlaysLikeOnboardingProps = {
  /** Primary CTA — full-swing carry / bag setup. */
  bagSetupHref?: string;
  /** Optional link for launch-monitor / premium ball-flight fields. */
  advancedDataHref?: string;
  className?: string;
};

const ADVANCED_METRICS = [
  { label: "Peak height", detail: "Apex in metres — wind carry and hang time" },
  { label: "Launch angle", detail: "Trajectory baseline per club" },
  { label: "Spin rate", detail: "Slope and stopping-power modelling" },
] as const;

export function PlaysLikeOnboarding({
  bagSetupHref = "/virtual-caddie/bag",
  advancedDataHref = "/virtual-caddie/bag?advanced=1",
  className = "",
}: PlaysLikeOnboardingProps) {
  return (
    <div className={`mx-auto w-full max-w-2xl space-y-6 ${className}`.trim()}>
      <header className="space-y-2 text-center sm:text-left">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#014421]/80">
          Plays Like
        </p>
        <h2 className="text-2xl font-bold tracking-tight text-stone-900 sm:text-[1.65rem]">
          Build your personal distance model
        </h2>
        <p className="max-w-xl text-sm leading-relaxed text-stone-600">
          Plays Like adjusts for wind, elevation, and lie so you pick the right club with
          confidence. Start with your real carry numbers — then layer in launch-monitor data when
          you have it.
        </p>
      </header>

      {/* Required baseline */}
      <section
        aria-labelledby="plays-like-required-heading"
        className="relative overflow-hidden rounded-3xl border-2 border-[#014421]/25 bg-white shadow-md"
      >
        <div
          className="absolute inset-y-0 left-0 w-1.5 bg-[#014421]"
          aria-hidden
        />
        <div className="border-b border-[#014421]/10 bg-gradient-to-br from-[#014421]/[0.07] to-transparent px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-[#014421] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
              Required
            </span>
            <span className="text-xs font-medium text-stone-500">Absolute baseline</span>
          </div>
          <h3
            id="plays-like-required-heading"
            className="mt-2 text-lg font-semibold tracking-tight text-stone-900"
          >
            Full-swing club carry numbers
          </h3>
        </div>

        <div className="space-y-4 px-5 py-5 sm:px-6 sm:py-6">
          <p className="text-sm leading-relaxed text-stone-700">
            Enter carry distance for every club you might hit on course — in metres, on-course
            carry (not total roll). This is the foundation Plays Like uses for every wind and
            slope calculation.
          </p>

          <ul className="grid gap-2 sm:grid-cols-3">
            {[
              { icon: Target, text: "Carry-first, club by club" },
              { icon: Wind, text: "Powers wind & elevation" },
              { icon: Layers, text: "One setup, every round" },
            ].map(({ icon: Icon, text }) => (
              <li
                key={text}
                className="flex items-center gap-2 rounded-xl border border-stone-100 bg-stone-50/80 px-3 py-2.5 text-xs font-medium text-stone-700"
              >
                <Icon className="h-4 w-4 shrink-0 text-[#014421]" aria-hidden />
                {text}
              </li>
            ))}
          </ul>

          <Link
            href={bagSetupHref}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#014421] px-5 py-3.5 text-sm font-semibold text-white shadow-md transition hover:bg-[#013318] hover:shadow-lg active:scale-[0.99] sm:w-auto"
          >
            Set up my bag
            <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
          </Link>
        </div>
      </section>

      {/* Advanced / premium */}
      <section
        aria-labelledby="plays-like-advanced-heading"
        className="rounded-3xl border border-stone-200 bg-stone-50/50 shadow-sm"
      >
        <div className="border-b border-stone-200/80 px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-stone-300 bg-white px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-stone-600">
              <Sparkles className="h-3 w-3 text-amber-500" aria-hidden />
              Advanced
            </span>
            <span className="text-xs font-medium text-stone-400">Premium data · optional</span>
          </div>
          <h3
            id="plays-like-advanced-heading"
            className="mt-2 text-lg font-semibold tracking-tight text-stone-900"
          >
            Launch-monitor ball flight
          </h3>
        </div>

        <div className="space-y-4 px-5 py-5 sm:px-6 sm:py-6">
          <p className="text-sm leading-relaxed text-stone-600">
            If you practice with Trackman, FlightScope, or another launch monitor, add your measured
            ball-flight numbers. Plays Like uses them to tune wind and slope algorithms to{" "}
            <span className="font-medium text-stone-800">your</span> trajectory — not a generic tour
            template.
          </p>

          <ul className="space-y-2">
            {ADVANCED_METRICS.map(({ label, detail }) => (
              <li
                key={label}
                className="flex items-start gap-3 rounded-xl border border-stone-200/80 bg-white px-3.5 py-3"
              >
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-500">
                  <Gauge className="h-4 w-4" aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-stone-900">{label}</p>
                  <p className="text-xs leading-relaxed text-stone-500">{detail}</p>
                </div>
              </li>
            ))}
          </ul>

          <p className="text-xs leading-relaxed text-stone-500">
            You can complete bag carry first and return anytime. Advanced fields stay optional until
            you are ready.
          </p>

          <Link
            href={advancedDataHref}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-stone-200 bg-white px-5 py-3 text-sm font-semibold text-stone-800 shadow-sm transition hover:border-[#014421]/30 hover:bg-stone-50 active:scale-[0.99] sm:w-auto"
          >
            Add launch-monitor data
            <ArrowRight className="h-4 w-4 shrink-0 text-stone-400" aria-hidden />
          </Link>
        </div>
      </section>

      <p className="text-center text-[11px] leading-relaxed text-stone-400 sm:text-left">
        Data stays on your profile and improves every Plays Like recommendation as conditions
        change on course.
      </p>
    </div>
  );
}
