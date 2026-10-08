"use client";

import { StrikeAndSpeedControlTestRunner } from "@/components/StrikeAndSpeedControlTestRunner";
import { CombineCommunityHighlights } from "@/components/CombineCommunityHighlights";
import { CombinePageShell } from "@/components/combine/CombinePageShell";
import { combineHighlightStrikeSpeed } from "@/lib/combineHighlightDefinitions";

export default function StrikeAndSpeedControlTestPage() {
  return (
    <CombinePageShell
      label="Strike & Speed Control"
      footer={<CombineCommunityHighlights definition={combineHighlightStrikeSpeed} />}
    >
      <StrikeAndSpeedControlTestRunner />
    </CombinePageShell>
  );
}
