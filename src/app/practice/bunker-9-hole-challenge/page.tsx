"use client";

import { Bunker9HoleChallengeRunner } from "@/components/Bunker9HoleChallengeRunner";
import { CombineCommunityHighlights } from "@/components/CombineCommunityHighlights";
import { CombinePageShell } from "@/components/combine/CombinePageShell";
import { combineHighlightBunker9 } from "@/lib/combineHighlightDefinitions";
import { bunker9HoleChallengeConfig } from "@/lib/bunker9HoleChallengeConfig";

const NO_RECORDS = "No records yet";

export default function Bunker9HoleChallengePage() {
  return (
    <CombinePageShell
      label={bunker9HoleChallengeConfig.testName}
      footer={
        <CombineCommunityHighlights
          definition={combineHighlightBunker9}
          emptyLeaderboardMessage={NO_RECORDS}
          emptyImprovementMessage={NO_RECORDS}
        />
      }
    >
      <Bunker9HoleChallengeRunner />
    </CombinePageShell>
  );
}
