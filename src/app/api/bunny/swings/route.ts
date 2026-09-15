import { NextResponse } from "next/server";
import {
  bunnyApiConfigured,
  bunnyCreateAndUploadVideo,
  bunnyListVideos,
} from "@/lib/bunnyStreamAdmin";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import {
  listBunnyStudentSwings,
  listDeletableBunnyStudentVideoIds,
  registerBunnyStudentSwing,
} from "@/lib/bunnyStudentSwings";
import {
  isProtectedLibraryBunnyVideo,
  PROTECTED_LIBRARY_BUNNY_VIDEO_IDS,
} from "@/lib/bunnyStream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

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

    const form = await request.formData();
    const file = form.get("file");
    const title = String(form.get("title") || "").trim();
    const keyIssues = String(form.get("keyIssues") || "").trim();
    const contactInfo = String(form.get("contactInfo") || "").trim();
    const directionalMisses = String(form.get("directionalMisses") || "").trim();

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (!file.type.startsWith("video/") && !file.name.match(/\.(mp4|mov|m4v|webm)$/i)) {
      return NextResponse.json({ error: "Please upload a video file." }, { status: 400 });
    }
    if (!keyIssues && !contactInfo && !directionalMisses) {
      return NextResponse.json(
        {
          error:
            "Add at least one note — Key issues, Contact, or Directional misses — so Blake knows what to work on.",
        },
        { status: 400 },
      );
    }

    const maxBytes = 80 * 1024 * 1024;
    if (file.size > maxBytes) {
      return NextResponse.json(
        { error: "Video is too large for this test upload (max ~80MB). Try a shorter clip." },
        { status: 413 },
      );
    }

    const videoTitle = title || file.name.replace(/\.[^.]+$/, "") || "Swing upload";
    const video = await bunnyCreateAndUploadVideo(videoTitle, file, file.name);

    if (video.guid && !isProtectedLibraryBunnyVideo(video.guid)) {
      let uploadedBy: string | null = null;
      try {
        const supabase = await createServerSupabase();
        const { data } = await supabase.auth.getUser();
        uploadedBy = data.user?.id ?? null;
      } catch {
        uploadedBy = null;
      }
      await registerBunnyStudentSwing({
        bunnyVideoId: video.guid,
        title: video.title || videoTitle,
        uploadedBy,
        keyIssues,
        contactInfo,
        directionalMisses,
      });
    }

    return NextResponse.json({ ok: true, video, deletable: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
