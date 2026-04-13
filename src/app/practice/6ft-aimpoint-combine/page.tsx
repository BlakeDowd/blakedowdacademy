import Link from "next/link";
import { ChevronLeft, Target } from "lucide-react";
import { Aimpoint6ftCombineRunner } from "@/components/Aimpoint6ftCombineRunner";
import { CombineCommunityHighlights } from "@/components/CombineCommunityHighlights";
import { combineHighlightAimpoint6ft } from "@/lib/combineHighlightDefinitions";
import { aimpoint6ftCombineConfig } from "@/lib/aimpoint6ftCombineConfig";

export default function Aimpoint6ftCombinePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-6 pb-24">
        <Link
          href="/practice"
          className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-[#014421] mb-6"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Practice
        </Link>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-50 border-2 border-gray-200"
              aria-hidden
            >
              <Target className="w-5 h-5 text-gray-600" />
            </div>
            <h1 className="text-xl font-semibold leading-snug text-gray-900">
              {aimpoint6ftCombineConfig.testName}
            </h1>
          </div>
          <p className="text-sm text-gray-600 mt-2">
            Ten six-foot putts with 33% and 66% AimPoint reads. One session row is saved to practice
            with test type and full metadata for charting.
          </p>
          <Aimpoint6ftCombineRunner />
          <CombineCommunityHighlights definition={combineHighlightAimpoint6ft} />
        </div>
      </div>
    </div>
  );
}
