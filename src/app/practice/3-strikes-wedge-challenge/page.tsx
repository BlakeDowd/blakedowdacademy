"use client";

import { ThreeStrikesWedgeRunner } from "@/components/ThreeStrikesWedgeRunner";
import { CombineCommunityHighlights } from "@/components/CombineCommunityHighlights";
import { CombinePageShell } from "@/components/combine/CombinePageShell";
import { combineHighlightThreeStrikes } from "@/lib/combineHighlightDefinitions";
import { threeStrikesWedgeConfig } from "@/lib/threeStrikesWedgeConfig";

export default function ThreeStrikesWedgeChallengePage() {
  return (
    <CombinePageShell
      label={threeStrikesWedgeConfig.testName}
      footer={<CombineCommunityHighlights definition={combineHighlightThreeStrikes} />}
    >
      <ThreeStrikesWedgeRunner />
    </CombinePageShell>
  );
}
