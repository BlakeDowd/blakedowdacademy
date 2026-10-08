"use client";

import { ChippingCombine9Runner } from "@/components/ChippingCombine9Runner";
import { CombineCommunityHighlights } from "@/components/CombineCommunityHighlights";
import { CombinePageShell } from "@/components/combine/CombinePageShell";
import { combineHighlightChipping9 } from "@/lib/combineHighlightDefinitions";
import { chippingCombine9Config } from "@/lib/chippingCombine9Config";

export default function ChippingCombine9Page() {
  return (
    <CombinePageShell
      label={chippingCombine9Config.testName}
      footer={<CombineCommunityHighlights definition={combineHighlightChipping9} />}
    >
      <ChippingCombine9Runner />
    </CombinePageShell>
  );
}
