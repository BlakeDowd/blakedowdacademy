import Link from "next/link";
import { StartLineAndSpeedControlTestRunner } from "@/components/StartLineAndSpeedControlTestRunner";
import { CombineCommunityHighlights } from "@/components/CombineCommunityHighlights";
import { combineHighlightStartLine } from "@/lib/combineHighlightDefinitions";
import { startLineAndSpeedControlTestConfig } from "@/lib/startLineAndSpeedControlTestConfig";

export default function StartLineAndSpeedControlTestPage() {
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
          <h1 className="text-2xl font-bold text-gray-900">{startLineAndSpeedControlTestConfig.testName}</h1>
        </header>
        <StartLineAndSpeedControlTestRunner />
        <CombineCommunityHighlights definition={combineHighlightStartLine} />
      </div>
    </div>
  );
}
