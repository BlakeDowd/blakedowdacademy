"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CadetScorecardEntry } from "@/components/coach/CadetScorecardEntry";
import {
  fetchCadetEnrollmentForPlayer,
  fetchCadetScorecardsForPlayer,
  recommendCadetPracticeFromScorecards,
  summarizeCadetScorecards,
} from "@/lib/cadetScorecard";
import { cadetHoleGroupLabel, type CadetHoleGroup } from "@/lib/cadetScoring";

type Props = {
  playerId: string;
  playerName?: string;
};

/**
 * Junior / family profile: show cadet scorecard entry when the player is enrolled.
 */
export function PlayerCadetScorecard({ playerId, playerName }: Props) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "hidden" }
    | {
        status: "ready";
        holeGroup: CadetHoleGroup;
        practice: string | null;
        holesLogged: number;
      }
  >({ status: "loading" });

  const load = useCallback(async () => {
    const client = createClient();
    const enrol = await fetchCadetEnrollmentForPlayer(client, playerId);
    if (!enrol.available || !enrol.enrollment || enrol.enrollment.status !== "active") {
      setState({ status: "hidden" });
      return;
    }
    const cards = await fetchCadetScorecardsForPlayer(client, {
      playerId,
      holeGroup: enrol.enrollment.hole_group,
      limit: 12,
    });
    const summary = summarizeCadetScorecards(cards.cards);
    const recs = recommendCadetPracticeFromScorecards(summary);
    const top = recs.find((r) => r.severity !== "watch") || recs[0] || null;
    setState({
      status: "ready",
      holeGroup: enrol.enrollment.hole_group,
      practice: top ? `${top.title}: ${top.detail}` : null,
      holesLogged: summary.holes,
    });
  }, [playerId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === "loading" || state.status === "hidden") return null;

  return (
    <div className="space-y-3">
      {(state.practice || state.holesLogged > 0) && (
        <div className="rounded-2xl border border-[#014421]/12 bg-[#014421]/[0.04] px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#014421]/70">
            Cadet · {cadetHoleGroupLabel(state.holeGroup)}
          </p>
          {state.holesLogged > 0 ? (
            <p className="mt-1 text-xs text-stone-600">
              {state.holesLogged} hole{state.holesLogged === 1 ? "" : "s"} logged
              {state.practice ? ` · ${state.practice}` : ""}
            </p>
          ) : (
            <p className="mt-1 text-xs text-stone-600">
              Log your first scorecard after a round — coaches use it for practice tips and move-up.
            </p>
          )}
        </div>
      )}
      <CadetScorecardEntry
        mode="self"
        playerId={playerId}
        playerName={playerName}
        defaultHoleGroup={state.holeGroup}
        onSaved={() => void load()}
      />
    </div>
  );
}
