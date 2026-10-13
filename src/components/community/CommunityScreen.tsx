"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { CommunityApprovalsView } from "@/components/community/CommunityApprovalsView";
import { CommunityChallengesView } from "@/components/community/CommunityChallengesView";
import { CommunityFeedView } from "@/components/community/CommunityFeedView";
import { countPendingCommunity, isCommunityCoach } from "@/lib/community";
import { fetchChallenges, type Challenge } from "@/lib/communityChallenges";

type Tab = "feed" | "challenges" | "approvals";

export function CommunityScreen() {
  return (
    <Suspense fallback={null}>
      <CommunityScreenInner />
    </Suspense>
  );
}

function CommunityScreenInner() {
  const { user, loading } = useAuth();
  const isCoach = isCommunityCoach(user);
  const initialTab = useSearchParams().get("tab");
  const [tab, setTab] = useState<Tab>(initialTab === "challenges" || initialTab === "approvals" ? initialTab : "feed");
  const [challenges, setChallenges] = useState<Challenge[] | null>(null);
  const [challengeError, setChallengeError] = useState<string | null>(null);
  const [challengesVersion, setChallengesVersion] = useState(0);
  const [pending, setPending] = useState(0);

  const selectTab = (t: Tab) => {
    setTab(t);
    const url = new URL(window.location.href);
    if (t === "feed") url.searchParams.delete("tab");
    else url.searchParams.set("tab", t);
    window.history.replaceState(null, "", url);
  };

  useEffect(() => {
    let cancelled = false;
    void fetchChallenges().then(({ challenges: list, error }) => {
      if (cancelled) return;
      setChallenges(list);
      setChallengeError(error);
    });
    return () => {
      cancelled = true;
    };
  }, [challengesVersion]);

  useEffect(() => {
    if (isCoach) void countPendingCommunity().then(setPending);
  }, [isCoach]);

  const challengeMap = useMemo(() => new Map((challenges ?? []).map((c) => [c.id, c])), [challenges]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "feed", label: "Feed" },
    { id: "challenges", label: "Challenges" },
    ...(isCoach ? [{ id: "approvals" as const, label: pending > 0 ? `Approvals (${pending})` : "Approvals" }] : []),
  ];

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
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-stone-900">Community</h1>
        <p className="mt-0.5 text-sm text-stone-500">Knuckle each other&apos;s wins, chat and take on challenges.</p>

        <div role="tablist" className={`mt-3 grid gap-1 rounded-xl bg-stone-200/60 p-1 ${tabs.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => selectTab(t.id)}
              className={`rounded-lg py-1.5 text-sm font-semibold transition-colors ${
                tab === t.id ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="w-full flex-1 px-4 pb-32 pt-3">
        {loading || !user ? (
          <div className="h-32 animate-pulse rounded-2xl border border-stone-200 bg-white" aria-hidden />
        ) : tab === "feed" ? (
          <CommunityFeedView
            me={user.id}
            myName={user.fullName || "You"}
            myPicture={user.preferredIconId ?? null}
            isCoach={isCoach}
            challenges={challengeMap}
          />
        ) : tab === "challenges" ? (
          <CommunityChallengesView
            me={user.id}
            isCoach={isCoach}
            challenges={challenges}
            error={challengeError}
            onReload={() => setChallengesVersion((v) => v + 1)}
          />
        ) : (
          <CommunityApprovalsView onCountChange={setPending} />
        )}
      </div>
    </div>
  );
}
