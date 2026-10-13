"use client";

import { useEffect, useState } from "react";
import { Check, CheckCircle2, X } from "lucide-react";
import ProfileAvatar from "@/components/ProfileAvatar";
import {
  fetchPendingCommunity,
  reviewCommunityItem,
  timeAgo,
  type CommunityPerson,
  type PendingItems,
} from "@/lib/community";
import { fetchPendingEntries, reviewChallengeEntry, type PendingEntry } from "@/lib/communityChallenges";

function ReviewButtons({ onReview }: { onReview: (status: "approved" | "rejected") => void }) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={() => onReview("rejected")}
        className="flex items-center justify-center gap-1 rounded-xl border border-stone-200 py-2 text-sm font-semibold text-stone-600 hover:border-red-200 hover:text-red-600"
      >
        <X className="h-4 w-4" aria-hidden />
        Reject
      </button>
      <button
        type="button"
        onClick={() => onReview("approved")}
        className="flex items-center justify-center gap-1 rounded-xl bg-[#014421] py-2 text-sm font-semibold text-white"
      >
        <Check className="h-4 w-4" aria-hidden />
        Approve
      </button>
    </div>
  );
}

function Who({ person, at, label }: { person: CommunityPerson | undefined; at?: string; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <ProfileAvatar picture={person?.picture} name={person?.name} size={30} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-stone-900">{person?.name ?? "Golfer"}</p>
        <p className="text-[11px] text-stone-400">
          {label}
          {at ? ` · ${timeAgo(at)}` : ""}
        </p>
      </div>
    </div>
  );
}

export function CommunityApprovalsView({ onCountChange }: { onCountChange: (n: number) => void }) {
  const [items, setItems] = useState<PendingItems | null>(null);
  const [entries, setEntries] = useState<PendingEntry[]>([]);
  const [people, setPeople] = useState<Map<string, CommunityPerson>>(new Map());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([fetchPendingCommunity(), fetchPendingEntries()]).then(([community, pendingEntries]) => {
      if (cancelled) return;
      setItems(community.pending);
      setEntries(pendingEntries.entries);
      setPeople(new Map([...community.people, ...pendingEntries.people]));
      setError(community.error);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const total = (items?.posts.length ?? 0) + (items?.comments.length ?? 0) + entries.length;
  useEffect(() => {
    if (items) onCountChange(total);
  }, [items, total, onCountChange]);

  const reviewPost = async (id: string, status: "approved" | "rejected") => {
    const err = await reviewCommunityItem("community_posts", id, status);
    if (err) return setError(err);
    setItems((s) => (s ? { ...s, posts: s.posts.filter((p) => p.id !== id) } : s));
  };
  const reviewComment = async (id: string, status: "approved" | "rejected") => {
    const err = await reviewCommunityItem("community_comments", id, status);
    if (err) return setError(err);
    setItems((s) => (s ? { ...s, comments: s.comments.filter((c) => c.id !== id) } : s));
  };
  const reviewEntry = async (e: PendingEntry, status: "approved" | "rejected") => {
    const err = await reviewChallengeEntry(e.challengeId, e.userId, status);
    if (err) return setError(err);
    setEntries((list) => list.filter((x) => !(x.challengeId === e.challengeId && x.userId === e.userId)));
  };

  if (!items) {
    return <div className="h-24 animate-pulse rounded-2xl border border-stone-200 bg-white" aria-hidden />;
  }

  return (
    <div className="space-y-3">
      {error && <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{error}</p>}
      {total === 0 && !error && (
        <div className="rounded-2xl border border-stone-200 bg-white py-10 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" aria-hidden />
          <p className="mt-2 text-sm font-semibold text-stone-700">All caught up</p>
          <p className="text-xs text-stone-500">New player posts, comments and challenge scores will show here.</p>
        </div>
      )}

      {items.posts.map((p) => (
        <article key={p.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <Who person={people.get(p.authorId)} at={p.createdAt} label="Post" />
          <p className="mt-2 whitespace-pre-wrap break-words text-[15px] text-stone-800">{p.body}</p>
          <ReviewButtons onReview={(s) => void reviewPost(p.id, s)} />
        </article>
      ))}

      {items.comments.map((c) => (
        <article key={c.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <Who person={people.get(c.authorId)} at={c.createdAt} label="Comment" />
          {c.postBody && (
            <p className="mt-2 line-clamp-2 border-l-2 border-stone-200 pl-2 text-xs text-stone-400">
              On {people.get(c.postAuthorId)?.name ?? "a"}&apos;s post: {c.postBody}
            </p>
          )}
          <p className="mt-2 whitespace-pre-wrap break-words text-[15px] text-stone-800">{c.body}</p>
          <ReviewButtons onReview={(s) => void reviewComment(c.id, s)} />
        </article>
      ))}

      {entries.map((e) => (
        <article key={`${e.challengeId}:${e.userId}`} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <Who person={people.get(e.userId)} label={`Challenge entry · ${e.challengeTitle}`} />
          <p className="mt-2 text-[15px] font-semibold text-stone-900">
            {e.score != null ? `${e.score}${e.unit ? ` ${e.unit}` : ""}` : ""}
            {e.score != null && e.done ? " · " : ""}
            {e.done ? "Done" : ""}
          </p>
          {e.note && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-stone-600">“{e.note}”</p>}
          <ReviewButtons onReview={(s) => void reviewEntry(e, s)} />
        </article>
      ))}
    </div>
  );
}
