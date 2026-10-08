"use client";

import { Aimpoint6ftCombineRunner } from "@/components/Aimpoint6ftCombineRunner";
import { CombineCommunityHighlights } from "@/components/CombineCommunityHighlights";
import { CombinePageShell } from "@/components/combine/CombinePageShell";
import { combineHighlightAimpoint6ft } from "@/lib/combineHighlightDefinitions";

export default function Aimpoint6ftCombinePage() {
  return (
    <CombinePageShell
      label="6 ft AimPoint Combine"
      footer={<CombineCommunityHighlights definition={combineHighlightAimpoint6ft} />}
    >
      <Aimpoint6ftCombineRunner />
    </CombinePageShell>
  );
}
