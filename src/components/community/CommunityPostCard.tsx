"use client";

import { useState } from "react";
import Link from "next/link";
import { Clock, Flag, HandFist, MessageCircle, Send, Star, Target, Trash2, Trophy, TrendingUp } from "lucide-react";
import ProfileAvatar from "@/components/ProfileAvatar";
import { TROPHY_LIST } from "@/lib/academyTrophies";
import { combineLabel } from "@/lib/communityPbSync";
import {
  addCommunityComment,
  deleteCommunityComment,
  deleteCommunityPost,
  setKnuckle,
  timeAgo,
  type CommunityComment,
  type CommunityPerson,
  type CommunityPost,
} from "@/lib/community";
import type { Challenge } from "@/lib/communityChallenges";

const MEDALS = ["🥇", "🥈", "🥉"];

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

function PendingBadge() {
  return (
    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
      Waiting for coach approval
    </span>
  );
}

function Highlight({ icon: Icon, tone, children }: { icon: typeof Trophy; tone: string; children: React.ReactNode }) {
  return (
    <div className={`mt-2 flex items-start gap-3 rounded-xl px-3 py-2.5 ${tone}`}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 text-sm">{children}</div>
    </div>
  );
}

function PostContent({
  post,
  people,
  challenges,
}: {
  post: CommunityPost;
  people: Map<string, CommunityPerson>;
  challenges: Map<string, Challenge>;
}) {
  const m = post.meta;
  switch (post.kind) {
    case "post":
      return <p className="mt-2 whitespace-pre-wrap break-words text-[15px] leading-snug text-stone-800">{post.body}</p>;
    case "trophy": {
      const ids = Array.isArray(m.trophies) ? m.trophies.map(str) : [];
      const trophies = ids.map((id) => TROPHY_LIST.find((t) => t.id === id || t.name === id)).filter(Boolean);
      return (
        <Highlight icon={Trophy} tone="bg-[#FFA500]/10 text-orange-800">
          <p className="font-semibold">
            Unlocked {trophies.length === 1 ? "a trophy" : `${trophies.length || ids.length} trophies`}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {trophies.map((t) => {
              const Icon = t!.icon;
              return (
                <span key={t!.id} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-stone-800 shadow-sm">
                  <Icon className="h-3.5 w-3.5 text-[#FFA500]" />
                  {t!.name}
                </span>
              );
            })}
          </div>
        </Highlight>
      );
    }
    case "round": {
      const score = num(m.score);
      const handicap = num(m.handicap);
      const nett = score != null && handicap != null ? Math.round((score - handicap) * 10) / 10 : null;
      return (
        <Highlight icon={Flag} tone="bg-[#014421]/[0.06] text-[#014421]">
          <p className="font-semibold">
            Shot {score ?? "–"}
            {str(m.course) ? ` at ${str(m.course)}` : ""}
          </p>
          {nett != null && <p className="text-xs text-stone-600">Nett {nett}</p>}
        </Highlight>
      );
    }
    case "combine_pb":
      return (
        <Highlight icon={Target} tone="bg-sky-50 text-sky-900">
          <p className="font-semibold">New personal best</p>
          <p className="text-xs text-sky-800">
            {combineLabel(m.combine)} · {str(m.display)}
          </p>
        </Highlight>
      );
    case "weekly_goals":
      return (
        <Highlight icon={Star} tone="bg-[#FFA500]/10 text-orange-800">
          <p className="font-semibold">Smashed all their weekly goals</p>
        </Highlight>
      );
    case "level_up":
      return (
        <Highlight icon={TrendingUp} tone="bg-violet-50 text-violet-900">
          <p className="font-semibold">Reached Level {str(m.level)}</p>
        </Highlight>
      );
    case "challenge": {
      const c = challenges.get(str(m.challenge_id));
      return (
        <Highlight icon={Clock} tone="bg-[#014421] text-white">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#FFC966]">New challenge</p>
          <p className="font-semibold">{c?.title ?? "Challenge"}</p>
          {c?.description && <p className="mt-0.5 text-xs text-white/80">{c.description}</p>}
          <Link href="/community?tab=challenges" className="mt-1.5 inline-block text-xs font-bold text-[#FFC966]">
            See the leaderboard →
          </Link>
        </Highlight>
      );
    }
    case "challenge_result": {
      const podium = Array.isArray(m.podium) ? (m.podium as Record<string, unknown>[]) : [];
      return (
        <Highlight icon={Trophy} tone="bg-[#FFA500]/10 text-orange-900">
          <p className="font-semibold">{str(m.title)} results</p>
          <ol className="mt-1 space-y-0.5">
            {podium.map((p, i) => (
              <li key={i} className="flex items-center justify-between gap-2 text-xs">
                <span>
                  {MEDALS[i]} {people.get(str(p.user_id))?.name ?? "Golfer"}
                </span>
                <span className="font-semibold tabular-nums">{str(p.display)}</span>
              </li>
            ))}
          </ol>
        </Highlight>
      );
    }
    default:
      return null;
  }
}

