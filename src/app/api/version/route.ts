export const dynamic = "force-dynamic";

/** The build that's live now; open copies of the app compare it with their own to know they're out of date. */
export function GET() {
  return Response.json(
    { build: process.env.NEXT_PUBLIC_BUILD_ID ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
