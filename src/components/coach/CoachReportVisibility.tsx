"use client";

import { createContext, useContext, type ReactNode } from "react";

/** When false, empty report blocks stay off the page (session diagnostic default). */
export const CoachReportShowEmptyContext = createContext(true);

export function CoachReportShowEmptyProvider({
  showEmpty,
  children,
}: {
  showEmpty: boolean;
  children: ReactNode;
}) {
  return (
    <CoachReportShowEmptyContext.Provider value={showEmpty}>{children}</CoachReportShowEmptyContext.Provider>
  );
}

export function useCoachReportShowEmpty(): boolean {
  return useContext(CoachReportShowEmptyContext);
}

/** Skip rendering when the section has no data and empty sections are hidden. */
export function ReportGate({ empty, children }: { empty: boolean; children: ReactNode }) {
  const showEmpty = useCoachReportShowEmpty();
  if (empty && !showEmpty) return null;
  return <>{children}</>;
}
