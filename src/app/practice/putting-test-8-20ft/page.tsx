import Link from "next/link";
import { PuttingTest8To20Runner } from "@/components/PuttingTest8To20Runner";
import { puttingTest8To20Config } from "@/lib/puttingTest8To20Config";

export default function PuttingTest8To20Page() {
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
          <h1 className="text-2xl font-bold text-gray-900">{puttingTest8To20Config.testName}</h1>
        </header>
        <PuttingTest8To20Runner />
      </div>
    </div>
  );
}
