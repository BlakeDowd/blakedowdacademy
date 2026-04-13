import Link from "next/link";
import { StrikeAndSpeedControlTestRunner } from "@/components/StrikeAndSpeedControlTestRunner";
import { CombineCommunityHighlights } from "@/components/CombineCommunityHighlights";
import { combineHighlightStrikeSpeed } from "@/lib/combineHighlightDefinitions";
import { strikeAndSpeedControlTestConfig } from "@/lib/strikeAndSpeedControlTestConfig";

export default function StrikeAndSpeedControlTestPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-lg px-4 py-6 pb-24">
        <Link
          href="/practice"
          className="inline-flex items-center text-sm font-medium text-[#014421] hover:underline mb-4"
        >
          ← Back to Practice
        </Link>
        <header className="mb-2">
          <h1 className="text-2xl font-bold text-gray-900">{strikeAndSpeedControlTestConfig.testName}</h1>
        </header>
        <StrikeAndSpeedControlTestRunner />
        <CombineCommunityHighlights definition={combineHighlightStrikeSpeed} />
      </div>
    </div>
  );
}