/** One line describing a post, for previews. */
export function postSummary(post: CommunityPost, challenges?: Map<string, Challenge>): string {
  const m = post.meta;
  switch (post.kind) {
    case "post":
      return post.body;
    case "trophy": {
      const ids = Array.isArray(m.trophies) ? m.trophies.map(str) : [];
      const first = TROPHY_LIST.find((t) => t.id === ids[0] || t.name === ids[0])?.name;
      if (ids.length > 1) return `Unlocked ${ids.length} trophies`;
      return first ? `Unlocked the ${first} trophy` : "Unlocked a trophy";
    }
    case "round":
      return `Shot ${str(m.score)}${str(m.course) ? ` at ${str(m.course)}` : ""}`;
    case "combine_pb":
      return `New PB: ${combineLabel(m.combine)} · ${str(m.display)}`;
    case "weekly_goals":
      return "Smashed all their weekly goals";
    case "level_up":
      return `Reached Level ${str(m.level)}`;
    case "challenge":
      return `New challenge: ${challenges?.get(str(m.challenge_id))?.title ?? "check it out"}`;
    case "challenge_result":
      return `${str(m.title)} results are in`;
    default:
      return "";
  }
}

function knuckleText(ids: string[], me: string, people: Map<string, CommunityPerson>): string {
  if (ids.length === 0) return "";
  const names = ids.map((id) => (id === me ? "You" : people.get(id)?.name.split(" ")[0] ?? "Golfer"));
  const ordered = [...names.filter((n) => n === "You"), ...names.filter((n) => n !== "You")];
  if (ordered.length <= 2) return ordered.join(" and ");
  return `${ordered.slice(0, 2).join(", ")} and ${ordered.length - 2} other${ordered.length - 2 === 1 ? "" : "s"}`;
}

