"use client";

import { TeeShotDispersionCombineRunner } from "@/components/TeeShotDispersionCombineRunner";
import { CombineCommunityHighlights } from "@/components/CombineCommunityHighlights";
import { CombinePageShell } from "@/components/combine/CombinePageShell";
import { combineHighlightTeeShotDispersion } from "@/lib/combineHighlightDefinitions";
import { teeShotDispersionCombineConfig } from "@/lib/teeShotDispersionCombineConfig";

export default function TeeShotDispersionCombinePage() {
  return (
    <CombinePageShell
      label={teeShotDispersionCombineConfig.testName}
      footer={<CombineCommunityHighlights definition={combineHighlightTeeShotDispersion} />}
    >
      <TeeShotDispersionCombineRunner />
    </CombinePageShell>
  );
}
