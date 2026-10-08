"use client";

import { BunkerProximityProtocolRunner } from "@/components/BunkerProximityProtocolRunner";
import { CombineCommunityHighlights } from "@/components/CombineCommunityHighlights";
import { CombinePageShell } from "@/components/combine/CombinePageShell";
import { combineHighlightBunkerProximity } from "@/lib/combineHighlightDefinitions";
import { bunkerProximityProtocolConfig } from "@/lib/bunkerProximityProtocolConfig";

export default function BunkerProximityProtocolPage() {
  return (
    <CombinePageShell
      label={bunkerProximityProtocolConfig.testName}
      footer={<CombineCommunityHighlights definition={combineHighlightBunkerProximity} />}
    >
      <BunkerProximityProtocolRunner />
    </CombinePageShell>
  );
}
