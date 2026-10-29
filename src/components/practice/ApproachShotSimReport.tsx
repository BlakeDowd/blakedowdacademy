"use client";

import type { ReactNode } from "react";

export type ApproachReportShot = {
  points: number;
  lie: string;
  proximityM: number | null;
  distanceM: number;
  club?: string | null;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export function parseApproachShots(strikeData: unknown): ApproachReportShot[] | null {
  if (!Array.isArray(strikeData) || strikeData.length === 0) return null;
  const shots: ApproachReportShot[] = [];
  for (const raw of strikeData) {
    const o = asRecord(raw);
    if (!o) return null;
    const points = Number(o.points);
    const distanceM = Number(o.distanceM);
    if (!Number.isFinite(points) || !Number.isFinite(distanceM)) return null;
    const prox = o.proximityM == null ? null : Number(o.proximityM);
    shots.push({
      points,
      lie: String(o.lie ?? "unknown"),
      proximityM: prox != null && Number.isFinite(prox) ? prox : null,
      distanceM,
      club: typeof o.club === "string" && o.club ? o.club : null,
    });
  }
  return shots;
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

type Band = { key: string; label: string; min: number; max: number };

const DISTANCE_BANDS: Band[] = [
  { key: "short", label: "55–90 m", min: 55, max: 90 },
  { key: "mid", label: "90–130 m", min: 90, max: 130 },
  { key: "long", label: "130–175 m", min: 130, max: 176 },
];

function bandFor(distanceM: number): Band {
  return DISTANCE_BANDS.find((b) => distanceM >= b.min && distanceM < b.max) ?? DISTANCE_BANDS[1]!;
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

/** Rich report for Approach Shot Simulator sessions (profile / coach combine history). */
export function ApproachShotSimReport({ shots }: { shots: ApproachReportShot[] }) {
  const gir = shots.filter((s) => s.lie === "green").length;
  const girPct = Math.round((gir / shots.length) * 100);
  const score = Math.round(shots.reduce((a, s) => a + s.points, 0) / shots.length);
  const prox = shots.map((s) => s.proximityM).filter((v): v is number => v != null);
  const avgProx = avg(prox);

  const byPoints = [...shots].sort((a, b) => b.points - a.points);
  const best = byPoints[0]!;
  const worst = byPoints[byPoints.length - 1]!;

  const bandStats = DISTANCE_BANDS.map((band) => {
    const inBand = shots.filter((s) => bandFor(s.distanceM).key === band.key);
    const bandScore = avg(inBand.map((s) => s.points));
    const bandGir = inBand.length
      ? Math.round((inBand.filter((s) => s.lie === "green").length / inBand.length) * 100)
      : null;
    return { band, n: inBand.length, score: bandScore, girPct: bandGir };
  }).filter((b) => b.n > 0);

  const bestBand = [...bandStats].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  const worstBand = [...bandStats].sort((a, b) => (a.score ?? 0) - (b.score ?? 0))[0];

  const byClub = new Map<string, ApproachReportShot[]>();
  for (const s of shots) {
    const key = s.club || "—";
    const list = byClub.get(key) ?? [];
    list.push(s);
    byClub.set(key, list);
  }
  const clubRows = [...byClub.entries()]
    .map(([club, list]) => ({
      club,
      n: list.length,
      score: avg(list.map((s) => s.points)),
      girPct: Math.round((list.filter((s) => s.lie === "green").length / list.length) * 100),
    }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-[#014421] p-4 text-white">
        <p className="text-[11px] font-medium text-white/70">Set score</p>
        <p className="text-3xl font-bold tabular-nums">{score}/100</p>
        <p className="mt-1 text-xs text-white/75">
          GIR {girPct}%
          {avgProx != null ? ` · avg proximity ${avgProx} m` : " · no greens hit"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-emerald-50 p-3 ring-1 ring-emerald-100">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Best shot</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-emerald-900">{best.points} pts</p>
          <p className="text-[11px] text-emerald-800/80">
            {Math.round(best.distanceM)} m
            {best.club ? ` · ${best.club}` : ""}
            {best.proximityM != null ? ` · ${best.proximityM} m to pin` : ` · ${best.lie}`}
          </p>
        </div>
        <div className="rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-100">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-800">Worst shot</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-amber-950">{worst.points} pts</p>
          <p className="text-[11px] text-amber-900/80">
            {Math.round(worst.distanceM)} m
            {worst.club ? ` · ${worst.club}` : ""}
            {worst.proximityM != null ? ` · ${worst.proximityM} m to pin` : ` · ${worst.lie}`}
          </p>
        </div>
      </div>

      {bandStats.length > 0 && (
        <Card
          title="By distance"
          aside={
            bestBand && worstBand && bestBand.band.key !== worstBand.band.key
              ? `Best ${bestBand.band.label} · Leak ${worstBand.band.label}`
              : undefined
          }
        >
          <ul className="space-y-2">
            {bandStats.map((row) => (
              <li key={row.band.key} className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium text-stone-800">{row.band.label}</span>
                <span className="text-right text-xs text-stone-600">
                  <span className="font-bold tabular-nums text-stone-900">{row.score ?? "–"}</span>
                  /100 · {row.n} shot{row.n === 1 ? "" : "s"}
                  {row.girPct != null ? ` · GIR ${row.girPct}%` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {clubRows.some((c) => c.club !== "—") && (
        <Card title="By club">
          <ul className="space-y-2">
            {clubRows.map((row) => (
              <li key={row.club} className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium text-stone-800">{row.club}</span>
                <span className="text-right text-xs text-stone-600">
                  <span className="font-bold tabular-nums text-stone-900">{row.score ?? "–"}</span>
                  /100 · {row.n} · GIR {row.girPct}%
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
                  {s.proximityM != null ? `${s.proximityM} m to pin` : s.lie}
                </span>
              </span>
              <span className="shrink-0 font-bold tabular-nums text-stone-900">{s.points}</span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
