"use client";

import { CombinePerformanceGradeBadge } from "@/components/CombinePerformanceGradeBadge";
import {
  explainCombineGrade,
  type CombinePerformanceGrade,
  type CombinePerformanceGradeId,
} from "@/lib/combinePerformanceGrade";

type GradeInput = Pick<CombinePerformanceGrade, "id" | "label"> & {
  pctOfMax?: number;
  equivalentOutOf150?: number;
};

type SelfCompare = {
  /** Signed delta vs recent average (positive = better when higherIsBetter). */
  delta: number | null;
  /** e.g. "+4 pts vs your last 3" or "First attempt logged" */
  label: string;
};

type Props = {
  grade: GradeInput;
  /** Optional override; defaults to explainCombineGrade(grade). */
  whyText?: string;
  selfCompare?: SelfCompare | null;
  className?: string;
};

/** Grade badge + why-this-grade line + optional vs-self comparison. */
export function CombineGradeSummary({ grade, whyText, selfCompare, className = "" }: Props) {
  const why = whyText ?? explainCombineGrade(grade);
  return (
    <div className={`mt-3 space-y-1.5 ${className}`.trim()}>
      <span className="inline-block rounded-xl bg-white">
        <CombinePerformanceGradeBadge
          gradeId={grade.id as CombinePerformanceGradeId}
          label={grade.label}
        />
      </span>
      <p className="text-[11px] leading-snug text-white/75">{why}</p>
      {selfCompare && (
        <p className="text-[11px] font-semibold text-[#FFC966]">{selfCompare.label}</p>
      )}
    </div>
  );
}

/** Build a short self-compare line from recent attempt scores (same units as `current`). */
export function formatSelfCompare(opts: {
  current: number;
  recent: number[];
  higherIsBetter?: boolean;
  unit?: string;
}): SelfCompare {
  const { current, recent, higherIsBetter = true, unit = "pts" } = opts;
  if (recent.length === 0) {
    return { delta: null, label: "First attempt logged" };
  }
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const raw = current - avg;
  const delta = higherIsBetter ? raw : -raw;
  const abs = Math.abs(raw);
  const rounded = abs >= 10 ? Math.round(abs) : Math.round(abs * 10) / 10;
  const n = recent.length;
  if (Math.abs(raw) < 0.05) {
    return { delta: 0, label: `Even with your last ${n}` };
  }
  const sign = delta > 0 ? "+" : "−";
  const unitSuffix = unit === "%" ? "%" : unit === "pts" ? " pts" : ` ${unit}`;
  return {
    delta,
    label: `${sign}${rounded}${unitSuffix} vs your last ${n}`,
  };
}
