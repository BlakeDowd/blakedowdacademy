"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Send, Users } from "lucide-react";
import ProfileAvatar from "@/components/ProfileAvatar";
import { CommunityPostCard } from "@/components/community/CommunityPostCard";
import {
  createCommunityPost,
  fetchCommunityFeed,
  type CommunityFeed,
  type CommunityPerson,
  type CommunityPost,
} from "@/lib/community";
import type { Challenge } from "@/lib/communityChallenges";
import { syncMyCombinePbs } from "@/lib/communityPbSync";

export function CommunityFeedView({
  me,
  myName,
  myPicture,
  isCoach,
  challenges,
}: {
  me: string;
  myName: string;
  myPicture: string | null;
  isCoach: boolean;
  challenges: Map<string, Challenge>;
}) {
  const [feed, setFeed] = useState<CommunityFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { feed: next, error: err } = await fetchCommunityFeed();
    setFeed(next);
    setError(err);
  }, []);

  useEffect(() => {
    void syncMyCombinePbs(me).finally(() => void load());
  }, [me, load]);

  const updatePost = (next: CommunityPost) =>
    setFeed((f) => (f ? { ...f, posts: f.posts.map((p) => (p.id === next.id ? next : p)) } : f));
  const removePost = (id: string) => setFeed((f) => (f ? { ...f, posts: f.posts.filter((p) => p.id !== id) } : f));

  const post = async () => {
    if (!draft.trim() || posting) return;
    setPosting(true);
    setNotice(null);
    const { post: created, error: err } = await createCommunityPost(draft);
    setPosting(false);
    if (err || !created) {
      setNotice(err);
      return;
    }
    setDraft("");
    if (created.status === "pending") setNotice("Sent. Everyone will see it once a coach approves it.");
    setFeed((f) => {
      const people = new Map<string, CommunityPerson>(f?.people ?? []);
      people.set(me, { name: myName, picture: myPicture });
      return { posts: [created, ...(f?.posts ?? [])], people };
    });
  };

  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
        <div className="flex items-start gap-3">
          <ProfileAvatar picture={myPicture} name={myName} size={36} />
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={2000}
            rows={draft ? 3 : 2}
            placeholder={isCoach ? "Post to everyone…" : "Share something with everyone…"}
            className="flex-1 resize-none rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-[15px] focus:border-[#014421] focus:bg-white focus:outline-none"
          />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-[11px] text-stone-400">
            {isCoach ? "Goes straight to everyone." : "A coach checks posts before everyone sees them."}
          </p>
          <button
            type="button"
            onClick={() => void post()}
            disabled={!draft.trim() || posting}
            className="flex items-center gap-1.5 rounded-xl bg-[#014421] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Post
          </button>
        </div>
        {notice && <p className="mt-2 text-xs font-medium text-[#014421]">{notice}</p>}
      </section>

      {error ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{error}</p>
      ) : !feed ? (
        <div className="space-y-3" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl border border-stone-200 bg-white" />
          ))}
        </div>
      ) : feed.posts.length === 0 ? (
        <div className="rounded-2xl border border-stone-200 bg-white py-10 text-center">
          <Users className="mx-auto h-8 w-8 text-stone-300" aria-hidden />
          <p className="mt-2 text-sm font-semibold text-stone-700">Nothing here yet</p>
          <p className="text-xs text-stone-500">Trophies, rounds and PBs will show up here.</p>
        </div>
      ) : (
        feed.posts.map((p) => (
          <CommunityPostCard
            key={p.id}
            post={p}
            people={feed.people}
            challenges={challenges}
            me={me}
            isCoach={isCoach}
            onChange={updatePost}
            onRemove={removePost}
          />
        ))
      )}
    </div>
  );
}
