import { createClient } from "@/lib/supabase/client";
import { isCoachEmail } from "@/lib/coachEmails";

export const COMMUNITY_MIGRATION = "supabase/migrations/20261013190000_community.sql";

export type PostKind =
  | "post"
  | "trophy"
  | "round"
  | "combine_pb"
  | "weekly_goals"
  | "level_up"
  | "challenge"
  | "challenge_result";

export type ReviewStatus = "pending" | "approved" | "rejected";

export type CommunityComment = {
  id: string;
  postId: string;
  authorId: string;
  body: string;
  status: ReviewStatus;
  createdAt: string;
};

export type CommunityPost = {
  id: string;
  authorId: string;
  kind: PostKind;
  body: string;
  meta: Record<string, unknown>;
  status: ReviewStatus;
  createdAt: string;
  knuckles: string[];
  comments: CommunityComment[];
};

export type CommunityPerson = { name: string; picture: string | null };

export type CommunityFeed = {
  posts: CommunityPost[];
  people: Map<string, CommunityPerson>;
};

type Row = Record<string, unknown>;

export const isCommunityCoach = (user: { email?: string | null; role?: string | null } | null | undefined) =>
  isCoachEmail(user?.email) || user?.role === "coach";

/** Friendly error, pointing at the migration when the tables aren't there yet. */
export function communityError(error: { message?: string; code?: string } | null | undefined): string | null {
  if (!error) return null;
  const msg = error.message ?? "Something went wrong";
  if (error.code === "42P01" || error.code === "PGRST205" || /community_|does not exist|schema cache/i.test(msg)) {
    return `Community isn't set up yet. Run ${COMMUNITY_MIGRATION} in Supabase.`;
  }
  return msg;
}

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

export function timeAgo(iso: string, now = Date.now()): string {
  const ms = now - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function toComment(r: Row): CommunityComment {
  return {
    id: str(r.id),
    postId: str(r.post_id),
    authorId: str(r.author_id),
    body: str(r.body),
    status: (str(r.status) || "approved") as ReviewStatus,
    createdAt: str(r.created_at),
  };
}

function toPost(r: Row): CommunityPost {
  const meta = r.meta && typeof r.meta === "object" && !Array.isArray(r.meta) ? (r.meta as Record<string, unknown>) : {};
  return {
    id: str(r.id),
    authorId: str(r.author_id),
    kind: str(r.kind) as PostKind,
    body: str(r.body),
    meta,
    status: (str(r.status) || "approved") as ReviewStatus,
    createdAt: str(r.created_at),
    knuckles: [],
    comments: [],
  };
}

export async function loadPeople(ids: Iterable<string>): Promise<Map<string, CommunityPerson>> {
  const unique = [...new Set([...ids].filter(Boolean))];
  const people = new Map<string, CommunityPerson>();
  if (unique.length === 0) return people;
  const { data } = await createClient().from("profiles").select("id, full_name, preferred_icon_id").in("id", unique);
  for (const p of (data ?? []) as Row[]) {
    people.set(str(p.id), { name: str(p.full_name).trim() || "Golfer", picture: str(p.preferred_icon_id) || null });
  }
  return people;
}

/** Newest posts with their knuckles, comments and the people involved. */
export async function fetchCommunityFeed(limit = 30): Promise<{ feed: CommunityFeed | null; error: string | null }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("community_posts")
    .select("*")
    .neq("status", "rejected")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return { feed: null, error: communityError(error) };

  const posts = ((data ?? []) as Row[]).map(toPost);
  const ids = posts.map((p) => p.id);
  if (ids.length > 0) {
    const [knuckles, comments] = await Promise.all([
      supabase.from("community_knuckles").select("post_id, user_id").in("post_id", ids),
      supabase
        .from("community_comments")
        .select("*")
        .in("post_id", ids)
        .neq("status", "rejected")
        .order("created_at", { ascending: true }),
    ]);
    const byId = new Map(posts.map((p) => [p.id, p]));
    for (const k of (knuckles.data ?? []) as Row[]) byId.get(str(k.post_id))?.knuckles.push(str(k.user_id));
    for (const c of (comments.data ?? []) as Row[]) byId.get(str(c.post_id))?.comments.push(toComment(c));
  }

  const people = await loadPeople(
    posts.flatMap((p) => [p.authorId, ...p.knuckles, ...p.comments.map((c) => c.authorId), ...podiumIds(p)]),
  );
  return { feed: { posts, people }, error: null };
}

