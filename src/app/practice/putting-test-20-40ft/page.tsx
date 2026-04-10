import Link from "next/link";
import { PuttingTest20To40Runner } from "@/components/PuttingTest20To40Runner";
import { puttingTest20To40Config } from "@/lib/puttingTest20To40Config";

export default function PuttingTest20To40Page() {
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
          <h1 className="text-2xl font-bold text-gray-900">{puttingTest20To40Config.testName}</h1>
        </header>
        <PuttingTest20To40Runner />
      </div>
    </div>
  );
}
