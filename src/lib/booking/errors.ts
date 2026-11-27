import { NextResponse } from "next/server";

export class BookingError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function bookingResponse(error: unknown) {
  if (error instanceof BookingError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return NextResponse.json({ error: "Something went wrong with that booking." }, { status: 500 });
}

export function publicOrigin(request: Request) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.BOOKING_PUBLIC_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

export function cleanBookingError(message: string) {
  const first = message.split("\n")[0]?.trim() || "Something went wrong with that booking.";
  if (/schema cache|booking_|does not exist|PGRST/i.test(first)) {
    return "Booking is not turned on in the database yet. Run the booking SQL in Supabase, then try again.";
  }
  return first.replace(/^ERROR:\s*/i, "");
}
