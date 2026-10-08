"use client";

import { AimpointLongRange2040Runner } from "@/components/AimpointLongRange2040Runner";
import { CombineCommunityHighlights } from "@/components/CombineCommunityHighlights";
import { CombinePageShell } from "@/components/combine/CombinePageShell";
import { combineHighlightAimpointLong2040 } from "@/lib/combineHighlightDefinitions";

export default function AimpointLongRange2040Page() {
  return (
    <CombinePageShell
      label="20–40 ft AimPoint Combine"
      footer={<CombineCommunityHighlights definition={combineHighlightAimpointLong2040} />}
    >
      <AimpointLongRange2040Runner />
    </CombinePageShell>
  );
}
