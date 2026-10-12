"use client";

import { DriverFlightTestRunner } from "@/components/DriverFlightTestRunner";
import { CombinePageShell } from "@/components/combine/CombinePageShell";

export default function DriverFlightTestPage() {
  return (
    <CombinePageShell label="Driver Flight Control">
      <DriverFlightTestRunner />
    </CombinePageShell>
  );
}
