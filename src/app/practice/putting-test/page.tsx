"use client";

import { PuttingTestRunner } from "@/components/PuttingTestRunner";
import { CombineCommunityHighlights } from "@/components/CombineCommunityHighlights";
import { CombinePageShell } from "@/components/combine/CombinePageShell";
import { combineHighlightPutting18 } from "@/lib/combineHighlightDefinitions";

export default function PuttingTestPage() {
  return (
    <CombinePageShell
      label="18-Hole Putting Test"
      footer={<CombineCommunityHighlights definition={combineHighlightPutting18} />}
    >
      <PuttingTestRunner />
    </CombinePageShell>
  );
}
