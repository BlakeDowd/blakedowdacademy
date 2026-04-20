import type { CombinePerformanceGradeId } from "@/lib/combinePerformanceGrade";

const GRADE_BADGE_CLASS: Record<CombinePerformanceGradeId, string> = {
  tour_pro:
    "border-emerald-500 bg-emerald-500/[0.12] text-emerald-900 shadow-sm shadow-emerald-900/5",
  scratch_elite:
    "border-blue-600 bg-blue-600/[0.12] text-blue-950 shadow-sm shadow-blue-900/5",
  advanced:
    "border-amber-500 bg-amber-400/[0.18] text-amber-950 shadow-sm shadow-amber-900/5",
  developing:
    "border-orange-500 bg-orange-500/[0.12] text-orange-950 shadow-sm shadow-orange-900/5",
  establishing:
    "border-gray-400 bg-gray-400/[0.14] text-gray-800 shadow-sm shadow-gray-900/5",
};

type Props = {
  gradeId: CombinePerformanceGradeId;
  label: string;
  className?: string;
};

/** Premium badge: subtle fill, solid border, bold caps — session / results summary. */
export function CombinePerformanceGradeBadge({ gradeId, label, className = "" }: Props) {
  const ring = GRADE_BADGE_CLASS[gradeId];
  return (
    <span
      role="status"
      className={`inline-flex max-w-full items-center justify-center rounded-xl border-2 px-4 py-2 text-center text-xs font-bold uppercase tracking-[0.08em] sm:text-sm ${ring} ${className}`.trim()}
    >
      {label}
    </span>
  );
}
