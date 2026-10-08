"use client";

import { MidRangeSlopeSensingRunner } from "@/components/MidRangeSlopeSensingRunner";
import { CombineCommunityHighlights } from "@/components/CombineCommunityHighlights";
import { CombinePageShell } from "@/components/combine/CombinePageShell";
import { combineHighlightAimpoint820 } from "@/lib/combineHighlightDefinitions";

export default function MidRangeSlopeSensingPage() {
  return (
    <CombinePageShell
      label="8–20 ft AimPoint Combine"
      footer={<CombineCommunityHighlights definition={combineHighlightAimpoint820} />}
    >
      <MidRangeSlopeSensingRunner />
    </CombinePageShell>
  );
}
