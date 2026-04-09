"use client";

import { useMemo } from "react";
import {
  computeMissDiagnostics,
  type HoleLogForDiagnostics,
  PRIMARY_MISS_LABELS,
  type PrimaryMissReason,
} from "@/lib/puttingTestMissDiagnostics";

type Props = {
  holeLog: HoleLogForDiagnostics[];
};

const ORDER: PrimaryMissReason[] = ["read", "speed", "startLine"];

export function PuttingMissDiagnosticsSection({ holeLog }: Props) {
  const data = useMemo(() => computeMissDiagnostics(holeLog), [holeLog]);

  if (!data?.advice) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm space-y-4">
      <h3 className="text-base font-semibold text-gray-900">Miss Diagnostics</h3>
      <p className="text-xs text-gray-500">
        Based on {data.counted} missed first putt{data.counted !== 1 ? "s" : ""} with a primary reason
        {data.totalMisses > data.counted
          ? ` (${data.totalMisses - data.counted} older miss${data.totalMisses - data.counted !== 1 ? "es" : ""} without reason data)`
          : ""}
        .
      </p>

      <div className="space-y-3">
        {ORDER.map((key) => {
          const label = PRIMARY_MISS_LABELS[key];
          const pct = data.percentages[key];
          return (
            <div key={key}>
              <div className="flex justify-between text-xs font-medium text-gray-700 mb-1">
                <span>{label}</span>
                <span>{pct}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#014421] transition-all"
                  style={{ width: `${pct}%`, opacity: key === data.dominant ? 1 : 0.55 }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="pt-1 border-t border-gray-100 space-y-2">
        <p className="text-sm text-gray-800">
          <span className="text-gray-600">Dominant reason:</span>{" "}
          <span className="font-semibold text-gray-900">{data.dominantLabel}</span>
        </p>
        <p className="text-sm font-medium text-[#014421] leading-snug">{data.advice}</p>
      </div>
    </div>
  );
}
