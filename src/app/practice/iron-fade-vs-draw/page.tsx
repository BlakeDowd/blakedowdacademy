"use client";

import { IronFadeDrawRunner } from "@/components/IronFadeDrawRunner";
import { CombinePageShell } from "@/components/combine/CombinePageShell";

export default function IronFadeDrawPage() {
  return (
    <CombinePageShell label="Fade vs Draw">
      <IronFadeDrawRunner />
    </CombinePageShell>
  );
}
