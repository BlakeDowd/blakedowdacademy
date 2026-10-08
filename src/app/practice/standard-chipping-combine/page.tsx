"use client";

import { StandardChippingCombineRunner } from "@/components/StandardChippingCombineRunner";
import { CombinePageShell } from "@/components/combine/CombinePageShell";
import { standardChippingCombineConfig } from "@/lib/standardChippingCombineConfig";

export default function StandardChippingCombinePage() {
  return (
    <CombinePageShell label={standardChippingCombineConfig.testName}>
      <StandardChippingCombineRunner />
    </CombinePageShell>
  );
}
