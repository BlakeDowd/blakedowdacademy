import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { IronFaceControlRunner } from "@/components/IronFaceControlRunner";
import { ironFaceControlConfig } from "@/lib/ironFaceControlConfig";

export default function IronFaceControlProtocolPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl px-4 py-6 pb-24">
        <Link
          href="/practice"
          className="mb-6 inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-[#014421]"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Back to Practice
        </Link>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold leading-snug text-gray-900">
            {ironFaceControlConfig.testName}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-gray-600">
            Place alignment sticks <strong className="text-gray-900">2 m</strong> in front to create a
            gate. Aim for start line through the gate, curvature in the correct direction, and a
            solid strike — face angle at impact drives the line.
          </p>

          <IronFaceControlRunner />
        </div>
      </div>
    </div>
  );
}
