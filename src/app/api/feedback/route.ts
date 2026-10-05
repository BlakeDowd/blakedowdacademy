import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createServiceRoleSupabase } from "@/lib/supabaseServiceRole";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGE_LENGTH = 2000;
const DEFAULT_FEEDBACK_TO = "bdowd@pgamember.org.au";
const DEFAULT_FEEDBACK_FROM = "Golf App Feedback <onboarding@resend.dev>";

function readBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sendFeedbackEmail(params: {
  name: string;
  email: string | null;
  message: string;
}): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { sent: false, error: "RESEND_API_KEY is not set" };

  const to = process.env.FEEDBACK_EMAIL_TO?.trim() || DEFAULT_FEEDBACK_TO;
  const from = process.env.FEEDBACK_EMAIL_FROM?.trim() || DEFAULT_FEEDBACK_FROM;
  const submittedAt = new Date().toLocaleString("en-AU", { timeZone: "Australia/Sydney" });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: to.split(",").map((s) => s.trim()).filter(Boolean),
      ...(params.email ? { reply_to: params.email } : {}),
      subject: `App feedback from ${params.name}`,
      text: `From: ${params.name}${params.email ? ` <${params.email}>` : ""}\nSent: ${submittedAt}\n\n${params.message}`,
      html: `<p><strong>From:</strong> ${escapeHtml(params.name)}${
        params.email ? ` &lt;${escapeHtml(params.email)}&gt;` : ""
      }<br/><strong>Sent:</strong> ${escapeHtml(submittedAt)}</p><p style="white-space:pre-wrap">${escapeHtml(
        params.message,
      )}</p>`,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { sent: false, error: `Resend ${res.status}: ${detail.slice(0, 300)}` };
  }
  return { sent: true };
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const bearer = readBearerToken(request);
    const { data: authData } = bearer
      ? await supabase.auth.getUser(bearer)
      : await supabase.auth.getUser();
    const user = authData?.user;
    if (!user?.id) {
      return NextResponse.json({ error: "Please sign in to send feedback." }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as { message?: unknown } | null;
    const message = String(body?.message ?? "").trim();
    if (!message) {
      return NextResponse.json({ error: "Please write some feedback first." }, { status: 400 });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { error: `Feedback is limited to ${MAX_MESSAGE_LENGTH} characters.` },
        { status: 400 },
      );
    }

    const service = createServiceRoleSupabase();
    let name = String(user.user_metadata?.full_name || "").trim();
    if (!name && service) {
      const { data: profile } = await service
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      name = String(profile?.full_name || "").trim();
    }
    if (!name) name = user.email || "Academy member";
    const email = user.email ?? null;

    const emailResult = await sendFeedbackEmail({ name, email, message });
    if (!emailResult.sent) console.error("Feedback email not sent:", emailResult.error);

    let saved = false;
    if (service) {
      const { error } = await service.from("app_feedback").insert({
        user_id: user.id,
        name,
        email,
        message,
        emailed: emailResult.sent,
      });
      if (error) console.error("Feedback not saved:", error.message);
      else saved = true;
    }

    if (!emailResult.sent && !saved) {
      return NextResponse.json(
        { error: "Couldn't send your feedback right now. Please try again later." },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("Feedback route failed:", err);
    return NextResponse.json(
      { error: "Couldn't send your feedback right now. Please try again later." },
      { status: 500 },
    );
  }
}
