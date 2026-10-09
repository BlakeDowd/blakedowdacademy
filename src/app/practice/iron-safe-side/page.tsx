"use client";

import { IronSafeSideRunner } from "@/components/IronSafeSideRunner";
import { CombinePageShell } from "@/components/combine/CombinePageShell";

export default function IronSafeSidePage() {
  return (
    <CombinePageShell label="Iron Safe Side">
      <IronSafeSideRunner />
    </CombinePageShell>
  );
}
