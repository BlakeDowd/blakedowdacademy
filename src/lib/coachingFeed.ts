import type { SupabaseClient } from "@supabase/supabase-js";
import * as tus from "tus-js-client";
import { createClient } from "@/lib/supabase/client";
import type { CoachingVideoKind } from "@/lib/bunnyCollections";

export type CoachingPost = {
  id: string;
  student_id: string;
  author_id: string | null;
  parent_id: string | null;
  announcement_id: string | null;
  body: string | null;
  title: string | null;
  bunny_video_id: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  image_path: string | null;
  extra_videos: CoachingVideoRef[] | null;
  key_issues: string | null;
  contact_info: string | null;
  directional_misses: string | null;
  created_at: string;
};

export type CoachingVideoRef = { bunny_video_id: string; storage_path: string | null };

export type CoachingPostVideo = {
  bunny_video_id: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
};

export const MAX_VIDEOS_PER_POST = 20;

/** Every video on a post, in order: the main one first, then any extras. */
export function postVideos(post: CoachingPost): CoachingPostVideo[] {
  const list: CoachingPostVideo[] = [];
  if (post.bunny_video_id || (post.storage_bucket && post.storage_path)) {
    list.push({
      bunny_video_id: post.bunny_video_id,
      storage_bucket: post.storage_bucket,
      storage_path: post.storage_path,
    });
  }
  for (const v of post.extra_videos ?? []) {
    if (!v?.bunny_video_id) continue;
    list.push({
      bunny_video_id: v.bunny_video_id,
      storage_bucket: v.storage_path ? "swing-submissions" : null,
      storage_path: v.storage_path,
    });
  }
  return list;
}

export type CoachingThreadSummary = {
  studentId: string;
  studentName: string;
  latest: CoachingPost | null;
  postCount: number;
  unread: boolean;
};

const POST_COLUMNS =
  "id, student_id, author_id, parent_id, announcement_id, body, title, bunny_video_id, storage_bucket, storage_path, image_path, extra_videos, key_issues, contact_info, directional_misses, created_at";

export type CoachingAnnouncement = {
  id: string;
  author_id: string | null;
  body: string | null;
  bunny_video_id: string | null;
  extra_videos: CoachingVideoRef[] | null;
  image_path: string | null;
  pinned_until: string | null;
  created_at: string;
};

const ANNOUNCEMENT_COLUMNS = "id, author_id, body, bunny_video_id, extra_videos, image_path, pinned_until, created_at";

export const ANNOUNCEMENT_PHOTO_FOLDER = "announcements";

export const isAnnouncementPinned = (a: Pick<CoachingAnnouncement, "pinned_until">, now = Date.now()) =>
  Boolean(a.pinned_until && Date.parse(a.pinned_until) > now);

/** Announcements reuse the post video/photo shape so the same media components render them. */
export function announcementAsPost(a: CoachingAnnouncement, studentId: string): CoachingPost {
  return {
    id: a.id,
    student_id: studentId,
    author_id: a.author_id,
    parent_id: null,
    announcement_id: null,
    body: a.body,
    title: null,
    bunny_video_id: a.bunny_video_id,
    storage_bucket: null,
    storage_path: null,
    image_path: a.image_path,
    extra_videos: a.extra_videos,
    key_issues: null,
    contact_info: null,
    directional_misses: null,
    created_at: a.created_at,
  };
}

