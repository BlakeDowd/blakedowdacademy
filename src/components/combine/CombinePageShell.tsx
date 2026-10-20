"use client";

import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { combineHistoryIdForLabel } from "@/lib/combineHistory";

const PastCombineResultsButton = dynamic(
  () => import("@/components/combine/PastCombineResults").then((m) => m.PastCombineResultsButton),
  { ssr: false },
);

/** Page frame for a combine: back link, the runner in a card, then the community section. */
export function CombinePageShell({
  label,
  children,
  footer,
}: {
  label: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const reportId = combineHistoryIdForLabel(label);
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-6 pb-24">
        <div className="mb-4 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/practice"
              className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-[#014421]"
            >
              <ChevronLeft className="w-4 h-4" />
              Practice
            </Link>
            <span className="truncate text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</span>
          </div>
          {reportId && <PastCombineResultsButton reportId={reportId} label={label} />}
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-4 sm:p-5">{children}</div>
        {footer}
      </div>
    </div>
  );
}
