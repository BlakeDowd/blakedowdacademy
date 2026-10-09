import { NextResponse } from "next/server";
import {
  bunnyApiConfigured,
  bunnyCreateVideo,
  createBunnyTusUploadCredentials,
} from "@/lib/bunnyStreamAdmin";
import { resolveRequestUser } from "@/lib/coachingServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Long lesson videos over phone connections can take a while; the signed upload must outlive them. */
const UPLOAD_WINDOW_SECONDS = 12 * 60 * 60;

/** Creates an empty Bunny video and returns signed TUS credentials so the browser can upload directly. */
export async function POST(request: Request) {
  try {
    if (!bunnyApiConfigured()) {
      return NextResponse.json(
        { error: "Video uploads aren't set up yet (Bunny Stream API key missing)." },
        { status: 503 },
      );
    }
    const user = await resolveRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: "Sign in to upload a video." }, { status: 401 });
    }
    const body = (await request.json().catch(() => null)) as { title?: unknown } | null;
    const title = String(body?.title || "").trim().slice(0, 120) || "Coaching video";
    const created = await bunnyCreateVideo(title);
    const upload = createBunnyTusUploadCredentials(created.guid, created.title, UPLOAD_WINDOW_SECONDS);
    return NextResponse.json({ ok: true, upload });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Could not start the upload";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