export async function fetchAnnouncements(supabase: SupabaseClient, limit = 30): Promise<CoachingAnnouncement[]> {
  const { data, error } = await supabase
    .from("coaching_announcements")
    .select(ANNOUNCEMENT_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  rethrow(error);
  return (data ?? []) as CoachingAnnouncement[];
}

/** Replies to announcements, oldest first. RLS limits players to their own. */
export async function fetchAnnouncementEntries(
  supabase: SupabaseClient,
  announcementIds: string[],
): Promise<Map<string, CoachingPost[]>> {
  const byAnnouncement = new Map<string, CoachingPost[]>();
  if (!announcementIds.length) return byAnnouncement;
  const { data, error } = await supabase
    .from("coaching_posts")
    .select(POST_COLUMNS)
    .in("announcement_id", announcementIds)
    .order("created_at", { ascending: true });
  rethrow(error);
  for (const r of (data ?? []) as CoachingPost[]) {
    const list = byAnnouncement.get(r.announcement_id!) ?? [];
    list.push(r);
    byAnnouncement.set(r.announcement_id!, list);
  }
  return byAnnouncement;
}

export async function createAnnouncement(
  supabase: SupabaseClient,
  input: {
    authorId: string;
    body?: string;
    bunnyVideoId?: string | null;
    extraVideos?: CoachingVideoRef[];
    imagePath?: string | null;
    pinnedUntil: string | null;
  },
): Promise<CoachingAnnouncement> {
  const { data, error } = await supabase
    .from("coaching_announcements")
    .insert({
      author_id: input.authorId,
      body: input.body?.trim() || null,
      bunny_video_id: input.bunnyVideoId ?? null,
      extra_videos: input.extraVideos ?? [],
      image_path: input.imagePath ?? null,
      pinned_until: input.pinnedUntil,
    })
    .select(ANNOUNCEMENT_COLUMNS)
    .single();
  rethrow(error);
  return data as CoachingAnnouncement;
}

export const FEED_PAGE_SIZE = 20;

export const isCoachPost = (p: Pick<CoachingPost, "author_id" | "student_id">) => p.author_id !== p.student_id;

export const MAX_COACHING_VIDEO_BYTES = 200 * 1024 * 1024;
/** Coach uploads go straight to Bunny (no raw copy in Supabase storage), so long lesson videos fit. */
export const MAX_COACH_VIDEO_BYTES = 5 * 1024 * 1024 * 1024;

export function maxVideoBytes(isCoach: boolean): number {
  return isCoach ? MAX_COACH_VIDEO_BYTES : MAX_COACHING_VIDEO_BYTES;
}

export function formatVideoLimit(bytes: number): string {
  return bytes >= 1024 * 1024 * 1024 ? `${Math.round(bytes / 1024 / 1024 / 1024)} GB` : `${Math.round(bytes / 1024 / 1024)} MB`;
}

export class CoachingSetupError extends Error {}

function rethrow(error: { message?: string; code?: string } | null): void {
  if (!error) return;
  const msg = error.message || "Something went wrong";
  if (/announcement/.test(msg)) {
    throw new CoachingSetupError(
      `Announcements need a database update. Run supabase/migrations/20261006010000_coaching_announcements.sql in Supabase. (${msg})`,
    );
  }
  if (/is_game_plan|extra_videos_shape/.test(msg)) {
    throw new CoachingSetupError(
      `This needs a database update. Run supabase/migrations/20261009120000_coaching_more_videos_and_game_plan.sql in Supabase. (${msg})`,
    );
  }
  if (/extra_videos/.test(msg)) {
    throw new CoachingSetupError(
      `Multiple videos need a database update. Run supabase/migrations/20261006000000_coaching_multi_video.sql in Supabase. (${msg})`,
    );
  }
  if (/image_path|coaching_posts_has_content/.test(msg)) {
    throw new CoachingSetupError(
      `Photos need a database update. Run supabase/migrations/20261005220000_coaching_photos.sql in Supabase. (${msg})`,
    );
  }
  if (/parent_id/.test(msg)) {
    throw new CoachingSetupError(
      "Replies need a database update. Run supabase/migrations/20261005210000_coaching_replies.sql in Supabase.",
    );
  }
  if (error.code === "PGRST205" || error.code === "42P01" || /coaching_(posts|reads)/.test(msg)) {
    throw new CoachingSetupError(
      "The coaching feed needs its database update. Run supabase/migrations/20261005200000_coaching_feed.sql in Supabase.",
    );
  }
  throw new Error(msg);
}

export async function fetchProfileNames(
  supabase: SupabaseClient,
  ids: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const names = new Map<string, string>();
  if (!unique.length) return names;
  const { data } = await supabase.from("profiles").select("id, full_name").in("id", unique);
  for (const row of (data ?? []) as { id: string; full_name: string | null }[]) {
    names.set(row.id, row.full_name?.trim() || "Golfer");
  }
  return names;
}

/**
 * Top-level posts, newest first. Pass `studentId` for one space, or omit it for every space
 * the caller can see (RLS limits students to their own).
 */
export async function fetchPosts(
  supabase: SupabaseClient,
  opts: { studentId?: string; before?: string } = {},
): Promise<CoachingPost[]> {
  let query = supabase
    .from("coaching_posts")
    .select(POST_COLUMNS)
    .is("parent_id", null)
    .is("announcement_id", null)
    .order("created_at", { ascending: false })
    .limit(FEED_PAGE_SIZE);
  if (opts.studentId) query = query.eq("student_id", opts.studentId);
  if (opts.before) query = query.lt("created_at", opts.before);
  const { data, error } = await query;
  rethrow(error);
  return (data ?? []) as CoachingPost[];
}

export async function fetchReplies(
  supabase: SupabaseClient,
  postIds: string[],
): Promise<Map<string, CoachingPost[]>> {
  const byParent = new Map<string, CoachingPost[]>();
  if (!postIds.length) return byParent;
  const { data, error } = await supabase
    .from("coaching_posts")
    .select(POST_COLUMNS)
    .in("parent_id", postIds)
    .order("created_at", { ascending: true });
  rethrow(error);
  for (const r of (data ?? []) as CoachingPost[]) {
    const list = byParent.get(r.parent_id!) ?? [];
    list.push(r);
    byParent.set(r.parent_id!, list);
  }
  return byParent;
}

export type ActivityItem = CoachingPost & { unread: boolean; announcement?: boolean };

/** Posts and replies from other people, newest first. Players also see coach announcements. */
export async function fetchActivity(
  supabase: SupabaseClient,
  userId: string,
  opts: { includeAnnouncements?: boolean } = {},
): Promise<ActivityItem[]> {
  const { data, error } = await supabase
    .from("coaching_posts")
    .select(POST_COLUMNS)
    .neq("author_id", userId)
    .order("created_at", { ascending: false })
    .limit(150);
  rethrow(error);
  const reads = await fetchReads(supabase, userId);
  const items: ActivityItem[] = ((data ?? []) as CoachingPost[]).map((p) => ({
    ...p,
    unread: Date.parse(p.created_at) > (reads.get(p.student_id) ?? 0),
  }));
  if (opts.includeAnnouncements) {
    const announcements = await fetchAnnouncements(supabase, 20).catch(() => []);
    for (const a of announcements) {
      items.push({
        ...announcementAsPost(a, userId),
        announcement: true,
        unread: Date.parse(a.created_at) > (reads.get(userId) ?? 0),
      });
    }
    items.sort((x, y) => y.created_at.localeCompare(x.created_at));
  }
  return items;
}

export type CoachingSpaceSummary = {
  /** Space key: the player's user id, or the space id while their invite is waiting. */
  studentId: string;
  name: string;
  lastActivityAt: string | null;
  unread: boolean;
  /** Set when the coach created or invited this space (see coachingSpaces.ts). */
  space?: { id: string; inviteCode: string; pending: boolean; createdAt: string };
};

async function fetchReads(supabase: SupabaseClient, userId: string): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("coaching_reads")
    .select("student_id, last_read_at")
    .eq("user_id", userId);
  rethrow(error);
  const reads = new Map<string, number>();
  for (const row of (data ?? []) as { student_id: string; last_read_at: string }[]) {
    reads.set(row.student_id, Date.parse(row.last_read_at));
  }
  return reads;
}

