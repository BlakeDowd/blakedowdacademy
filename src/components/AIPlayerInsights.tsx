"use client";

import React, { useMemo } from 'react';
import { DRILLS } from '@/data/drills';
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

  const formatValue = (m: { unit: string; actual: number }) =>
    m.unit === '%' ? `${m.actual.toFixed(1)}%` : m.actual.toFixed(1);

  const formatGoal = (m: { unit: string; goal: number }) =>
    m.unit === '%' ? `${m.goal.toFixed(1)}%` : m.goal.toFixed(1);

  const sectionColors: Record<string, string> = {
    'Driving': '#3B82F6',
    'Approach': '#8B5CF6',
    'Short Game': '#10B981',
    'Putting': '#F59E0B',
    'Penalties': '#EF4444',
  };

  return (
    <div className="bg-[#05412B] rounded-[40px] p-6 text-white shadow-2xl relative overflow-hidden mb-6">
      <div className="absolute top-0 right-0 p-6 opacity-10">
        <Sparkles size={120} />
      </div>

      <div className="relative z-10">
        {showHeader && (
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-[#FF9800]" />
            </div>
            <div>
              <h2 className="font-bold text-lg tracking-wider">Coach&apos;s Insights</h2>
              <p className="text-white/70 text-xs">Full-Game Performance Analysis</p>
            </div>
          </div>
        )}

        {!hasData ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-4">
              <Target className="w-8 h-8 text-white/30" />
            </div>
            <p className="text-white/70 text-sm font-medium mb-2">No Round Data Entered</p>
            <p className="text-white/50 text-xs leading-relaxed max-w-xs mx-auto">
              Log your first round to unlock personalised coaching insights, weakness analysis, and drill recommendations.
            </p>
          </div>
        ) : (
        <>
        <p className="text-sm text-white/90 leading-relaxed mb-6 italic border-l-2 border-[#FF9800] pl-3">
          &ldquo;I&apos;ve broken down every area of your game against your target goals. Here are the gaps that will make the biggest difference to your scores.&rdquo;
        </p>

        {/* ===== TOP 5 WEAKNESSES (The Fix) ===== */}
        <div className="space-y-4 mb-6">
          <h3 className="text-xs font-bold text-[#FF9800] tracking-wider flex items-center gap-2">
            <Target className="w-4 h-4" /> Top {weaknesses.length} Priority Areas
          </h3>

          {weaknesses.length > 0 ? (
            <div className="grid gap-3">
              {weaknesses.map((w, idx) => {
                const drill = findDrillForCategory(w.drillCategory, drillsProp);
                return (
                  <div key={idx} className="bg-white/5 rounded-2xl p-4 border border-white/10">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: sectionColors[w.section] + '30', color: sectionColors[w.section] }}
                          >
                            {w.section}
                          </span>
                          <span className="font-bold text-sm">{w.name}</span>
                        </div>
                        <div className="text-xs text-white/60">
                          Current: {formatValue(w)} &nbsp;|&nbsp; Target: {formatGoal(w)}
                        </div>
                      </div>
                      <span className="text-[#FF4444] text-xs font-bold px-2 py-1 bg-[#FF4444]/10 rounded-md shrink-0 ml-2">
                        {Math.abs(w.rawGap).toFixed(1)}{w.unit === '%' ? '%' : ''} gap
                      </span>
                    </div>

                    {drill && (
                      <div className="mt-3 pt-3 border-t border-white/10">
                        <span className="text-[10px] text-white/50 uppercase mb-1 block">Recommended Drill:</span>
                        <Link href={`/library?drill=${drill.id}`} className="flex items-center justify-between group">
                          <span className="text-sm text-[#FF9800] font-medium">{drill.title}</span>
                          <div className="w-6 h-6 rounded-full bg-[#FF9800]/20 flex items-center justify-center">
                            <ArrowRight className="w-3 h-3 text-[#FF9800]" />
                          </div>
                        </Link>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white/5 rounded-2xl p-4 border border-white/10 text-sm">
              You are currently meeting or exceeding all your goals. Incredible work &mdash; keep up the consistent practice.
            </div>
          )}

          {/* No Data metrics */}
          {noDataMetrics.length > 0 && (
            <div className="bg-white/5 rounded-xl p-3 border border-white/5">
              <span className="text-[10px] text-white/40 uppercase tracking-wider font-bold">No Data Entered:</span>
              <p className="text-xs text-white/50 mt-1">
                {noDataMetrics.map(m => m.name).join(', ')}
              </p>
            </div>
          )}
        </div>

        {/* ===== PLAYING IDENTITY (The Fuel) ===== */}
        <div className="bg-[#01301F] rounded-2xl p-5 border border-[#FF9800]/30 shadow-inner">
          <h3 className="text-xs font-bold text-[#FF9800] tracking-wider mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> Your Playing Identity
          </h3>

          {identityItems.length > 0 ? (
            <div className="space-y-2 mb-4">
              {identityItems.map((item, idx) => (
                <div
                  key={idx}
                  className={`flex items-center justify-between rounded-xl px-3 py-2.5 ${
                    item.badge ? 'bg-white/8 border border-white/10' : 'bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span
                      className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0"
                      style={{ backgroundColor: sectionColors[item.section] + '30', color: sectionColors[item.section] }}
                    >
                      {item.section}
                    </span>
                    <div className="min-w-0">
                      <span className="text-sm font-medium block truncate">{item.name}</span>
                      {item.badge === 'engine' && (
                        <span className="text-[10px] font-bold text-[#FF9800] flex items-center gap-1 mt-0.5">
                          <Zap className="w-3 h-3" /> Your Scoring Engine
                        </span>
                      )}
                      {item.badge === 'pressure' && (
                        <span className="text-[10px] font-bold text-[#4ADE80] flex items-center gap-1 mt-0.5">
                          <Shield className="w-3 h-3" /> Pressure Proof
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-[#4ADE80] text-xs font-bold shrink-0 ml-2">
                    +{Math.abs(item.rawGap).toFixed(1)}{item.unit === '%' ? '%' : ''} ahead
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-white/50 mb-4">
              Log more detailed stats to identify your strengths.
            </p>
          )}

          {/* Coach's Practice Split Note */}
          <div className="bg-[#FF9800]/10 border border-[#FF9800]/20 rounded-xl p-3 flex gap-3 items-start">
            <AlertTriangle className="w-5 h-5 text-[#FF9800] shrink-0 mt-0.5" />
            <p className="text-xs text-white/80 leading-relaxed">
              <span className="font-bold text-white">Coach&apos;s Note:</span>{' '}
              A balanced practice plan protects your identity while attacking your limits.
              We spend <span className="text-white font-bold">70%</span> of our time on the{' '}
              <span className="text-[#FF4444] font-bold">Fix</span> and{' '}
              <span className="text-white font-bold">30%</span> on the{' '}
              <span className="text-[#4ADE80] font-bold">Fuel</span> (Strengths).
            </p>
          </div>
        </div>
        </>
        )}
      </div>
    </div>
  );
}
