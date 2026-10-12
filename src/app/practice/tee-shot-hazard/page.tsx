"use client";

import { TeeShotHazardRunner } from "@/components/TeeShotHazardRunner";
import { CombinePageShell } from "@/components/combine/CombinePageShell";

export default function TeeShotHazardPage() {
  return (
    <CombinePageShell label="Tee Shot Hazards">
      <TeeShotHazardRunner />
    </CombinePageShell>
  );
}
