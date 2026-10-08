"use client";

import { PuttingTest20To40Runner } from "@/components/PuttingTest20To40Runner";
import { CombineCommunityHighlights } from "@/components/CombineCommunityHighlights";
import { CombinePageShell } from "@/components/combine/CombinePageShell";
import { combineHighlightPutting2040 } from "@/lib/combineHighlightDefinitions";

export default function PuttingTest20To40Page() {
  return (
    <CombinePageShell
      label="20–40 ft Lag Putting Test"
      footer={<CombineCommunityHighlights definition={combineHighlightPutting2040} />}
    >
      <PuttingTest20To40Runner />
    </CombinePageShell>
  );
}
