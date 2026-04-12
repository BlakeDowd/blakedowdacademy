import Link from "next/link";
import { ChevronLeft, Target } from "lucide-react";
import { ChippingCombine9Runner } from "@/components/ChippingCombine9Runner";
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
            Random distances each session, chip proximity scoring, putt conversion, and miss
            diagnosis. Saved as one practice row with{" "}
            <code className="text-xs bg-gray-100 px-1 rounded">test_type</code>{" "}
            <span className="font-mono text-xs">{chippingCombine9Config.testType}</span>.
          </p>
          <ChippingCombine9Runner />
        </div>
      </div>
    </div>
  );
}
