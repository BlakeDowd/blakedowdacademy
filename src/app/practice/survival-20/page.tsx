"use client";

import { Survival20Runner } from "@/components/Survival20Runner";
import { CombineCommunityHighlights } from "@/components/CombineCommunityHighlights";
import { CombinePageShell } from "@/components/combine/CombinePageShell";
import { combineHighlightSurvival20 } from "@/lib/combineHighlightDefinitions";
import { survival20Config } from "@/lib/survival20Config";

export default function Survival20Page() {
  return (
    <CombinePageShell
      label={survival20Config.testName}
      footer={<CombineCommunityHighlights definition={combineHighlightSurvival20} />}
    >
      <Survival20Runner />
    </CombinePageShell>
  );
}
