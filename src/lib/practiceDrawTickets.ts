/**
 * Community lesson draw tickets.
 * Live: every N logged practice minutes = 1 ticket.
 * Ready for later: combine / drill / tool flat tickets via awardDrawTickets + earn_rules.
 */

export type DrawTicketSource = "practice" | "combine" | "drill" | "tool";

export type PracticeDrawEarnRules = {
  practiceMinutesPerTicket: number;
  combineTickets: number;
  drillTickets: number;
  toolTickets: number;
};

export type PracticeDrawAwardResult = {
  ok: boolean;
  ticketsAwarded: number;
  ticketsTotal: number;
  minutesBank: number;
  minutesToNext: number;
  minutesPerTicket: number;
  campaignId: string | null;
  prize: string | null;
  title: string | null;
  source?: DrawTicketSource;
  reason?: string;
};

export type PracticeDrawStatus = {
  campaignId: string;
  title: string;
  prize: string;
  minutesPerTicket: number;
  status: string;
  endsAt: string | null;
  tickets: number;
  minutesBank: number;
  minutesToNext: number;
  totalTicketsInDraw: number;
  earnRules: PracticeDrawEarnRules;
};

function emptyAward(reason?: string): PracticeDrawAwardResult {
  return {
    ok: true,
    ticketsAwarded: 0,
    ticketsTotal: 0,
    minutesBank: 0,
    minutesToNext: 60,
    minutesPerTicket: 60,
    campaignId: null,
    prize: null,
    title: null,
    reason,
  };
}

function parseEarnRules(raw: unknown, fallbackMinutes = 60): PracticeDrawEarnRules {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    practiceMinutesPerTicket:
      Number(r.practice_minutes_per_ticket) > 0
        ? Number(r.practice_minutes_per_ticket)
        : fallbackMinutes,
    combineTickets: Math.max(0, Number(r.combine_tickets) || 0),
    drillTickets: Math.max(0, Number(r.drill_tickets) || 0),
    toolTickets: Math.max(0, Number(r.tool_tickets) || 0),
  };
}

function parseAward(raw: unknown): PracticeDrawAwardResult {
  if (!raw || typeof raw !== "object") return emptyAward("bad_response");
  const r = raw as Record<string, unknown>;
  const source = r.source;
  return {
    ok: r.ok !== false,
    ticketsAwarded: Number(r.tickets_awarded) || 0,
    ticketsTotal: Number(r.tickets_total) || 0,
    minutesBank: Number(r.minutes_bank) || 0,
    minutesToNext: Number(r.minutes_to_next) || 60,
    minutesPerTicket: Number(r.minutes_per_ticket) || 60,
    campaignId: typeof r.campaign_id === "string" ? r.campaign_id : null,
    prize: typeof r.prize === "string" ? r.prize : null,
    title: typeof r.title === "string" ? r.title : null,
    source:
      source === "practice" || source === "combine" || source === "drill" || source === "tool"
        ? source
        : undefined,
    reason: typeof r.reason === "string" ? r.reason : undefined,
  };
}

function emitUpdated(result: PracticeDrawAwardResult) {
  if (typeof window === "undefined") return;
  if (result.ticketsAwarded > 0 || result.minutesBank > 0 || result.campaignId) {
    window.dispatchEvent(new CustomEvent("practiceDrawUpdated", { detail: result }));
  }
}

/** Award draw minutes after a practice insert. Safe when no campaign is active. */
export async function awardPracticeDrawMinutes(
  minutes: number,
  practiceId?: string | null,
): Promise<PracticeDrawAwardResult> {
  const mins = Math.round(Number(minutes) || 0);
  if (mins < 1) return emptyAward("no_minutes");

  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data, error } = await supabase.rpc("award_practice_draw_minutes", {
      p_minutes: mins,
      p_practice_id: practiceId ?? null,
    });
    if (error) {
      console.warn("awardPracticeDrawMinutes:", error.message);
      return emptyAward(error.message);
    }
    const result = parseAward(data);
    emitUpdated(result);
    return result;
  } catch (e) {
    console.warn("awardPracticeDrawMinutes:", e);
    return emptyAward("exception");
  }
}

/**
 * Flat ticket award for combine / drill / tool.
 * Only awards when the active campaign's earn_rules enables that source.
 */
export async function awardDrawTickets(
  source: Exclude<DrawTicketSource, "practice">,
  tickets = 1,
  sourceId?: string | null,
): Promise<PracticeDrawAwardResult> {
  const n = Math.round(Number(tickets) || 0);
  if (n < 1) return emptyAward("no_tickets");

  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data, error } = await supabase.rpc("award_draw_tickets", {
      p_source: source,
      p_tickets: n,
      p_source_id: sourceId ?? null,
    });
    if (error) {
      console.warn("awardDrawTickets:", error.message);
      return emptyAward(error.message);
    }
    const result = parseAward(data);
    emitUpdated(result);
    return result;
  } catch (e) {
    console.warn("awardDrawTickets:", e);
    return emptyAward("exception");
  }
}

/** Active campaign + current user's ticket progress (Community UI). */
export async function fetchPracticeDrawStatus(
  userId: string,
): Promise<PracticeDrawStatus | null> {
  if (!userId) return null;
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    const { data: campaign, error: campErr } = await supabase
      .from("practice_draw_campaigns")
      .select("id, title, prize, minutes_per_ticket, earn_rules, status, ends_at")
      .eq("status", "active")
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (campErr || !campaign) return null;

    const minutesPerTicket = Number(campaign.minutes_per_ticket) || 60;
    const earnRules = parseEarnRules(campaign.earn_rules, minutesPerTicket);

    const [{ data: progress }, { data: allProgress }] = await Promise.all([
      supabase
        .from("practice_draw_progress")
        .select("tickets, minutes_bank")
        .eq("campaign_id", campaign.id)
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("practice_draw_progress")
        .select("tickets")
        .eq("campaign_id", campaign.id),
    ]);

    const tickets = Number(progress?.tickets) || 0;
    const minutesBank = Number(progress?.minutes_bank) || 0;
    const totalTicketsInDraw = (allProgress ?? []).reduce(
      (sum, row) => sum + (Number(row.tickets) || 0),
      0,
    );

    return {
      campaignId: campaign.id,
      title: campaign.title,
      prize: campaign.prize,
      minutesPerTicket: earnRules.practiceMinutesPerTicket || minutesPerTicket,
      status: campaign.status,
      endsAt: campaign.ends_at ?? null,
      tickets,
      minutesBank,
      minutesToNext: Math.max(
        0,
        (earnRules.practiceMinutesPerTicket || minutesPerTicket) - minutesBank,
      ),
      totalTicketsInDraw,
      earnRules,
    };
  } catch (e) {
    console.warn("fetchPracticeDrawStatus:", e);
    return null;
  }
}
