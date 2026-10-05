"use client";

import React, { useEffect, useMemo } from 'react';
import { DRILLS } from '@/data/drills';
import { RECOMMENDED_DRILLS_STORAGE_KEY } from '@/lib/academyTrophies';
import Link from 'next/link';
import { Sparkles, ArrowRight, Target, TrendingUp, AlertTriangle, Shield, Zap } from 'lucide-react';

interface MetricDefinition {
  name: string;
  actual: number;
  goal: number;
  section: 'Driving' | 'Approach' | 'Short Game' | 'Putting' | 'Penalties';
  drillCategory: string;
  isLowerBetter: boolean;
  unit: '%' | 'avg';
  hasAttempts: boolean;
  zeroIsStrength?: boolean;
}

interface MetricWithGap extends MetricDefinition {
  gap: number;
  rawGap: number;
}

interface IdentityItem extends MetricWithGap {
  badge?: 'pressure' | 'engine';
}

interface AttemptCounts {
  fir: number;
  gir: number;
  girProximity: number;
  upDown: number;
  bunker: number;
  putts6ft: number;
  putts: number;
}

/** Optional: pass your real drill list (e.g. from Supabase / Library). If omitted, falls back to static DRILLS. */
export type DrillOption = { id: string; title: string; category: string };

interface AIPlayerInsightsProps {
  /** When provided, recommendations use this list instead of the static drill list */
  drills?: DrillOption[] | null;
  performanceMetrics: {
    firPercent: number;
    girPercent: number;
    gir8ft: number;
    gir20ft: number;
    upAndDownPercent: number;
    bunkerSaves: number;
    chipInside6ft: number;
    avgPutts: number;
    puttsUnder6ftMake: number;
    avgThreePutts: number;
    teePenalties: number;
    approachPenalties: number;
    totalPenalties: number;
    _attempts?: AttemptCounts;
  };
  goals: {
    fir: number;
    gir: number;
    within8ft: number;
    within20ft: number;
    upAndDown: number;
    bunkerSaves: number;
    chipsInside6ft: number;
    putts: number;
    puttMake6ft: number;
    teePenalties: number;
    approachPenalties: number;
    totalPenalties: number;
  };
  roundCount?: number;
  showHeader?: boolean;
}

const DRILL_CATEGORY_MAP: Record<string, string[]> = {
  'Driving':    ['Driving'],
  'Irons':      ['Irons', 'Technique', 'Approach'],
  'Short Game': ['Short Game', 'Chipping'],
  'Putting':    ['Putting'],
  'Bunkers':    ['Short Game', 'Chipping', 'Bunkers'],
  'Mental':     ['Mental Game', 'Strategy'],
};

function findDrillForCategory(
  drillCategory: string,
  drillList: DrillOption[] | null | undefined
): DrillOption | null {
  const searchCategories = DRILL_CATEGORY_MAP[drillCategory] || [drillCategory];
  const list = drillList && drillList.length > 0 ? drillList : DRILLS.map(d => ({ id: d.id, title: d.title, category: d.category }));
  const matches = list.filter(d =>
    searchCategories.some(cat => (d.category || '').toLowerCase().includes(cat.toLowerCase()))
  );
  if (matches.length > 0) {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    return matches[dayOfYear % matches.length];
  }
  return null;
}

