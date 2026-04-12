import Link from "next/link";
import { IronPrecisionProtocolRunner } from "@/components/IronPrecisionProtocolRunner";
import { ironPrecisionProtocolConfig } from "@/lib/ironPrecisionProtocolConfig";

export default function IronPrecisionProtocolPage() {
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
          <h1 className="text-2xl font-bold text-gray-900">{ironPrecisionProtocolConfig.testName}</h1>
        </header>
        <IronPrecisionProtocolRunner />
      </div>
    </div>
  );
}
