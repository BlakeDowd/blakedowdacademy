import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Public VAPID key for the browser (safe to expose). Avoids NEXT_PUBLIC_ build-time coupling. */
export async function GET() {
  const publicKey =
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ||
    process.env.VAPID_PUBLIC_KEY?.trim() ||
    "";
  return NextResponse.json({
    configured: Boolean(publicKey),
    publicKey: publicKey || null,
  });
}
