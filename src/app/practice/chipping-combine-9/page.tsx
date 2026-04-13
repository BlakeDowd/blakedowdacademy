import Link from "next/link";
import { ChevronLeft, Target } from "lucide-react";
import { ChippingCombine9Runner } from "@/components/ChippingCombine9Runner";
import { CombineCommunityHighlights } from "@/components/CombineCommunityHighlights";
import { combineHighlightChipping9 } from "@/lib/combineHighlightDefinitions";
import { chippingCombine9Config } from "@/lib/chippingCombine9Config";

export default function ChippingCombine9Page() {
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
              {chippingCombine9Config.testName}
            </h1>
          </div>
          <p className="text-sm text-gray-600 mt-2">
            Nine holes per session, each with a random distance between {chippingCombine9Config.distanceMinM}{" "}
            m and {chippingCombine9Config.distanceMaxM} m. Enter proximity in centimeters (linear chip
            scale), confirm your zone, then whether you hole the putt (+10 when made). Missed putts can
            include a short read vs.
            execution audit for miss diagnosis. Chip and putt points roll into one session total.
          </p>
          <ChippingCombine9Runner />
          <CombineCommunityHighlights definition={combineHighlightChipping9} />
        </div>
      </div>
    </div>
  );
}
