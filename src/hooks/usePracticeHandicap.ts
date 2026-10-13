"use client";

import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { defaultHandicapFromStats } from "@/lib/roundStatsGoalInsight";
import {
  recentCombineAverages,
  scorePracticeHandicap,
  type CombineAverage,
  type PracticeHandicap,
} from "@/lib/practiceHandicap";
import { usePracticeHandicapOverrides } from "@/lib/practiceHandicapOverrides";

type LoadState =
  | { status: "loading"; playerId: string | null }
  | { status: "error"; playerId: string }
  | { status: "ready"; playerId: string; averages: CombineAverage[]; playing: number | null };

export type PracticeHandicapData =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; averages: CombineAverage[]; practice: PracticeHandicap; playing: number | null };

const REFRESH_EVENTS = ["practiceSessionsUpdated", "roundsUpdated", "playerGoalsUpdated"];

const toNumber = (v: unknown): number | null => {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Latest round data first, then the handicap set in Goal Setting, then the profile. */
async function loadPlayingHandicap(supabase: SupabaseClient, playerId: string): Promise<number | null> {
  const [statsRes, roundsRes, goalRes, profileRes] = await Promise.all([
    supabase.from("round_stats").select("handicap_index").eq("user_id", playerId).order("played_at", { ascending: false }).limit(5),
    supabase.from("rounds").select("handicap, created_at").eq("user_id", playerId).order("created_at", { ascending: false }).limit(5),
    supabase.from("player_goals").select("current_handicap").eq("user_id", playerId).maybeSingle(),
    supabase.from("profiles").select("initial_handicap").eq("id", playerId).maybeSingle(),
  ]);
  return (
    defaultHandicapFromStats(statsRes.error ? [] : statsRes.data ?? [], roundsRes.error ? [] : roundsRes.data ?? []) ??
    toNumber(goalRes.data?.current_handicap) ??
    toNumber(profileRes.data?.initial_handicap)
  );
}

/** A player's practice handicap (with coach-tuned benchmarks) and playing handicap. */
export function usePracticeHandicap(playerId: string | null | undefined): PracticeHandicapData {
  const [state, setState] = useState<LoadState>({ status: "loading", playerId: null });
  const [version, setVersion] = useState(0);
  const overrides = usePracticeHandicapOverrides();

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    REFRESH_EVENTS.forEach((e) => window.addEventListener(e, bump));
    return () => REFRESH_EVENTS.forEach((e) => window.removeEventListener(e, bump));
  }, []);

  useEffect(() => {
    if (!playerId) return;
    let cancelled = false;
    const supabase = createClient();
    void Promise.all([
      supabase.from("practice_logs").select("*").eq("user_id", playerId).order("created_at", { ascending: false }).limit(900),
      supabase.from("practice").select("*").eq("user_id", playerId).order("created_at", { ascending: false }).limit(1600),
      loadPlayingHandicap(supabase, playerId),
    ]).then(([logsRes, practiceRes, playing]) => {
      if (cancelled) return;
      if (logsRes.error && practiceRes.error) {
        setState({ status: "error", playerId });
        return;
      }
      setState({
        status: "ready",
        playerId,
        averages: recentCombineAverages(playerId, practiceRes.data, logsRes.data),
        playing,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [playerId, version]);

  const current = state.playerId === playerId ? state : null;
  const averages = current?.status === "ready" ? current.averages : null;
  const practice = useMemo(
    () => (averages ? scorePracticeHandicap(averages, overrides.byId) : null),
    [averages, overrides.byId],
  );

  if (!current || current.status === "loading") return { status: "loading" };
  if (current.status === "error") return { status: "error" };
  return { status: "ready", averages: current.averages, practice: practice!, playing: current.playing };
}
