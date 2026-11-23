"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PartyPopper, Trophy, X } from "lucide-react";
import ProfileAvatar from "@/components/ProfileAvatar";
import {
  latestActiveWinnerAnnouncement,
  winnerAnnounceDaysLeft,
  winnerAnnounceDismissKey,
  type Challenge,
} from "@/lib/communityChallenges";
import type { CommunityPerson } from "@/lib/community";

function readDismissed(key: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(key: string) {
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* ignore */
  }
}

/**
 * Week-long challenge winner message:
 * - Winner sees a personal congrats
 * - Everyone else sees who won
 * Dismissible; auto-hides 7 days after the draw.
 */
export function ChallengeWinnerNotice({
  challenges,
  me,
  people,
}: {
  challenges: Challenge[];
  me: string;
  people: Map<string, CommunityPerson>;
}) {
  const announce = latestActiveWinnerAnnouncement(challenges);
  const dismissKey = announce ? winnerAnnounceDismissKey(announce) : "";
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (!announce || !dismissKey) {
      setHidden(true);
      return;
    }
    setHidden(readDismissed(dismissKey));
  }, [announce, dismissKey]);

  if (!announce?.winnerId || hidden) return null;

  const winner = people.get(announce.winnerId);
  const winnerName = winner?.name?.trim() || "Golfer";
  const isWinner = announce.winnerId === me;
  const daysLeft = winnerAnnounceDaysLeft(announce);

  const dismiss = () => {
    if (dismissKey) writeDismissed(dismissKey);
    setHidden(true);
  };

  if (isWinner) {
    return (
      <div className="relative overflow-hidden rounded-2xl bg-[#014421] px-4 py-4 text-white shadow-sm">
        <button
          type="button"
          onClick={dismiss}
          className="absolute right-2 top-2 rounded-full p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
        <div className="flex items-start gap-3 pr-6">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FFA500]/20">
            <Trophy className="h-5 w-5 text-[#FFC966]" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#FFC966]">You won!</p>
            <p className="mt-0.5 text-lg font-bold leading-snug">Congrats {winnerName.split(" ")[0]}!</p>
            <p className="mt-1 text-sm text-white/85">
              You were drawn as the winner of <span className="font-semibold text-white">{announce.title}</span>.
            </p>
            <Link
              href="/community?tab=challenges"
              className="mt-3 inline-flex items-center rounded-lg bg-[#FFA500] px-3 py-1.5 text-xs font-bold text-[#3d2600]"
            >
              See the challenge
            </Link>
            <p className="mt-2 text-[10px] text-white/55">
              This message stays up for {daysLeft} more day{daysLeft === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex items-start gap-3 rounded-2xl border border-[#FFA500]/30 bg-[#FFA500]/10 px-3 py-3 text-orange-950 shadow-sm">
      <button
        type="button"
        onClick={dismiss}
        className="absolute right-1.5 top-1.5 rounded-full p-1.5 text-orange-700/50 hover:bg-orange-200/40 hover:text-orange-900"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
      <PartyPopper className="mt-0.5 h-5 w-5 shrink-0 text-[#FFA500]" aria-hidden />
      <ProfileAvatar picture={winner?.picture} name={winnerName} size={36} />
      <div className="min-w-0 flex-1 pr-6">
        <p className="text-[11px] font-bold uppercase tracking-wide text-orange-700/80">Challenge winner</p>
        <p className="mt-0.5 text-sm font-bold leading-snug break-words">
          {winnerName} won {announce.title}
        </p>
        <Link href="/community?tab=challenges" className="mt-1 inline-block text-xs font-semibold text-orange-800 hover:underline">
          View results
        </Link>
        <p className="mt-1.5 text-[10px] text-orange-800/55">
          Disappears in {daysLeft} day{daysLeft === 1 ? "" : "s"}
        </p>
      </div>
    </div>
  );
}
