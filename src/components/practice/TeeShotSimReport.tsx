"use client";

import type { ReactNode } from "react";
import { formatHandicap } from "@/lib/practiceHandicap";
import {
  analyzeTeeSession,
  teeResultLabel,
  teeShotHandicapBands,
  type TeeLie,
  type TeeSide,
  type TeeShotResult,
} from "@/lib/teeShotSim";

export type TeeReportShot = {
  points: number;
  lie: string;
  distanceM: number;
  offlineM: number;
  side: string;
  danger: boolean;
  club?: string | null;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export function parseTeeShots(strikeData: unknown): TeeReportShot[] | null {
  if (!Array.isArray(strikeData) || strikeData.length === 0) return null;
  const shots: TeeReportShot[] = [];
  for (const raw of strikeData) {
    const o = asRecord(raw);
    if (!o) return null;
    const points = Number(o.points);
    const distanceM = Number(o.distanceM);
    const offlineM = Number(o.offlineM ?? 0);
    if (!Number.isFinite(points) || !Number.isFinite(distanceM)) return null;
    shots.push({
      points,
      lie: String(o.lie ?? "rough"),
      distanceM,
      offlineM: Number.isFinite(offlineM) ? offlineM : 0,
      side: String(o.side ?? "C"),
      danger: Boolean(o.danger),
      club: typeof o.club === "string" && o.club ? o.club : null,
    });
  }
  return shots;
}

function toResults(shots: TeeReportShot[]): TeeShotResult[] {
  return shots.map((s, i) => ({
    id: `r-${i}`,
    scenarioId: `s-${i}`,
    distanceM: s.distanceM,
    land: { x: s.offlineM, y: s.distanceM },
    lie: (["fairway", "rough", "bunker", "water", "oob"].includes(s.lie)
      ? s.lie
      : "rough") as TeeLie,
    offlineM: s.offlineM,
    side: (s.side === "L" || s.side === "R" || s.side === "C" ? s.side : "C") as TeeSide,
    danger: s.danger,
    points: s.points,
    club: s.club,
  }));
}

function Card({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-stone-100 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-stone-500">{title}</p>
        {aside ? <p className="text-[11px] font-medium text-stone-400">{aside}</p> : null}
      </div>
      {children}
    </div>
  );
}

function fmtSg(v: number): string {
  if (v > 0) return `+${v.toFixed(2)}`;
  return v.toFixed(2);
}

/** Rich report for Tee Shot Simulator sessions. */
export function TeeShotSimReport({ shots }: { shots: TeeReportShot[] }) {
  const analysis = analyzeTeeSession(toResults(shots));
  const { stats } = analysis;
  const bands = teeShotHandicapBands();
  const byPoints = [...shots].sort((a, b) => b.points - a.points);
  const best = byPoints[0]!;
  const worst = byPoints[byPoints.length - 1]!;

  const sortedBands = [...bands].sort((a, b) => b.score - a.score);
  let rangeLabel = `Weaker than ${formatHandicap(sortedBands[sortedBands.length - 1]!.hcp)}`;
  if (stats.score >= sortedBands[0]!.score) {
    rangeLabel = `${formatHandicap(sortedBands[0]!.hcp)} or better`;
  } else {
    for (let i = 0; i < sortedBands.length - 1; i++) {
      const hi = sortedBands[i]!;
      const lo = sortedBands[i + 1]!;
      if (stats.score <= hi.score && stats.score >= lo.score) {
        rangeLabel = `${formatHandicap(hi.hcp)}–${formatHandicap(lo.hcp)} scoring`;
        break;
      }
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-[#014421] p-4 text-white">
        <p className="text-[11px] font-medium text-white/70">Set score</p>
        <p className="text-3xl font-bold tabular-nums">{stats.score}/100</p>
        <p className="mt-1 text-xs text-white/75">
          FIR {stats.firPct}% · {stats.band} · est. {formatHandicap(analysis.handicapEstimate)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-white p-3 ring-1 ring-stone-100">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
            Dominant miss
          </p>
          <p className="mt-0.5 text-base font-bold text-stone-900">{analysis.dominantMiss}</p>
          <p className="text-[11px] text-stone-500">{analysis.dominantMissDetail}</p>
          <p className="mt-1.5 text-[11px] text-stone-600">
            L {analysis.left} · R {analysis.right} · centre {analysis.centre}
            {analysis.dangerMisses > 0 ? ` · ${analysis.dangerMisses} danger` : ""}
          </p>
        </div>
        <div className="rounded-2xl bg-white p-3 ring-1 ring-stone-100">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
            Est. SG: Tee
          </p>
          <p className="mt-0.5 text-base font-bold tabular-nums text-stone-900">
            {fmtSg(analysis.sgTotal)}
          </p>
          <p className="text-[11px] text-stone-500">
            {fmtSg(analysis.sgPerShot)} / shot vs scratch baseline
          </p>
          <p className="mt-1.5 text-[11px] text-stone-600">
            Avg offline {analysis.avgOfflineM != null ? `${analysis.avgOfflineM} m` : "—"}
          </p>
        </div>
      </div>

      <Card title="Handicap range scoring" aside={rangeLabel}>
        <ul className="space-y-1.5">
          {bands.map((b) => {
            const active =
              Math.abs(stats.score - b.score) <=
              Math.min(...bands.map((x) => Math.abs(stats.score - x.score)));
            return (
              <li
                key={b.hcp}
                className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm ${
                  active ? "bg-[#014421]/10 ring-1 ring-[#014421]/20" : "bg-stone-50"
                }`}
              >
                <span className="font-medium text-stone-800">
                  {formatHandicap(b.hcp)}
                  <span className="ml-1.5 text-[11px] font-normal text-stone-500">{b.label}</span>
                </span>
                <span className="font-bold tabular-nums text-stone-900">{b.score}/100</span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[11px] text-stone-500">
          Your set {stats.score}/100 ≈ {formatHandicap(analysis.handicapEstimate)} driving estimate.
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-emerald-50 p-3 ring-1 ring-emerald-100">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Best</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-emerald-900">{best.points} pts</p>
          <p className="text-[11px] text-emerald-800/80">
            {Math.round(best.distanceM)} m{best.club ? ` · ${best.club}` : ""} · {best.lie}
          </p>
        </div>
        <div className="rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-100">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-800">Worst</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-amber-950">{worst.points} pts</p>
          <p className="text-[11px] text-amber-900/80">
            {Math.round(worst.distanceM)} m{worst.club ? ` · ${worst.club}` : ""} · {worst.lie}
            {worst.danger ? " · danger" : ""}
          </p>
        </div>
      </div>

      {analysis.lieBreakdown.length > 0 && (
        <Card title="Landing breakdown">
          <ul className="space-y-2">
            {analysis.lieBreakdown.map((row) => (
              <li key={row.lie} className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium text-stone-800">{teeResultLabel(row.lie)}</span>
                <span className="text-xs text-stone-600">
                  <span className="font-bold tabular-nums text-stone-900">{row.n}</span> · {row.pct}%
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Shot by shot">
        <ol className="space-y-1.5">
          {shots.map((s, i) => (
            <li
              key={`${s.distanceM}-${i}`}
              className="flex items-center justify-between gap-2 rounded-lg bg-stone-50 px-2.5 py-1.5 text-xs"
            >
              <span className="min-w-0 font-medium text-stone-700">
                #{i + 1} · {Math.round(s.distanceM)} m
                {s.club ? ` · ${s.club}` : ""}
                <span className="block truncate font-normal text-stone-500">
                  {teeResultLabel(
                    (["fairway", "rough", "bunker", "water", "oob"].includes(s.lie)
                      ? s.lie
                      : "rough") as TeeLie,
                  )}
                  {s.side === "C"
                    ? " · centre"
                    : ` · ${Math.abs(s.offlineM)} m ${s.side}${s.danger ? " danger" : " safe"}`}
                </span>
              </span>
              <span
                className={`shrink-0 font-bold tabular-nums ${
                  s.danger ? "text-red-700" : "text-[#014421]"
                }`}
              >
                {s.points}
              </span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
