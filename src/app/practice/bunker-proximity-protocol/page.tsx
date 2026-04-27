import Link from "next/link";
import { ChevronLeft, Waves } from "lucide-react";
import { BunkerProximityProtocolRunner } from "@/components/BunkerProximityProtocolRunner";
import { CombineCommunityHighlights } from "@/components/CombineCommunityHighlights";
import { combineHighlightBunkerProximity } from "@/lib/combineHighlightDefinitions";
import { bunkerProximityProtocolConfig } from "@/lib/bunkerProximityProtocolConfig";

export default function BunkerProximityProtocolPage() {
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
              className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-[#d6c5a3] bg-[#f9f5ec]"
              aria-hidden
            >
              <Waves className="h-5 w-5 text-[#7a5a2f]" />
            </div>
            <h1 className="text-xl font-semibold leading-snug text-gray-900">
              {bunkerProximityProtocolConfig.testName}
            </h1>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            Sand proximity scoring protocol across three distances. Log each bunker result and build
            your total score in real time.
          </p>

          <BunkerProximityProtocolRunner />
          <CombineCommunityHighlights definition={combineHighlightBunkerProximity} />
        </div>
      </div>
    </div>
  );
}
