"use client";

import { WedgeLateral9Runner } from "@/components/WedgeLateral9Runner";
import { CombineCommunityHighlights } from "@/components/CombineCommunityHighlights";
import { CombinePageShell } from "@/components/combine/CombinePageShell";
import { combineHighlightWedgeLateral9 } from "@/lib/combineHighlightDefinitions";
import { wedgeLateral9Config } from "@/lib/wedgeLateral9Config";

export default function WedgeLateral9Page() {
  return (
    <CombinePageShell
      label={wedgeLateral9Config.testName}
      footer={<CombineCommunityHighlights definition={combineHighlightWedgeLateral9} />}
    >
      <WedgeLateral9Runner />
    </CombinePageShell>
  );
}
