"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Award, Loader2, Plus, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  CADET_HOLE_GROUPS,
  CADET_MIGRATION_HINT,
  buildCadetLeaderboard,
  cadetHoleGroupLabel,
  fetchCadetScores,
  formatToPar,
  insertCadetScore,
  periodWindow,
  upsertCadetEnrollment,
  type CadetHoleGroup,
  type CadetLeaderboardEntry,
  type CadetLeaderboardPeriod,
} from "@/lib/cadetScoring";
import {
  CADET_SCORECARD_MIGRATION_HINT,
  CADET_STAT_LEADERBOARD_CATEGORIES,
  buildCadetStatLeaderboard,
  fetchCadetScorecardsForGroup,
  formatCadetStatLeaderboardValue,
  type CadetScorecardWithName,
  type CadetStatLeaderboardId,
} from "@/lib/cadetScorecard";

type PlayerOpt = { id: string; full_name: string | null };

export function CadetHoleGroupLeaderboards() {
  const [holeGroup, setHoleGroup] = useState<CadetHoleGroup>(3);
  const [period, setPeriod] = useState<CadetLeaderboardPeriod>("year");
  const [entries, setEntries] = useState<CadetLeaderboardEntry[]>([]);
  const [scorecards, setScorecards] = useState<CadetScorecardWithName[]>([]);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);
  const [statsAvailable, setStatsAvailable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [statCategory, setStatCategory] = useState<CadetStatLeaderboardId>("putts");

  const window = useMemo(() => periodWindow(period), [period]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    setStatsError(null);
    const client = createClient();
    const [res, cardsRes] = await Promise.all([
      fetchCadetScores(client, {
        holeGroup,
        start: window.start,
        end: window.end,
      }),
      fetchCadetScorecardsForGroup(client, {
        holeGroup,
        start: window.start,
        end: window.end,
      }),
    ]);
    setAvailable(res.available);
    if (res.error) setError(res.error);
    setEntries(buildCadetLeaderboard(res.scores));
    setStatsAvailable(cardsRes.available);
    if (cardsRes.error) setStatsError(cardsRes.error);
    setScorecards(cardsRes.cards);
    setLoading(false);
  }, [holeGroup, window.start, window.end]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const statEntries = useMemo(
    () => buildCadetStatLeaderboard(scorecards, statCategory, holeGroup),
    [scorecards, statCategory, holeGroup],
  );

  const activeStat = CADET_STAT_LEADERBOARD_CATEGORIES.find((c) => c.id === statCategory)!;

  return (
    <section className="space-y-3">
      <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="flex items-start gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#014421]/10">
            <Trophy className="h-4 w-4 text-[#014421]" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-stone-900">On-course groups</h2>
            <p className="text-xs leading-snug text-stone-500">
              3 · 5 · 7 · 10-hole loops — scoring leaderboard plus hole-stat boards for end-of-term / year awards.
            </p>
          </div>
        </div>

        <div className="mt-3 flex gap-1.5" role="radiogroup" aria-label="Hole group">
          {CADET_HOLE_GROUPS.map((h) => {
            const on = holeGroup === h;
            return (
              <button
                key={h}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setHoleGroup(h)}
                className={`flex-1 rounded-xl px-2 py-2 text-xs font-bold transition ${
                  on ? "bg-[#014421] text-white shadow-sm" : "border border-stone-200 bg-stone-50 text-stone-700"
                }`}
              >
                {h}
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex gap-1.5" role="radiogroup" aria-label="Period">
          {(
            [
              { id: "term" as const, label: "This term" },
              { id: "year" as const, label: "This year" },
            ] as const
          ).map((p) => {
            const on = period === p.id;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setPeriod(p.id)}
                className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  on ? "bg-stone-900 text-white" : "border border-stone-200 bg-white text-stone-700"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <p className="mt-2 text-center text-[11px] font-medium text-stone-400">
          {cadetHoleGroupLabel(holeGroup)} · {window.label}
        </p>
      </div>

      {!available && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          {error || CADET_MIGRATION_HINT}
        </p>
      )}

      {available && error && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">{error}</p>
      )}

      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-stone-100 px-4 py-2.5">
          <p className="text-xs font-bold uppercase tracking-wide text-stone-500">Leaderboard</p>
          {available && (
            <button
              type="button"
              onClick={() => setAdding((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-[#014421] hover:bg-[#014421]/5"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              {adding ? "Close" : "Add score"}
            </button>
          )}
        </div>

        {adding && available && (
          <AddCadetScoreForm
            holeGroup={holeGroup}
            onSaved={() => {
              setAdding(false);
              void reload();
            }}
            onCancel={() => setAdding(false)}
          />
        )}

        {loading ? (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-stone-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading…
          </p>
        ) : entries.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-stone-500">
            No {cadetHoleGroupLabel(holeGroup)} scores in {window.label} yet.
          </p>
        ) : (
          <ol className="divide-y divide-stone-100">
            {entries.map((e, i) => (
              <li key={e.playerId} className="flex items-center gap-3 px-4 py-3">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    i === 0
                      ? "bg-[#014421] text-white"
                      : i < 3
                        ? "bg-[#014421]/15 text-[#014421]"
                        : "bg-stone-100 text-stone-600"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-stone-900">{e.playerName}</span>
                  <span className="block text-[11px] text-stone-500">
                    {e.rounds} round{e.rounds === 1 ? "" : "s"} · best {e.bestGross}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-bold tabular-nums text-stone-900">
                    {e.avgToPar != null ? formatToPar(e.avgToPar) : e.avgGross}
                  </span>
                  <span className="block text-[10px] font-medium uppercase tracking-wide text-stone-400">
                    {e.avgToPar != null ? "avg to par" : "avg gross"}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="flex items-start gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#d6c4a1]/35">
            <Award className="h-4 w-4 text-[#014421]" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-stone-900">Stat awards</h2>
            <p className="text-xs leading-snug text-stone-500">
              From detailed scorecards · lower average wins · same {cadetHoleGroupLabel(holeGroup)} group &amp;{" "}
              {window.label}.
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Stat category">
          {CADET_STAT_LEADERBOARD_CATEGORIES.map((c) => {
            const on = statCategory === c.id;
            return (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setStatCategory(c.id)}
                className={`rounded-xl px-2.5 py-1.5 text-[11px] font-bold transition ${
                  on ? "bg-[#014421] text-white shadow-sm" : "border border-stone-200 bg-stone-50 text-stone-700"
                }`}
              >
                {c.shortLabel}
              </button>
            );
          })}
        </div>
      </div>

      {!statsAvailable && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          {statsError || CADET_SCORECARD_MIGRATION_HINT}
        </p>
      )}

      {statsAvailable && statsError && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">{statsError}</p>
      )}

      {statsAvailable && (
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="border-b border-stone-100 px-4 py-2.5">
            <p className="text-xs font-bold uppercase tracking-wide text-stone-500">
              {activeStat.label} · {activeStat.unit}
            </p>
          </div>
          {loading ? (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-stone-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading…
            </p>
          ) : statEntries.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-stone-500">
              No scorecard stats yet for {cadetHoleGroupLabel(holeGroup)} in {window.label}. Log cards on Results.
            </p>
          ) : (
            <ol className="divide-y divide-stone-100">
              {statEntries.map((e, i) => (
                <li key={`${statCategory}-${e.playerId}`} className="flex items-center gap-3 px-4 py-3">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      i === 0
                        ? "bg-[#d6c4a1] text-[#013319]"
                        : i < 3
                          ? "bg-[#014421]/15 text-[#014421]"
                          : "bg-stone-100 text-stone-600"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-stone-900">{e.playerName}</span>
                    <span className="block text-[11px] text-stone-500">
                      {e.holes} hole{e.holes === 1 ? "" : "s"} · {e.cards} card{e.cards === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-bold tabular-nums text-stone-900">
                      {formatCadetStatLeaderboardValue(statCategory, e.value)}
                    </span>
                    <span className="block text-[10px] font-medium uppercase tracking-wide text-stone-400">
                      {activeStat.unit}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}

function AddCadetScoreForm({
  holeGroup,
  onSaved,
  onCancel,
}: {
  holeGroup: CadetHoleGroup;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [players, setPlayers] = useState<PlayerOpt[]>([]);
  const [playerId, setPlayerId] = useState("");
  const [playedOn, setPlayedOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [gross, setGross] = useState("");
  const [toPar, setToPar] = useState("");
  const [course, setCourse] = useState("Stonecutters Ridge");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const client = createClient();
      const { data } = await client.from("profiles").select("id, full_name").order("full_name");
      if (!cancelled) setPlayers((data as PlayerOpt[]) || []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    const grossScore = Number(gross);
    if (!playerId) {
      setErr("Pick a cadet.");
      return;
    }
    if (!Number.isFinite(grossScore) || grossScore < 1) {
      setErr("Enter a gross score.");
      return;
    }
    const toParNum = toPar.trim() === "" ? null : Number(toPar);
    if (toParNum != null && !Number.isFinite(toParNum)) {
      setErr("To-par must be a number (e.g. -2, 0, +4).");
      return;
    }

    setBusy(true);
    setErr(null);
    const client = createClient();
    const enrol = await upsertCadetEnrollment(client, { playerId, holeGroup });
    if (enrol.error) {
      setErr(enrol.error);
      setBusy(false);
      return;
    }
    const res = await insertCadetScore(client, {
      playerId,
      holeGroup,
      playedOn,
      grossScore,
      toPar: toParNum,
      courseName: course,
    });
    setBusy(false);
    if (res.error) {
      setErr(res.error);
      return;
    }
    onSaved();
  };

  const field =
    "w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-[#014421]";

  return (
    <div className="space-y-2 border-b border-stone-100 bg-stone-50/80 px-4 py-3">
      <p className="text-xs font-semibold text-stone-700">
        Log a {cadetHoleGroupLabel(holeGroup)} score
      </p>
      <label className="block text-[11px] font-medium text-stone-500">
        Cadet
        <select
          value={playerId}
          onChange={(e) => setPlayerId(e.target.value)}
          className={`${field} mt-1`}
          disabled={busy}
        >
          <option value="">Select player…</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name || "Unnamed"}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-[11px] font-medium text-stone-500">
          Date
          <input
            type="date"
            value={playedOn}
            onChange={(e) => setPlayedOn(e.target.value)}
            className={`${field} mt-1`}
            disabled={busy}
          />
        </label>
        <label className="block text-[11px] font-medium text-stone-500">
          Gross
          <input
            type="number"
            inputMode="numeric"
            value={gross}
            onChange={(e) => setGross(e.target.value)}
            placeholder="e.g. 18"
            className={`${field} mt-1`}
            disabled={busy}
          />
        </label>
        <label className="block text-[11px] font-medium text-stone-500">
          To par (optional)
          <input
            type="number"
            inputMode="numeric"
            value={toPar}
            onChange={(e) => setToPar(e.target.value)}
            placeholder="e.g. +2"
            className={`${field} mt-1`}
            disabled={busy}
          />
        </label>
        <label className="block text-[11px] font-medium text-stone-500">
          Course
          <input
            value={course}
            onChange={(e) => setCourse(e.target.value)}
            className={`${field} mt-1`}
            disabled={busy}
          />
        </label>
      </div>
      {err && <p className="text-xs font-medium text-red-600">{err}</p>}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#014421] px-3 py-2.5 text-xs font-bold text-white disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          Save score
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-xl px-3 py-2.5 text-xs font-semibold text-stone-500"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
