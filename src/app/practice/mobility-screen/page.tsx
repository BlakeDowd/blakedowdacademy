"use client";

import { MobilityScreenRunner } from "@/components/mobility/MobilityScreenRunner";
import { CombinePageShell } from "@/components/combine/CombinePageShell";

export default function MobilityScreenPage() {
  return (
    <CombinePageShell label="Mobility Screen">
      <MobilityScreenRunner />
    </CombinePageShell>
  );
}
