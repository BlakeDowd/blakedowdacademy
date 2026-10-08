"use client";

import { LowChipCombineRunner } from "@/components/LowChipCombineRunner";
import { CombinePageShell } from "@/components/combine/CombinePageShell";
import { lowChipCombineConfig } from "@/lib/lowChipCombineConfig";

export default function LowChipCombinePage() {
  return (
    <CombinePageShell label={lowChipCombineConfig.testName}>
      <LowChipCombineRunner />
    </CombinePageShell>
  );
}