export function CommunityPostCard({
  post,
  people,
  challenges,
  me,
  isCoach,
  onChange,
  onRemove,
}: {
  post: CommunityPost;
  people: Map<string, CommunityPerson>;
  challenges: Map<string, Challenge>;
  me: string;
  isCoach: boolean;
  onChange: (next: CommunityPost) => void;
  onRemove: (id: string) => void;
}) {
  const author = people.get(post.authorId);
  const mine = post.authorId === me;
  const knuckled = post.knuckles.includes(me);
  const visibleComments = post.comments.filter((c) => c.status === "approved" || c.authorId === me || isCoach);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const approved = post.status === "approved";

  const toggleKnuckle = async () => {
    const on = !knuckled;
    onChange({ ...post, knuckles: on ? [...post.knuckles, me] : post.knuckles.filter((id) => id !== me) });
    const err = await setKnuckle(post.id, me, on);
    if (err) {
      setError(err);
      onChange(post);
    }
  };

  const sendComment = async () => {
    if (!draft.trim() || busy) return;
    setBusy(true);
    setError(null);
    const { comment, error: err } = await addCommunityComment(post.id, draft);
    setBusy(false);
    if (err || !comment) {
      setError(err);
      return;
    }
    setDraft("");
    onChange({ ...post, comments: [...post.comments, comment] });
  };

  const removeComment = async (c: CommunityComment) => {
    if (!window.confirm("Delete this comment?")) return;
    const err = await deleteCommunityComment(c.id);
    if (err) setError(err);
    else onChange({ ...post, comments: post.comments.filter((x) => x.id !== c.id) });
  };

  const removePost = async () => {
    if (!window.confirm("Delete this post for everyone?")) return;
    const err = await deleteCommunityPost(post.id);
    if (err) setError(err);
    else onRemove(post.id);
  };

  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <header className="flex items-center gap-3">
        <ProfileAvatar picture={author?.picture} name={author?.name} size={38} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-stone-900">{author?.name ?? "Golfer"}</p>
          <p className="text-[11px] text-stone-400">{timeAgo(post.createdAt)}</p>
        </div>
        {(mine || isCoach) && (
          <button
            type="button"
            onClick={() => void removePost()}
            className="rounded-full p-1.5 text-stone-300 hover:bg-stone-100 hover:text-red-500"
            aria-label="Delete post"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </header>

      {post.status === "pending" && (
        <div className="mt-2">
          <PendingBadge />
        </div>
      )}

      <PostContent post={post} people={people} challenges={challenges} />

      {approved && (
        <>
          {post.knuckles.length > 0 && (
            <p className="mt-2.5 flex items-center gap-1 text-[11px] text-stone-500">
              <HandFist className="h-3.5 w-3.5 text-[#FFA500]" aria-hidden />
              {knuckleText(post.knuckles, me, people)}
            </p>
          )}
          <div className="mt-2 grid grid-cols-2 gap-1 border-t border-stone-100 pt-2">
            <button
              type="button"
              onClick={() => void toggleKnuckle()}
              aria-pressed={knuckled}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm font-semibold transition-colors ${
                knuckled ? "bg-[#FFA500]/15 text-orange-700" : "text-stone-500 hover:bg-stone-50"
              }`}
            >
              <HandFist className={`h-4 w-4 ${knuckled ? "scale-110" : ""}`} aria-hidden />
              Knuckles{post.knuckles.length > 0 ? ` ${post.knuckles.length}` : ""}
            </button>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm font-semibold text-stone-500 hover:bg-stone-50"
            >
              <MessageCircle className="h-4 w-4" aria-hidden />
              Comment{visibleComments.length > 0 ? ` ${visibleComments.length}` : ""}
            </button>
          </div>
        </>
      )}

      {approved && open && (
        <div className="mt-2 space-y-2">
          {visibleComments.map((c) => {
            const who = people.get(c.authorId);
            return (
              <div key={c.id} className="flex items-start gap-2">
                <ProfileAvatar picture={who?.picture} name={who?.name} size={26} />
                <div className="min-w-0 flex-1 rounded-xl bg-stone-50 px-3 py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-bold text-stone-800">{who?.name ?? "Golfer"}</span>
                    <span className="shrink-0 text-[10px] text-stone-400">{timeAgo(c.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm text-stone-700">{c.body}</p>
                  {c.status === "pending" && <PendingBadge />}
                </div>
                {(c.authorId === me || isCoach) && (
                  <button
                    type="button"
                    onClick={() => void removeComment(c)}
                    className="mt-1 rounded-full p-1 text-stone-300 hover:text-red-500"
                    aria-label="Delete comment"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={1000}
              rows={1}
              placeholder="Write a comment…"
              className="min-h-[38px] flex-1 resize-none rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm focus:border-[#014421] focus:bg-white focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void sendComment()}
              disabled={!draft.trim() || busy}
              className="rounded-xl bg-[#014421] p-2.5 text-white disabled:opacity-40"
              aria-label="Send comment"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          {!isCoach && <p className="text-[10px] text-stone-400">A coach checks comments before everyone sees them.</p>}
        </div>
      )}

      {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
    </article>
  );
}
