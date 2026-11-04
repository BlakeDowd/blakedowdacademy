"use client";

import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fraunces } from "next/font/google";
import { ArrowLeft, Crown, Flag, GraduationCap, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { isCoachEmail } from "@/lib/coachEmails";
import { STONECUTTERS_CADET_PROGRAM } from "@/lib/cadetProgram";
import { CADET_PROGRESSION_STANDARDS } from "@/lib/cadetScoring";
import { isCadetTerm, type CadetTerm } from "@/lib/cadetCurriculum";
import { CadetHoleGroupLeaderboards } from "@/components/coach/CadetHoleGroupLeaderboards";
import { CadetBulkScoreEntry } from "@/components/coach/CadetBulkScoreEntry";
import { CadetBulkScorecardEntry } from "@/components/coach/CadetBulkScorecardEntry";
import { CadetScorecardEntry } from "@/components/coach/CadetScorecardEntry";
import { CadetYearFramework } from "@/components/coach/CadetYearFramework";
import { CadetCurriculumProgress } from "@/components/coach/CadetCurriculumProgress";

const cadetDisplay = Fraunces({
  subsets: ["latin"],
  variable: "--font-cadet-display",
  display: "swap",
});

const noopSubscribe = () => () => undefined;

type CadetTab = "year_plan" | "results" | "on_course" | "curriculum";

function parseTab(raw: string | null): CadetTab | null {
  if (raw === "year_plan" || raw === "results" || raw === "on_course" || raw === "curriculum") {
    return raw;
  }
  if (raw === "skills") return "curriculum";
  return null;
}

function CoachCadetProgramInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading, profileLoading } = useAuth();
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const isCoach = hydrated && (isCoachEmail(user?.email) || user?.role === "coach");
  const program = STONECUTTERS_CADET_PROGRAM;
  const playerFromUrl = searchParams.get("player")?.trim() || null;
  const yearFromUrl = Number(searchParams.get("year") || "");
  const termRaw = Number(searchParams.get("term") || "");
  const termFromUrl: CadetTerm | null = isCadetTerm(termRaw) ? termRaw : null;
  const [tab, setTab] = useState<CadetTab>(() => parseTab(searchParams.get("tab")) || "year_plan");

  useEffect(() => {
    const fromUrl = parseTab(searchParams.get("tab"));
    if (fromUrl) setTab(fromUrl);
    else if (playerFromUrl) setTab("curriculum");
  }, [searchParams, playerFromUrl]);

  useEffect(() => {
    if (loading || profileLoading || !hydrated) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!isCoach) router.replace("/");
  }, [user, loading, profileLoading, hydrated, isCoach, router]);

  if (!hydrated || loading || profileLoading || !isCoach) {
    return (
      <div className="mx-auto flex min-h-[40vh] w-full max-w-md items-center justify-center bg-stone-50 text-sm text-stone-500">
        Loading…
      </div>
    );
  }

  return (
    <div className={`cadet-page mx-auto flex w-full min-w-0 max-w-md flex-col overflow-x-hidden ${cadetDisplay.variable}`}>
      <header className="shrink-0 px-4 pt-4">
        <Link
          href="/dashboard/coach"
          className="inline-flex items-center gap-1.5 py-1.5 pr-2 text-sm font-semibold text-stone-600 hover:text-stone-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Player reports
        </Link>

        <div className="cadet-hero mt-3 px-4 pb-4 pt-5">
          <div className="cadet-hero-inner">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/70">
                <Flag className="h-3 w-3 text-[#d6c4a1]" aria-hidden />
                Stonecutters Ridge
              </span>
              <span className="rounded-md bg-white/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#d6c4a1] ring-1 ring-white/15">
                {program.status}
              </span>
            </div>

            <div className="mt-4 flex items-end gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/12 text-white ring-1 ring-white/20">
                <GraduationCap className="h-6 w-6" aria-hidden />
              </span>
              <div className="min-w-0 pb-0.5">
                <h1 className="cadet-display text-[2.35rem] font-semibold text-white">{program.title}</h1>
                <p className="mt-1 text-sm leading-snug text-white/75">{program.subtitle}</p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl bg-black/15 px-2.5 py-3 ring-1 ring-white/10">
              <p className="mb-2 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">
                Pathway
              </p>
              <div className="cadet-path-rail relative z-[1] pt-2">
                {CADET_PROGRESSION_STANDARDS.map((step, i) => {
                  const isJm = step.id === "junior_member";
                  return (
                    <div
                      key={String(step.id)}
                      className="cadet-path-step flex min-w-0 flex-1 flex-col items-center"
                      style={{ animationDelay: `${120 + i * 70}ms` }}
                    >
                      <span
                        className={`relative flex h-9 w-full max-w-[3.1rem] items-center justify-center rounded-xl text-center font-bold ring-1 ${
                          isJm
                            ? "bg-[#d6c4a1] text-[#013319] ring-[#d6c4a1]/50"
                            : "bg-white/12 text-white ring-white/20"
                        } ${isJm ? "text-[9px] leading-tight" : "text-sm tabular-nums"}`}
                        title={isJm ? "Junior Member" : undefined}
                      >
                        {isJm ? (
                          <span className="absolute -top-2.5 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full bg-[#013319] text-[#d6c4a1] ring-2 ring-white/25">
                            <Crown className="h-3 w-3" aria-hidden />
                          </span>
                        ) : null}
                        {step.shortLabel}
                      </span>
                      <span
                        className={`mt-1.5 text-center font-semibold leading-tight ${
                          isJm
                            ? "max-w-[3.5rem] text-[7px] font-bold uppercase tracking-wide text-[#d6c4a1]"
                            : "text-[8px] uppercase tracking-wide text-white/50"
                        }`}
                      >
                        {isJm ? "Junior Member" : "hole"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] font-medium text-white/60">
              <Sparkles className="h-3 w-3 text-[#d6c4a1]" aria-hidden />
              Coach workspace · pathway, tests &amp; level-up
            </p>
          </div>
        </div>

        <div
          className="cadet-tab-shell cadet-panel-rise mt-3 flex gap-1 rounded-2xl border border-white/60 p-1 shadow-sm"
          role="tablist"
          style={{ animationDelay: "120ms" }}
        >
          {(
            [
              { id: "year_plan" as const, label: "Year plan" },
              { id: "results" as const, label: "Results" },
              { id: "on_course" as const, label: "Leaderboards" },
              { id: "curriculum" as const, label: "Curriculum" },
            ] as const
          ).map((t) => {
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTab(t.id)}
                className={`flex-1 rounded-xl px-2 py-2.5 text-[11px] font-bold transition sm:text-xs ${
                  on
                    ? "bg-[#014421] text-white shadow-sm"
                    : "text-stone-600 hover:bg-white/70"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </header>

      <div className="cadet-panel-rise space-y-3 px-4 pb-32 pt-4" style={{ animationDelay: "180ms" }}>
        {tab === "year_plan" ? (
          <CadetYearFramework />
        ) : tab === "results" ? (
          <div className="space-y-4">
            <CadetBulkScorecardEntry />
            <CadetScorecardEntry />
            <CadetBulkScoreEntry />
          </div>
        ) : tab === "on_course" ? (
          <CadetHoleGroupLeaderboards />
        ) : (
          <CadetCurriculumProgress
            initialPlayerId={playerFromUrl}
            initialYear={Number.isFinite(yearFromUrl) && yearFromUrl > 2000 ? yearFromUrl : undefined}
            initialTerm={termFromUrl ?? undefined}
          />
        )}
      </div>
    </div>
  );
}

export default function CoachCadetProgramPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-[40vh] w-full max-w-md items-center justify-center bg-stone-50 text-sm text-stone-500">
          Loading…
        </div>
      }
    >
      <CoachCadetProgramInner />
    </Suspense>
  );
}
