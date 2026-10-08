"use client";

import { PuttingTest9Runner } from "@/components/PuttingTest9Runner";
import { CombineCommunityHighlights } from "@/components/CombineCommunityHighlights";
import { CombinePageShell } from "@/components/combine/CombinePageShell";
import { combineHighlightPutting9 } from "@/lib/combineHighlightDefinitions";

export default function PuttingTest9Page() {
  return (
    <CombinePageShell
      label="9-Hole Putting Test"
      footer={<CombineCommunityHighlights definition={combineHighlightPutting9} />}
    >
      <PuttingTest9Runner />
    </CombinePageShell>
  );
}
