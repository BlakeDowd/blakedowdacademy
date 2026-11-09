import { NextResponse } from "next/server";
import { bunnyApiConfigured, bunnyListVideos } from "@/lib/bunnyStreamAdmin";
import { bunnyCollectionFor } from "@/lib/bunnyCollections";
import { isCoachEmail } from "@/lib/coachEmails";
import { resolveRequestUser, supabaseAsUser } from "@/lib/coachingServer";
import { cleanBunnyVideoTitle } from "@/lib/bunnyStream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function collectVideoIds(rows: unknown): string[] {
  const out: string[] = [];
  if (!Array.isArray(rows)) return out;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const direct = typeof r.bunny_video_id === "string" ? r.bunny_video_id.trim() : "";
    if (direct) out.push(direct);
    const extras = r.extra_videos;
    if (Array.isArray(extras)) {
      for (const ex of extras) {
        if (!ex || typeof ex !== "object") continue;
        const id = String((ex as { bunny_video_id?: unknown }).bunny_video_id || "").trim();
        if (id) out.push(id);
      }
    }
  }
  return out;
}

/** Titles that look like coach/player swing or game-plan uploads, not curriculum lessons. */
function looksLikeCoachingUpload(title: string): boolean {
  const t = title.trim();
  if (!t) return false;
  if (/game\s*plan/i.test(t)) return true;
  // GamePlanCard / swing inbox style: "Name · Something · 1/1/2026"
  if (/^.+\s·\s.+\s·\s/.test(t)) return true;
  if (/^Cadet\s·\s/i.test(t)) return false;
  if (/\bswing\s+(upload|inbox|analysis|feedback)\b/i.test(t)) return true;
  return false;
}

/**
 * Coach-only: browse Bunny Stream library videos by title.
 * GET /api/bunny/videos?search=&limit=40&purpose=cadet
 * purpose=cadet hides game plans + student swing uploads.
 */
export async function GET(request: Request) {
  try {
    if (!bunnyApiConfigured()) {
      return NextResponse.json(
        {
          error:
            "Bunny Stream API key missing. Set BUNNY_STREAM_API_KEY in .env.local to your Stream library API key.",
          configured: false,
          items: [],
        },
        { status: 503 },
      );
    }

    const user = await resolveRequestUser(request);
    const client = user?.accessToken ? supabaseAsUser(user.accessToken) : null;
    const { data: isCoach } = client ? await client.rpc("is_coach") : { data: false };
    if (!user || (!isCoachEmail(user.email) && isCoach !== true)) {
      return NextResponse.json({ error: "Only coaches can browse Bunny videos." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim() || "";
    const purpose = searchParams.get("purpose")?.trim() || "";
    const limitRaw = Number(searchParams.get("limit") || "50");
    const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, Math.round(limitRaw))) : 50;

    const exclude = new Set<string>();

    if (purpose === "cadet") {
      const gamePlanCollection = bunnyCollectionFor("game_plan");
      if (gamePlanCollection) {
        try {
          const gamePlans = await bunnyListVideos({
            limit: 100,
            collectionId: gamePlanCollection,
          });
          for (const v of gamePlans) exclude.add(v.guid.toLowerCase());
        } catch {
          /* collection list optional */
        }
      }

      if (client) {
        const [swings, plans] = await Promise.all([
          client.from("bunny_student_swings").select("bunny_video_id").limit(2000),
          client
            .from("coaching_posts")
            .select("bunny_video_id, extra_videos")
            .eq("is_game_plan", true)
            .limit(1000),
        ]);
        for (const id of collectVideoIds(swings.data)) exclude.add(id.toLowerCase());
        for (const id of collectVideoIds(plans.data)) exclude.add(id.toLowerCase());
      }
    }

    // Over-fetch then filter so cadet lists stay full after exclusions.
    const fetchLimit = purpose === "cadet" ? 100 : limit;
    const raw = await bunnyListVideos({ limit: fetchLimit, search: search || undefined });

    const items = raw
      .filter((v) => !exclude.has(v.guid.toLowerCase()))
      .filter((v) => (purpose === "cadet" ? !looksLikeCoachingUpload(v.title) : true))
      .slice(0, limit)
      .map((v) => ({
        guid: v.guid,
        title: cleanBunnyVideoTitle(v.title) || v.title || "Untitled",
        length: v.length,
        dateUploaded: v.dateUploaded ?? null,
        thumbnailFileName: v.thumbnailFileName ?? null,
      }));

    return NextResponse.json({
      configured: true,
      items,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to list Bunny videos";
    return NextResponse.json({ error: message, configured: true, items: [] }, { status: 500 });
  }
}
