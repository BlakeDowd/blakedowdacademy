"use client";

import { PuttingTest3To6ftRunner } from "@/components/PuttingTest3To6ftRunner";
import { CombineCommunityHighlights } from "@/components/CombineCommunityHighlights";
import { CombinePageShell } from "@/components/combine/CombinePageShell";
import { combineHighlightPutting36 } from "@/lib/combineHighlightDefinitions";

export default function PuttingTest3To6ftPage() {
  return (
    <CombinePageShell
      label="3–6 ft Putting Test"
      footer={<CombineCommunityHighlights definition={combineHighlightPutting36} />}
    >
      <PuttingTest3To6ftRunner />
    </CombinePageShell>
  );
}
