import Link from "next/link";
import { ChevronLeft, Target } from "lucide-react";
import { TeeShotDispersionCombineRunner } from "@/components/TeeShotDispersionCombineRunner";
import { CombineCommunityHighlights } from "@/components/CombineCommunityHighlights";
import { combineHighlightTeeShotDispersion } from "@/lib/combineHighlightDefinitions";
import { teeShotDispersionCombineConfig } from "@/lib/teeShotDispersionCombineConfig";

export default function TeeShotDispersionCombinePage() {
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
              {teeShotDispersionCombineConfig.testName}
            </h1>
          </div>
          <p className="text-sm text-gray-600 mt-2">
            {teeShotDispersionCombineConfig.shotCount} tee shots per session. For each shot, enter carry
            distance (m), set start direction (left / straight / right), choose finger dispersion on the
            button grid or Outside 4 for a fail (0 pts), then tap the 9-point driver face (Heel / Middle /
            Toe × High / Middle / Low). Scoring matches the iron/wedge finger bands; sweet spot (Middle /
            Middle) earns +{teeShotDispersionCombineConfig.middleMiddleBonus} when not Outside 4.
            Your summary includes a strike cluster readout from impact patterns.
          </p>
          <TeeShotDispersionCombineRunner />
          <CombineCommunityHighlights definition={combineHighlightTeeShotDispersion} />
        </div>
      </div>
    </div>
  );
}