export function AIPlayerInsights({
  drills: drillsProp,
  performanceMetrics,
  goals,
  roundCount = -1,
  showHeader = true,
}: AIPlayerInsightsProps) {
  const hasData = roundCount > 0 || (roundCount === -1 && Object.entries(performanceMetrics).some(([k, v]) => k !== '_attempts' && (v as number) > 0));

  const { weaknesses, identityItems, noDataMetrics } = useMemo(() => {
    const a = performanceMetrics._attempts || { fir: 0, gir: 0, girProximity: 0, upDown: 0, bunker: 0, putts6ft: 0, putts: 0 };
    const hasRounds = roundCount > 0;

    const allMetrics: MetricDefinition[] = [
      // DRIVING
      { name: 'Driving Accuracy',    actual: performanceMetrics.firPercent,        goal: goals.fir,              section: 'Driving',    drillCategory: 'Driving',    isLowerBetter: false, unit: '%',  hasAttempts: a.fir > 0 },
      { name: 'Tee Penalties',        actual: performanceMetrics.teePenalties,      goal: goals.teePenalties,     section: 'Driving',    drillCategory: 'Driving',    isLowerBetter: true,  unit: 'avg', hasAttempts: hasRounds, zeroIsStrength: true },
      // APPROACH
      { name: 'Greens in Regulation', actual: performanceMetrics.girPercent,        goal: goals.gir,              section: 'Approach',   drillCategory: 'Irons',      isLowerBetter: false, unit: '%',  hasAttempts: a.gir > 0 },
      { name: 'GIR Inside 8ft',       actual: performanceMetrics.gir8ft,            goal: goals.within8ft,        section: 'Approach',   drillCategory: 'Irons',      isLowerBetter: false, unit: '%',  hasAttempts: a.girProximity > 0 },
      { name: 'GIR Inside 20ft',      actual: performanceMetrics.gir20ft,           goal: goals.within20ft,       section: 'Approach',   drillCategory: 'Irons',      isLowerBetter: false, unit: '%',  hasAttempts: a.girProximity > 0 },
      { name: 'Approach Penalties',    actual: performanceMetrics.approachPenalties, goal: goals.approachPenalties,section: 'Approach',   drillCategory: 'Irons',      isLowerBetter: true,  unit: 'avg', hasAttempts: hasRounds, zeroIsStrength: true },
      // SHORT GAME
      { name: 'Up & Down %',          actual: performanceMetrics.upAndDownPercent,  goal: goals.upAndDown,        section: 'Short Game', drillCategory: 'Short Game', isLowerBetter: false, unit: '%',  hasAttempts: a.upDown > 0 },
      { name: 'Bunker Saves %',       actual: performanceMetrics.bunkerSaves,       goal: goals.bunkerSaves,      section: 'Short Game', drillCategory: 'Bunkers',    isLowerBetter: false, unit: '%',  hasAttempts: a.bunker > 0 },
      { name: 'Scrambling (< 6ft)',    actual: performanceMetrics.chipInside6ft,    goal: goals.chipsInside6ft,   section: 'Short Game', drillCategory: 'Short Game', isLowerBetter: false, unit: '%',  hasAttempts: a.upDown > 0 },
      // PUTTING
      { name: 'Average Putts',        actual: performanceMetrics.avgPutts,          goal: goals.putts,            section: 'Putting',    drillCategory: 'Putting',    isLowerBetter: true,  unit: 'avg', hasAttempts: a.putts > 0 },
      { name: '< 6ft Make %',         actual: performanceMetrics.puttsUnder6ftMake, goal: goals.puttMake6ft,      section: 'Putting',    drillCategory: 'Putting',    isLowerBetter: false, unit: '%',  hasAttempts: a.putts6ft > 0 },
      { name: '3-Putts (Avg)',         actual: performanceMetrics.avgThreePutts,     goal: Math.max(0, goals.putts / 18 - 1), section: 'Putting', drillCategory: 'Putting', isLowerBetter: true, unit: 'avg', hasAttempts: a.putts > 0 },
    ];

    // Separate metrics with data from those without
    const noData = allMetrics.filter(m => !m.hasAttempts && !m.zeroIsStrength);
    const validMetrics = allMetrics.filter(m => m.hasAttempts || m.zeroIsStrength);

    const withGaps: MetricWithGap[] = validMetrics.map(m => {
      const rawGap = m.isLowerBetter ? m.goal - m.actual : m.actual - m.goal;
      const gap = m.isLowerBetter ? rawGap * 3 : rawGap;
      return { ...m, gap, rawGap };
    });

    // --- WEAKNESSES: top 5 negative gaps (only from metrics with real data) ---
    const sorted = [...withGaps].sort((a, b) => a.gap - b.gap);
    const w = sorted.filter(m => m.gap < 0).slice(0, 5);

    // --- IDENTITY: 5 items (only from metrics with real data) ---
    const positives = [...withGaps].filter(m => m.gap >= 0).sort((a, b) => b.gap - a.gap);
    const pool = positives.length >= 3 ? positives : [...withGaps].sort((a, b) => b.gap - a.gap);

    // 1) Scoring Engine: largest positive raw gap
    const engineCandidate = pool[0] || null;

    // 2) Pressure Proof: highest actual/goal ratio among metrics with attempts
    const pressurePool = pool.filter(m => m.goal !== 0);
    let pressureCandidate: MetricWithGap | null = null;
    if (pressurePool.length > 0) {
      pressureCandidate = pressurePool.reduce((best, m) => {
        const ratio = m.isLowerBetter ? m.goal / Math.max(m.actual, 0.01) : m.actual / Math.max(m.goal, 0.01);
        const bestRatio = best.isLowerBetter ? best.goal / Math.max(best.actual, 0.01) : best.actual / Math.max(best.goal, 0.01);
        return ratio > bestRatio ? m : best;
      });
    }
    if (pressureCandidate && engineCandidate && pressureCandidate.name === engineCandidate.name) {
      const alt = pressurePool.find(m => m.name !== engineCandidate.name);
      if (alt) pressureCandidate = alt;
    }

    // 3) Top 3 strengths (excluding engine/pressure)
    const usedNames = new Set<string>();
    if (engineCandidate) usedNames.add(engineCandidate.name);
    if (pressureCandidate) usedNames.add(pressureCandidate.name);
    const top3 = pool.filter(m => !usedNames.has(m.name)).slice(0, 3);

    // Assemble final 5 identity items
    const items: IdentityItem[] = [];
    if (engineCandidate) items.push({ ...engineCandidate, badge: 'engine' });
    if (pressureCandidate && pressureCandidate.name !== engineCandidate?.name) {
      items.push({ ...pressureCandidate, badge: 'pressure' });
    }
    top3.forEach(s => items.push({ ...s }));

    return { weaknesses: w, identityItems: items.slice(0, 5), noDataMetrics: noData };
  }, [performanceMetrics, goals, roundCount]);

  useEffect(() => {
    const ids = weaknesses
      .map((w) => findDrillForCategory(w.drillCategory, drillsProp)?.id)
      .filter((id): id is string => !!id);
    if (ids.length === 0) return;
    try {
      const prev: string[] = JSON.parse(localStorage.getItem(RECOMMENDED_DRILLS_STORAGE_KEY) || '[]');
      const next = [...new Set([...ids, ...prev])].slice(0, 50);
      localStorage.setItem(RECOMMENDED_DRILLS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, [weaknesses, drillsProp]);

  const formatValue = (m: { unit: string; actual: number }) =>
    m.unit === '%' ? `${m.actual.toFixed(1)}%` : m.actual.toFixed(1);

  const formatGoal = (m: { unit: string; goal: number }) =>
    m.unit === '%' ? `${m.goal.toFixed(1)}%` : m.goal.toFixed(1);

  const sectionChip = (section: string) => (
    <span className="shrink-0 rounded bg-[#014421]/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#014421]">
      {section}
    </span>
  );

  return (
    <div className="mb-2">
      {showHeader && (
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Coach&apos;s Insights</h2>
            <p className="text-xs text-gray-600">Full-game performance analysis</p>
          </div>
        </div>
      )}

      {!hasData ? (
        <div className="rounded-xl bg-gray-50 px-4 py-8 text-center">
          <Target className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="mb-1 text-sm font-semibold text-gray-700">No round data entered</p>
          <p className="mx-auto max-w-xs text-xs leading-relaxed text-gray-500">
            Log your first round to unlock personalised coaching insights, weakness analysis, and drill recommendations.
          </p>
        </div>
      ) : (
        <>
          <p className="mb-5 border-l-2 border-[#FFA500] pl-3 text-sm italic leading-relaxed text-gray-600">
            &ldquo;I&apos;ve broken down every area of your game against your target goals. Here are the gaps that will make the biggest difference to your scores.&rdquo;
          </p>

          {/* ===== TOP 5 WEAKNESSES (The Fix) ===== */}
          <div className="mb-5 rounded-xl border border-red-100 bg-red-50/40 p-4">
            <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#014421]">
              <Target className="h-4 w-4" /> Top {weaknesses.length} Priority Areas
            </h3>

            {weaknesses.length > 0 ? (
              <div className="space-y-2">
                {weaknesses.map((w, idx) => {
                  const drill = findDrillForCategory(w.drillCategory, drillsProp);
                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2.5"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        {sectionChip(w.section)}
                        <div className="min-w-0">
                          <span className="block truncate text-sm font-medium text-gray-900">{w.name}</span>
                          {drill && (
                            <Link
                              href={`/library?drill=${drill.id}`}
                              className="mt-0.5 flex items-center gap-1 text-[10px] font-bold text-[#014421] hover:underline"
                            >
                              <span className="truncate">Drill: {drill.title}</span>
                              <ArrowRight className="h-3 w-3 shrink-0 text-[#FFA500]" />
                            </Link>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="block text-xs font-bold text-red-600">
                          {Math.abs(w.rawGap).toFixed(1)}{w.unit === '%' ? '%' : ''} gap
                        </span>
                        <span className="mt-0.5 block text-[10px] text-gray-500">
                          {formatValue(w)} → {formatGoal(w)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-gray-600">
                You are currently meeting or exceeding all your goals. Incredible work &mdash; keep up the consistent practice.
              </p>
            )}

            {noDataMetrics.length > 0 && (
              <p className="mt-3 text-[10px] text-gray-500">
                <span className="font-bold uppercase tracking-wider text-gray-400">No data entered: </span>
                {noDataMetrics.map((m) => m.name).join(', ')}
              </p>
            )}
          </div>

          {/* ===== PLAYING IDENTITY (The Fuel) ===== */}
          <div className="rounded-xl border border-[#014421]/15 bg-[#014421]/[0.04] p-4">
            <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#014421]">
              <TrendingUp className="h-4 w-4" /> Your Playing Identity
            </h3>

            {identityItems.length > 0 ? (
              <div className="mb-4 space-y-2">
                {identityItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2.5"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      {sectionChip(item.section)}
                      <div className="min-w-0">
                        <span className="block truncate text-sm font-medium text-gray-900">{item.name}</span>
                        {item.badge === 'engine' && (
                          <span className="mt-0.5 flex items-center gap-1 text-[10px] font-bold text-[#FFA500]">
                            <Zap className="h-3 w-3" /> Your Scoring Engine
                          </span>
                        )}
                        {item.badge === 'pressure' && (
                          <span className="mt-0.5 flex items-center gap-1 text-[10px] font-bold text-[#014421]">
                            <Shield className="h-3 w-3" /> Pressure Proof
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs font-bold text-green-700">
                      +{Math.abs(item.rawGap).toFixed(1)}{item.unit === '%' ? '%' : ''} ahead
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mb-4 text-xs text-gray-500">Log more detailed stats to identify your strengths.</p>
            )}

            <div className="flex items-start gap-3 rounded-xl border border-orange-100 bg-orange-50 p-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#FFA500]" />
              <p className="text-xs leading-relaxed text-gray-700">
                <span className="font-bold text-gray-900">Coach&apos;s Note:</span>{' '}
                A balanced practice plan protects your identity while attacking your limits.
                We spend <span className="font-bold text-gray-900">70%</span> of our time on the{' '}
                <span className="font-bold text-red-600">Fix</span> and{' '}
                <span className="font-bold text-gray-900">30%</span> on the{' '}
                <span className="font-bold text-green-700">Fuel</span> (Strengths).
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
