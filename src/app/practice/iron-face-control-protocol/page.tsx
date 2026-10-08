"use client";

import { IronFaceControlRunner } from "@/components/IronFaceControlRunner";
import { CombinePageShell } from "@/components/combine/CombinePageShell";

export default function IronFaceControlProtocolPage() {
  return (
    <CombinePageShell label="Iron Face Control">
      <IronFaceControlRunner />
    </CombinePageShell>
  );
}
