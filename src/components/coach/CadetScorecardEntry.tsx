"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Loader2, Save, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  CADET_HOLE_GROUPS,
  cadetHoleGroupLabel,
  upsertCadetEnrollment,
  type CadetHoleGroup,
} from "@/lib/cadetScoring";
import {
  CADET_SCORECARD_MIGRATION_HINT,
  emptyScorecardHoles,
  insertCadetScorecard,
  type CadetScorecardHoleInput,
} from "@/lib/cadetScorecard";
import { fetchCadetEnrolledPlayers } from "@/lib/cadetInvites";

type PlayerOpt = { id: string; full_name: string | null };

type Props = {
  /** Coach picks a cadet; self locks to the signed-in junior. */
  mode?: "coach" | "self";
  /** Required when mode is self. */
  playerId?: string;
  playerName?: string;
  defaultHoleGroup?: CadetHoleGroup;
  onSaved?: () => void;
};

export function CadetScorecardEntry({
  mode = "coach",
  playerId: lockedPlayerId,
  playerName,
  defaultHoleGroup = 3,
  onSaved,
}: Props) {
  const self = mode === "self";
  const [players, setPlayers] = useState<PlayerOpt[]>([]);
  const [playerId, setPlayerId] = useState(lockedPlayerId || "");
  const [query, setQuery] = useState("");
  const [holeGroup, setHoleGroup] = useState<CadetHoleGroup>(defaultHoleGroup);
  const [playedOn, setPlayedOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [course, setCourse] = useState("Stonecutters Ridge");
  const [holes, setHoles] = useState<CadetScorecardHoleInput[]>(() => emptyScorecardHoles(defaultHoleGroup));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    if (lockedPlayerId) setPlayerId(lockedPlayerId);
  }, [lockedPlayerId]);

  useEffect(() => {
    setHoleGroup(defaultHoleGroup);
  }, [defaultHoleGroup]);

  useEffect(() => {
    if (self) return;
    let cancelled = false;
    void (async () => {
      const client = createClient();
      const enrolled = await fetchCadetEnrolledPlayers(client);
      if (cancelled) return;
      if (enrolled.available) {
        setPlayers(enrolled.players);
        return;
      }
      const { data } = await client.from("profiles").select("id, full_name").order("full_name");
      if (!cancelled) setPlayers((data as PlayerOpt[]) || []);
    })();
    return () => {
      cancelled = true;
    };
  }, [self]);

  useEffect(() => {
    setHoles(emptyScorecardHoles(holeGroup));
  }, [holeGroup]);

  const filteredPlayers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return players
      .filter((p) => (p.full_name || "").trim().toLowerCase().includes(q))
      .slice(0, 12);
  }, [players, query]);

  const selectedPlayer = useMemo(
    () => players.find((p) => p.id === playerId) ?? null,
    [players, playerId],
  );

  const totals = useMemo(() => {
    const strokes = holes.reduce((n, h) => n + (Number(h.totalStrokes) || 0), 0);
    const par = holes.reduce((n, h) => n + (Number(h.par) || 0), 0);
    const putts = holes.reduce((n, h) => n + (Number(h.putts) || 0), 0);
    const chips = holes.reduce((n, h) => n + (Number(h.chips) || 0), 0);
    const bunker = holes.reduce((n, h) => n + (Number(h.bunkerShots) || 0), 0);
    const to30 = holes.reduce((n, h) => n + (Number(h.shotsTo30m) || 0), 0);
    return { strokes, par, putts, chips, bunker, to30, toPar: strokes - par };
  }, [holes]);

  const patchHole = (idx: number, patch: Partial<CadetScorecardHoleInput>) => {
    setHoles((rows) => rows.map((h, i) => (i === idx ? { ...h, ...patch } : h)));
  };

  const save = async () => {
    setError(null);
    setOk(null);
    if (!playerId) {
      setError(self ? "Sign in as the junior first." : "Search and pick a cadet first.");
      return;
    }
    setBusy(true);
    const client = createClient();
    if (!self) {
      await upsertCadetEnrollment(client, { playerId, holeGroup });
    }
    const res = await insertCadetScorecard(client, {
      playerId,
      holeGroup,
      playedOn,
      courseName: course,
      holes,
      syncLeaderboardScore: true,
    });
    setBusy(false);
    if (res.error) {
      setError(res.error.includes("scorecard") ? res.error : res.error || CADET_SCORECARD_MIGRATION_HINT);
      return;
    }
    setOk(
      `Saved ${cadetHoleGroupLabel(holeGroup)} scorecard · ${totals.strokes} strokes (${totals.toPar >= 0 ? "+" : ""}${totals.toPar}).`,
    );
    onSaved?.();
  };

  const field =
    "w-full min-w-0 rounded-lg border border-stone-200 bg-white px-1.5 py-1.5 text-center text-xs tabular-nums text-stone-900 outline-none focus:border-[#014421]";

  return (
    <section className="space-y-3">
      <div className="cadet-panel-rise overflow-hidden rounded-2xl border border-[#014421]/10 bg-white/90 p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#014421] to-[#1a5c38] text-white">
            <ClipboardList className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#014421]/70">
              On-course card
            </p>
            <h2 className="cadet-display mt-0.5 text-2xl font-semibold tracking-tight text-stone-900">
              {self ? "My cadet scorecard" : "Manual entry"}
            </h2>
            <p className="mt-1 text-xs leading-snug text-stone-500">
              {self
                ? `Hole · Par · Shots to <30m · Chips · Bunker · Putts · Total${playerName ? ` · ${playerName}` : ""}`
                : "Enter one cadet’s hole-by-hole card · Par · <30m · Chips · Bunker · Putts · Total."}
            </p>
          </div>
        </div>

        {!self ? (
          <div className="relative mt-3">
            <label className="block text-[11px] font-medium text-stone-500">Cadet</label>
            <div className="relative mt-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
                aria-hidden
              />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPlayerId("");
                  setOk(null);
                }}
                placeholder="Search student name…"
                className="w-full rounded-xl border border-stone-200 bg-white py-2.5 pl-10 pr-3 text-sm text-stone-900 outline-none focus:border-[#014421]"
              />
            </div>
            {playerId && selectedPlayer ? (
              <p className="mt-1.5 text-xs font-semibold text-[#014421]">
                {selectedPlayer.full_name?.trim() || "Unnamed"}
                <button
                  type="button"
                  onClick={() => {
                    setPlayerId("");
                    setQuery("");
                    setOk(null);
                  }}
                  className="ml-2 font-medium text-stone-400 hover:text-stone-600"
                >
                  Clear
                </button>
              </p>
            ) : null}
            {query.trim() && !playerId ? (
              filteredPlayers.length === 0 ? (
                <p className="mt-2 text-center text-xs text-stone-500">No students match.</p>
              ) : (
                <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                  {filteredPlayers.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setPlayerId(p.id);
                          setQuery(p.full_name?.trim() || "Unnamed");
                        }}
                        className="w-full rounded-xl bg-stone-50 px-3 py-2 text-left text-sm font-semibold text-stone-800 ring-1 ring-stone-200 hover:bg-[#014421]/5"
                      >
                        {p.full_name?.trim() || "Unnamed"}
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </div>
        ) : null}

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className={`block text-[11px] font-medium text-stone-500 ${self ? "sm:col-span-2" : ""}`}>
            Hole group
            <select
              value={holeGroup}
              onChange={(e) => setHoleGroup(Number(e.target.value) as CadetHoleGroup)}
              className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-900 outline-none focus:border-[#014421]"
            >
              {CADET_HOLE_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {cadetHoleGroupLabel(g)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[11px] font-medium text-stone-500">
            Date
            <input
              type="date"
              value={playedOn}
              onChange={(e) => setPlayedOn(e.target.value)}
              className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-[#014421]"
            />
          </label>
          <label className="block text-[11px] font-medium text-stone-500 sm:col-span-2">
            Course
            <input
              value={course}
              onChange={(e) => setCourse(e.target.value)}
              className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-[#014421]"
            />
          </label>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left">
            <thead>
              <tr className="border-b border-stone-100 bg-[#014421]/[0.04] text-[9px] font-bold uppercase tracking-wide text-stone-500">
                <th className="px-2 py-2">Hole</th>
                <th className="px-1 py-2 text-center">Par</th>
                <th className="px-1 py-2 text-center">&lt;30m</th>
                <th className="px-1 py-2 text-center">Chip</th>
                <th className="px-1 py-2 text-center">Bunk</th>
                <th className="px-1 py-2 text-center">Putt</th>
                <th className="px-1 py-2 text-center">Total</th>
              </tr>
            </thead>
            <tbody>
              {holes.map((h, idx) => (
                <tr key={h.holeNumber} className="border-b border-stone-50">
                  <td className="px-2 py-1.5 text-xs font-bold text-[#014421]">{h.holeNumber}</td>
                  <td className="px-1 py-1">
                    <input
                      type="number"
                      min={3}
                      max={5}
                      value={h.par}
                      onChange={(e) => patchHole(idx, { par: Number(e.target.value) })}
                      className={field}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={h.shotsTo30m}
                      onChange={(e) => patchHole(idx, { shotsTo30m: Number(e.target.value) })}
                      className={field}
                      title="Shots to get inside 30m"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      type="number"
                      min={0}
                      max={15}
                      value={h.chips}
                      onChange={(e) => patchHole(idx, { chips: Number(e.target.value) })}
                      className={field}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      type="number"
                      min={0}
                      max={15}
                      value={h.bunkerShots}
                      onChange={(e) => patchHole(idx, { bunkerShots: Number(e.target.value) })}
                      className={field}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      type="number"
                      min={0}
                      max={15}
                      value={h.putts}
                      onChange={(e) => patchHole(idx, { putts: Number(e.target.value) })}
                      className={field}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={h.totalStrokes}
                      onChange={(e) => patchHole(idx, { totalStrokes: Number(e.target.value) })}
                      className={`${field} font-bold`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-stone-50 text-[11px] font-bold text-stone-700">
                <td className="px-2 py-2">Tot</td>
                <td className="px-1 py-2 text-center tabular-nums">{totals.par}</td>
                <td className="px-1 py-2 text-center tabular-nums">{totals.to30}</td>
                <td className="px-1 py-2 text-center tabular-nums">{totals.chips}</td>
                <td className="px-1 py-2 text-center tabular-nums">{totals.bunker}</td>
                <td className="px-1 py-2 text-center tabular-nums">{totals.putts}</td>
                <td className="px-1 py-2 text-center tabular-nums text-[#014421]">
                  {totals.strokes}
                  <span className="block text-[9px] font-semibold text-stone-400">
                    {totals.toPar === 0 ? "E" : totals.toPar > 0 ? `+${totals.toPar}` : String(totals.toPar)}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {error && (
          <p className="border-t border-amber-100 bg-amber-50 px-4 py-2.5 text-xs text-amber-950">{error}</p>
        )}
        {ok && (
          <p className="border-t border-emerald-100 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-900">
            {ok}
          </p>
        )}

        <div className="border-t border-stone-100 p-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#014421] px-3 py-2.5 text-xs font-bold text-white disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Save className="h-3.5 w-3.5" aria-hidden />}
            Save scorecard
          </button>
        </div>
      </div>
    </section>
  );
}