const isUnreadFor = (post: CoachingPost | null | undefined, userId: string, lastRead: number | undefined) =>
  Boolean(post && post.author_id !== userId && Date.parse(post.created_at) > (lastRead ?? 0));

/** Coach inbox: every student with a space, most recent activity first. */
export async function fetchCoachInbox(
  supabase: SupabaseClient,
  coachId: string,
): Promise<CoachingThreadSummary[]> {
  const { data, error } = await supabase
    .from("coaching_posts")
    .select(POST_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(1000);
  rethrow(error);
  const posts = (data ?? []) as CoachingPost[];
  const reads = await fetchReads(supabase, coachId);

  const byStudent = new Map<string, { latest: CoachingPost; count: number; unread: boolean }>();
  for (const p of posts) {
    const entry = byStudent.get(p.student_id);
    if (entry) {
      entry.count += 1;
      continue;
    }
    byStudent.set(p.student_id, {
      latest: p,
      count: 1,
      unread: isUnreadFor(p, coachId, reads.get(p.student_id)),
    });
  }
  const names = await fetchProfileNames(supabase, [...byStudent.keys()]);
  return [...byStudent.entries()].map(([studentId, e]) => ({
    studentId,
    studentName: names.get(studentId) ?? "Golfer",
    latest: e.latest,
    postCount: e.count,
    unread: e.unread,
  }));
}

/** Students: posts from coaches since they last opened the tab. Coaches: spaces with unread posts. */
export async function fetchUnreadCount(
  supabase: SupabaseClient,
  userId: string,
  isCoach: boolean,
): Promise<number> {
  try {
    if (isCoach) {
      const inbox = await fetchCoachInbox(supabase, userId);
      return inbox.filter((t) => t.unread).length;
    }
    const reads = await fetchReads(supabase, userId);
    const since = new Date(reads.get(userId) ?? 0).toISOString();
    const { count, error } = await supabase
      .from("coaching_posts")
      .select("id", { count: "exact", head: true })
      .eq("student_id", userId)
      .neq("author_id", userId)
      .gt("created_at", since);
    if (error) return 0;
    const { count: announcementCount } = await supabase
      .from("coaching_announcements")
      .select("id", { count: "exact", head: true })
      .gt("created_at", since);
    return (count ?? 0) + (announcementCount ?? 0);
  } catch {
    return 0;
  }
}

export async function markThreadRead(supabase: SupabaseClient, userId: string, studentId: string): Promise<void> {
  await supabase
    .from("coaching_reads")
    .upsert(
      { user_id: userId, student_id: studentId, last_read_at: new Date().toISOString() },
      { onConflict: "user_id,student_id" },
    );
}

export async function markAllRead(supabase: SupabaseClient, userId: string, studentIds: string[]): Promise<void> {
  const unique = [...new Set(studentIds)];
  if (!unique.length) return;
  const now = new Date().toISOString();
  await supabase
    .from("coaching_reads")
    .upsert(
      unique.map((studentId) => ({ user_id: userId, student_id: studentId, last_read_at: now })),
      { onConflict: "user_id,student_id" },
    );
}

export type NewCoachingPost = {
  studentId: string;
  authorId: string;
  parentId?: string | null;
  announcementId?: string | null;
  body?: string;
  title?: string;
  bunnyVideoId?: string | null;
  storagePath?: string | null;
  imagePath?: string | null;
  extraVideos?: CoachingVideoRef[];
  keyIssues?: string;
  contactInfo?: string;
  directionalMisses?: string;
  /** End-of-lesson "what to work on" video, pinned on the player's profile. Coaches only. */
  isGamePlan?: boolean;
};

export async function createPost(supabase: SupabaseClient, input: NewCoachingPost): Promise<CoachingPost> {
  const clean = (v?: string | null) => (v && v.trim() ? v.trim() : null);
  const { data, error } = await supabase
    .from("coaching_posts")
    .insert({
      student_id: input.studentId,
      author_id: input.authorId,
      ...(input.parentId ? { parent_id: input.parentId } : {}),
      ...(input.announcementId ? { announcement_id: input.announcementId } : {}),
      body: clean(input.body),
      title: clean(input.title),
      bunny_video_id: input.bunnyVideoId ?? null,
      storage_bucket: input.storagePath ? "swing-submissions" : null,
      storage_path: input.storagePath ?? null,
      ...(input.imagePath ? { image_path: input.imagePath } : {}),
      ...(input.extraVideos?.length ? { extra_videos: input.extraVideos } : {}),
      key_issues: clean(input.keyIssues),
      contact_info: clean(input.contactInfo),
      directional_misses: clean(input.directionalMisses),
      ...(input.isGamePlan ? { is_game_plan: true } : {}),
    })
    .select(POST_COLUMNS)
    .single();
  rethrow(error);
  return data as CoachingPost;
}

/** A player's game plans, newest first. */
export async function fetchGamePlans(
  supabase: SupabaseClient,
  studentId: string,
  limit = 6,
): Promise<CoachingPost[]> {
  const { data, error } = await supabase
    .from("coaching_posts")
    .select(POST_COLUMNS)
    .eq("student_id", studentId)
    .eq("is_game_plan", true)
    .is("parent_id", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  rethrow(error);
  return (data ?? []) as CoachingPost[];
}

export async function authJsonHeaders(): Promise<Record<string, string>> {
  const { data } = await createClient().auth.getSession();
  const token = data.session?.access_token;
  return token
    ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
    : { "Content-Type": "application/json" };
}

export function isLikelyVideoFile(file: File): boolean {
  if (file.type.startsWith("video/")) return true;
  // iOS Photos often leaves the type empty.
  return /\.(mp4|mov|m4v|webm|avi|mpeg|mpg)$/i.test(file.name);
}

export const COACHING_PHOTO_BUCKET = "coaching-photos";
export const MAX_COACHING_PHOTO_BYTES = 25 * 1024 * 1024;

export function isLikelyImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
}

/** Scales phone photos down to a sensible size. Falls back to the original if the browser can't decode it. */
async function shrinkPhoto(file: File, maxEdge = 2048): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

/** Uploads into the student's private folder; only that student and coaches can read it back. */
export async function uploadCoachingPhoto(file: File, studentId: string): Promise<string> {
  const blob = await shrinkPhoto(file);
  const isJpeg = blob !== file || /jpe?g$/i.test(file.type || file.name);
  const ext = isJpeg ? "jpg" : file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${studentId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await createClient()
    .storage.from(COACHING_PHOTO_BUCKET)
    .upload(path, blob, { cacheControl: "3600", upsert: false, contentType: isJpeg ? "image/jpeg" : file.type || "image/jpeg" });
  if (error) {
    if (/bucket not found/i.test(error.message)) {
      throw new CoachingSetupError(
        "Photos need a database update. Run supabase/migrations/20261005220000_coaching_photos.sql in Supabase.",
      );
    }
    throw new Error(`Photo upload failed: ${error.message}`);
  }
  return path;
}

const signedPhotoCache = new Map<string, { url: string; expires: number }>();

export async function signedPhotoUrl(path: string): Promise<string | null> {
  const cached = signedPhotoCache.get(path);
  if (cached && cached.expires > Date.now()) return cached.url;
  const { data, error } = await createClient().storage.from(COACHING_PHOTO_BUCKET).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) return null;
  signedPhotoCache.set(path, { url: data.signedUrl, expires: Date.now() + 50 * 60 * 1000 });
  return data.signedUrl;
}

type TusCredentials = {
  videoId: string;
  libraryId: string;
  expirationTime: number;
  signature: string;
  endpoint: string;
};

/**
 * Uploads straight to Bunny. When `rawCopyOwnerId` is set, also stores the original file
 * so coaches can download it (Bunny's CDN often blocks the original).
 */
export async function uploadCoachingVideo(
  file: File,
  opts: {
    title: string;
    kind?: CoachingVideoKind;
    rawCopyOwnerId?: string;
    onProgress?: (percent: number) => void;
  },
): Promise<{ videoId: string; storagePath: string | null }> {
  const res = await fetch("/api/coaching/video", {
    method: "POST",
    headers: await authJsonHeaders(),
    body: JSON.stringify({ title: opts.title, kind: opts.kind }),
  });
  const payload = (await res.json().catch(() => ({}))) as { upload?: TusCredentials; error?: string };
  if (!res.ok || !payload.upload?.videoId) {
    throw new Error(payload.error || `Could not start the upload (${res.status}).`);
  }
  const upload = payload.upload;

  const rawCopy = opts.rawCopyOwnerId
    ? (async () => {
        const ext = file.name.split(".").pop()?.toLowerCase() || "mp4";
        const path = `${opts.rawCopyOwnerId}/${upload.videoId}.${ext}`;
        const { error } = await createClient()
          .storage.from("swing-submissions")
          .upload(path, file, { cacheControl: "3600", upsert: true, contentType: file.type || "video/mp4" });
        if (error) {
          console.warn("[coaching] raw copy upload failed:", error.message);
          return null;
        }
        return path;
      })()
    : Promise.resolve(null);

  try {
    await new Promise<void>((resolve, reject) => {
      new tus.Upload(file, {
        endpoint: upload.endpoint || "https://video.bunnycdn.com/tusupload",
        retryDelays: [0, 3000, 5000, 10000, 20000],
        headers: {
          AuthorizationSignature: upload.signature,
          AuthorizationExpire: String(upload.expirationTime),
          VideoId: upload.videoId,
          LibraryId: upload.libraryId,
        },
        metadata: { filename: file.name || "video.mp4", filetype: file.type || "video/mp4", title: opts.title },
        onError: reject,
        onProgress: (sent, total) => {
          if (total > 0) opts.onProgress?.(Math.min(99, Math.round((sent / total) * 100)));
        },
        onSuccess: () => resolve(),
      }).start();
    });
  } catch (err) {
    void fetch(`/api/bunny/swings?videoId=${encodeURIComponent(upload.videoId)}`, { method: "DELETE" }).catch(
      () => undefined,
    );
    throw err;
  }

  const storagePath = await rawCopy;
  opts.onProgress?.(100);
  return { videoId: upload.videoId, storagePath };
}