function podiumIds(p: CommunityPost): string[] {
  const podium = p.meta.podium;
  return Array.isArray(podium) ? podium.map((x) => str((x as Row).user_id)) : [];
}

export async function createCommunityPost(body: string): Promise<{ post: CommunityPost | null; error: string | null }> {
  const { data, error } = await createClient()
    .from("community_posts")
    .insert({ kind: "post", body: body.trim() })
    .select("*")
    .single();
  if (error) return { post: null, error: communityError(error) };
  return { post: toPost(data as Row), error: null };
}

export async function deleteCommunityPost(id: string): Promise<string | null> {
  const { error } = await createClient().from("community_posts").delete().eq("id", id);
  return communityError(error);
}

export async function setKnuckle(postId: string, userId: string, on: boolean): Promise<string | null> {
  const supabase = createClient();
  const { error } = on
    ? await supabase.from("community_knuckles").upsert({ post_id: postId, user_id: userId }, { ignoreDuplicates: true })
    : await supabase.from("community_knuckles").delete().eq("post_id", postId).eq("user_id", userId);
  return communityError(error);
}

export async function addCommunityComment(
  postId: string,
  body: string,
): Promise<{ comment: CommunityComment | null; error: string | null }> {
  const { data, error } = await createClient()
    .from("community_comments")
    .insert({ post_id: postId, body: body.trim() })
    .select("*")
    .single();
  if (error) return { comment: null, error: communityError(error) };
  return { comment: toComment(data as Row), error: null };
}

export async function deleteCommunityComment(id: string): Promise<string | null> {
  const { error } = await createClient().from("community_comments").delete().eq("id", id);
  return communityError(error);
}

export type PendingItems = {
  posts: CommunityPost[];
  comments: (CommunityComment & { postBody: string; postAuthorId: string })[];
};

/** Coach view: player posts and comments waiting for approval. */
export async function fetchPendingCommunity(): Promise<{ pending: PendingItems; people: Map<string, CommunityPerson>; error: string | null }> {
  const supabase = createClient();
  const [posts, comments] = await Promise.all([
    supabase.from("community_posts").select("*").eq("status", "pending").order("created_at", { ascending: true }),
    supabase.from("community_comments").select("*").eq("status", "pending").order("created_at", { ascending: true }),
  ]);
  const error = communityError(posts.error) ?? communityError(comments.error);
  const pendingPosts = ((posts.data ?? []) as Row[]).map(toPost);
  const rawComments = ((comments.data ?? []) as Row[]).map(toComment);

  const parentIds = [...new Set(rawComments.map((c) => c.postId))];
  const parents = new Map<string, CommunityPost>();
  if (parentIds.length > 0) {
    const { data } = await supabase.from("community_posts").select("*").in("id", parentIds);
    for (const r of (data ?? []) as Row[]) parents.set(str(r.id), toPost(r));
  }
  const pendingComments = rawComments.map((c) => ({
    ...c,
    postBody: parents.get(c.postId)?.body || "",
    postAuthorId: parents.get(c.postId)?.authorId || "",
  }));

  const people = await loadPeople([
    ...pendingPosts.map((p) => p.authorId),
    ...pendingComments.flatMap((c) => [c.authorId, c.postAuthorId]),
  ]);
  return { pending: { posts: pendingPosts, comments: pendingComments }, people, error };
}

export async function countPendingCommunity(): Promise<number> {
  const supabase = createClient();
  const [posts, comments, entries] = await Promise.all([
    supabase.from("community_posts").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("community_comments").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("community_challenge_entries").select("user_id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  return (posts.count ?? 0) + (comments.count ?? 0) + (entries.count ?? 0);
}

export async function reviewCommunityItem(
  table: "community_posts" | "community_comments",
  id: string,
  status: "approved" | "rejected",
): Promise<string | null> {
  const { error } = await createClient().from(table).update({ status }).eq("id", id);
  return communityError(error);
}
