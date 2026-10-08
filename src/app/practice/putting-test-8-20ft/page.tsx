"use client";

import { PuttingTest8To20Runner } from "@/components/PuttingTest8To20Runner";
import { CombineCommunityHighlights } from "@/components/CombineCommunityHighlights";
import { CombinePageShell } from "@/components/combine/CombinePageShell";
import { combineHighlightPutting820 } from "@/lib/combineHighlightDefinitions";

export default function PuttingTest8To20Page() {
  return (
    <CombinePageShell
      label="8–20 ft Putting Test"
      footer={<CombineCommunityHighlights definition={combineHighlightPutting820} />}
    >
      <PuttingTest8To20Runner />
    </CombinePageShell>
  );
}
