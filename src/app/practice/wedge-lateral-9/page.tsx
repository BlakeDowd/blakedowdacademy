import Link from "next/link";
import { ChevronLeft, Triangle } from "lucide-react";
import { WedgeLateral9Runner } from "@/components/WedgeLateral9Runner";
import { wedgeLateral9Config } from "@/lib/wedgeLateral9Config";

export default function WedgeLateral9Page() {
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
              <Triangle className="w-5 h-5 text-gray-600" />
            </div>
            <h1 className="text-xl font-semibold leading-snug text-gray-900">
              {wedgeLateral9Config.testName}
            </h1>
          </div>
          <p className="text-sm text-gray-600 mt-2">
            Nine full-swing wedge shots to random targets from {wedgeLateral9Config.distanceMinM} m to{" "}
            {wedgeLateral9Config.distanceMaxM} m. Each shot records direction, dispersion, vertical
            strike, and horizontal contact, with a bonus for solid strikes with middle contact. Sign
            in to save your session when you finish.
          </p>
          <WedgeLateral9Runner />
        </div>
      </div>
    </div>
  );
}
