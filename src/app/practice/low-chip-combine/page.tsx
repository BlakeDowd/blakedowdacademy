import Link from "next/link";
import { ChevronLeft, Flag } from "lucide-react";
import { LowChipCombineRunner } from "@/components/LowChipCombineRunner";
import { lowChipCombineConfig } from "@/lib/lowChipCombineConfig";

export default function LowChipCombinePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-lg px-4 py-6 pb-24">
        <Link
          href="/practice"
          className="mb-6 inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-[#014421]"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Back to Practice
        </Link>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-2 flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-gray-200 bg-gray-50"
              aria-hidden
            >
              <Flag className="h-5 w-5 text-gray-600" />
            </div>
            <h1 className="text-xl font-semibold leading-snug text-gray-900">
              {lowChipCombineConfig.testName}
            </h1>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            Five shots each from the 5 m, 10 m, and 20 m stations. Log miss distance in{" "}
            <span className="font-medium text-gray-800">metres</span> (decimals welcome — e.g.{" "}
            <span className="font-mono text-gray-800">0.5</span>). Submit when complete to save your
            score and performance grade.
          </p>

          <LowChipCombineRunner />
        </div>
      </div>
    </div>
  );
}
