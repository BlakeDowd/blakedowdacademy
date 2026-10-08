"use client";

import { FlopShotCombineRunner } from "@/components/FlopShotCombineRunner";
import { CombinePageShell } from "@/components/combine/CombinePageShell";
import { flopShotCombineConfig } from "@/lib/flopShotCombineConfig";

export default function FlopShotCombinePage() {
  return (
    <CombinePageShell label={flopShotCombineConfig.testName}>
      <FlopShotCombineRunner />
    </CombinePageShell>
  );
}
