"use client";

import { StartLineAndSpeedControlTestRunner } from "@/components/StartLineAndSpeedControlTestRunner";
import { CombineCommunityHighlights } from "@/components/CombineCommunityHighlights";
import { CombinePageShell } from "@/components/combine/CombinePageShell";
import { combineHighlightStartLine } from "@/lib/combineHighlightDefinitions";

export default function StartLineAndSpeedControlTestPage() {
  return (
    <CombinePageShell
      label="Start Line & Speed Control"
      footer={<CombineCommunityHighlights definition={combineHighlightStartLine} />}
    >
      <StartLineAndSpeedControlTestRunner />
    </CombinePageShell>
  );
}
