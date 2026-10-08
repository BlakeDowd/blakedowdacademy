"use client";

import { IronPrecisionProtocolRunner } from "@/components/IronPrecisionProtocolRunner";
import { CombineCommunityHighlights } from "@/components/CombineCommunityHighlights";
import { CombinePageShell } from "@/components/combine/CombinePageShell";
import { combineHighlightIronPrecision } from "@/lib/combineHighlightDefinitions";

export default function IronPrecisionProtocolPage() {
  return (
    <CombinePageShell
      label="Iron Precision Protocol"
      footer={<CombineCommunityHighlights definition={combineHighlightIronPrecision} />}
    >
      <IronPrecisionProtocolRunner />
    </CombinePageShell>
  );
}
