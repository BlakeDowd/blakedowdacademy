"use client";

import { BunkerLiesRunner } from "@/components/BunkerLiesRunner";
import { CombinePageShell } from "@/components/combine/CombinePageShell";

export default function BunkerLiesPage() {
  return (
    <CombinePageShell label="Bunker Lies">
      <BunkerLiesRunner />
    </CombinePageShell>
  );
}
