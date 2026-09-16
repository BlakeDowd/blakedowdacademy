import { NextResponse } from "next/server";
import {
  bunnyApiConfigured,
  bunnyCreateVideo,
  bunnyDeleteVideo,
  bunnyGetVideo,
  bunnyListVideos,
  createBunnyTusUploadCredentials,
} from "@/lib/bunnyStreamAdmin";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import {
  listBunnyStudentSwings,
  listDeletableBunnyStudentVideoIds,
  registerBunnyStudentSwing,
  unregisterBunnyStudentSwing,
} from "@/lib/bunnyStudentSwings";
import {
  isProtectedLibraryBunnyVideo,
  PROTECTED_LIBRARY_BUNNY_VIDEO_IDS,
} from "@/lib/bunnyStream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    if (!bunnyApiConfigured()) {
      return NextResponse.json(
        {
          error:
            "Bunny Stream API key missing. In .env.local set BUNNY_STREAM_API_KEY to your Stream library API key (Bunny → Stream → library → API). Do not use the library ID.",
          configured: false,
          items: [],
          studentSwings: [],
          deletableVideoIds: [],
          protectedVideoIds: Array.from(PROTECTED_LIBRARY_BUNNY_VIDEO_IDS),
        },
        { status: 503 },
      );
    }
    const [items, studentSwings, deletableVideoIds] = await Promise.all([
      bunnyListVideos(30),
      listBunnyStudentSwings(),
      listDeletableBunnyStudentVideoIds(),
    ]);
    return NextResponse.json({
      configured: true,
      items,
      studentSwings,
      deletableVideoIds,
      protectedVideoIds: Array.from(PROTECTED_LIBRARY_BUNNY_VIDEO_IDS),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to list Bunny videos";
    return NextResponse.json(
      {
        error: message,
        configured: true,
        items: [],
        studentSwings: [],
        deletableVideoIds: [],
        protectedVideoIds: Array.from(PROTECTED_LIBRARY_BUNNY_VIDEO_IDS),
      },
      { status: 500 },
    );
  }
}

type PrepareBody = {
  phase?: "prepare" | "complete";
  title?: string;
  videoId?: string;
  keyIssues?: string;
  contactInfo?: string;
  directionalMisses?: string;
};

/** Browser auth uses localStorage (`academy-auth`), so API routes need the Bearer token. */
async function resolveUploadedByUserId(request: Request): Promise<string | null> {
  const supabase = await createServerSupabase();
  const authHeader = request.headers.get("authorization");
  const bearer =
    authHeader && authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";

  if (bearer) {
    const { data, error } = await supabase.auth.getUser(bearer);
    if (!error && data.user?.id) return data.user.id;
  }

  const { data, error } = await supabase.auth.getUser();
  if (!error && data.user?.id) return data.user.id;
  return null;
}

/**
 * Prepare: create Bunny video + pre-signed TUS credentials (small JSON only).
 * Complete: register student notes after the browser finishes uploading to Bunny.
 */
export async function POST(request: Request) {
  try {
    if (!bunnyApiConfigured()) {
      return NextResponse.json(
        {
          error:
            "Bunny Stream API key missing. Set BUNNY_STREAM_API_KEY to your Stream library API key (not the library ID).",
        },
        { status: 503 },
      );
    }

    const uploadedBy = await resolveUploadedByUserId(request);
    if (!uploadedBy) {
      return NextResponse.json(
        { error: "You must be signed in to send a swing to Blake." },
        { status: 401 },
      );
    }

    const body = (await request.json().catch(() => null)) as PrepareBody | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const phase = body.phase === "complete" ? "complete" : "prepare";
    const title = String(body.title || "").trim();
    const keyIssues = String(body.keyIssues || "").trim();
    const contactInfo = String(body.contactInfo || "").trim();
    const directionalMisses = String(body.directionalMisses || "").trim();

    if (!keyIssues && !contactInfo && !directionalMisses) {
      return NextResponse.json(
        {
          error:
            "Add at least one note — Key issues, Contact, or Directional misses — so Blake knows what to work on.",
        },
        { status: 400 },
      );
    }

    if (phase === "prepare") {
      const videoTitle = title || "Swing upload";
      const created = await bunnyCreateVideo(videoTitle);
      const upload = createBunnyTusUploadCredentials(created.guid, created.title);

      // Register immediately so refresh / inbox keep the player + swing while Bunny processes.
      await registerBunnyStudentSwing({
        bunnyVideoId: created.guid,
        title: created.title || videoTitle,
        uploadedBy,
        keyIssues,
        contactInfo,
        directionalMisses,
      });

      return NextResponse.json({
        ok: true,
        phase: "prepare",
        upload,
      });
    }

    const videoId = String(body.videoId || "").trim();
    if (!videoId) {
      return NextResponse.json({ error: "videoId is required to complete upload" }, { status: 400 });
    }
    if (isProtectedLibraryBunnyVideo(videoId)) {
      return NextResponse.json({ error: "That video cannot be registered as a student swing." }, { status: 403 });
    }

    const video = await bunnyGetVideo(videoId);

    await registerBunnyStudentSwing({
      bunnyVideoId: video.guid,
      title: video.title || title || "Swing upload",
      uploadedBy,
      keyIssues,
      contactInfo,
      directionalMisses,
    });

    return NextResponse.json({ ok: true, phase: "complete", video, deletable: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Best-effort cleanup if the client aborts after prepare (empty Bunny stub only). */
export async function DELETE(request: Request) {
  try {
    if (!bunnyApiConfigured()) {
      return NextResponse.json({ error: "Bunny Stream is not configured." }, { status: 503 });
    }
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get("videoId")?.trim();
    if (!videoId) {
      return NextResponse.json({ error: "videoId is required" }, { status: 400 });
    }
    if (isProtectedLibraryBunnyVideo(videoId)) {
      return NextResponse.json({ error: "Protected video" }, { status: 403 });
    }
    const video = await bunnyGetVideo(videoId);
    if (video.length > 0) {
      return NextResponse.json(
        { error: "Only unfinished empty uploads can be cleaned up here." },
        { status: 403 },
      );
    }
    await bunnyDeleteVideo(videoId);
    await unregisterBunnyStudentSwing(videoId);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Cleanup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
