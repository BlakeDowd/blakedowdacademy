"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardPaste, Loader2, Plus, Table2, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  CADET_HOLE_GROUPS,
  CADET_MIGRATION_HINT,
  cadetHoleGroupLabel,
  insertCadetScoresBulk,
  matchCadetPlayerId,
  parseCadetScorePaste,
  type CadetHoleGroup,
} from "@/lib/cadetScoring";

type PlayerOpt = { id: string; full_name: string | null };

type GridRow = {
  key: string;
  playerId: string;
  gross: string;
  toPar: string;
};

function emptyRow(): GridRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    playerId: "",
    gross: "",
    toPar: "",
  };
}

export function CadetBulkScoreEntry() {
  const [holeGroup, setHoleGroup] = useState<CadetHoleGroup>(3);
  const [playedOn, setPlayedOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [course, setCourse] = useState("Stonecutters Ridge");
  const [players, setPlayers] = useState<PlayerOpt[]>([]);
  const [rows, setRows] = useState<GridRow[]>(() => [emptyRow(), emptyRow(), emptyRow()]);
  const [paste, setPaste] = useState("");
  const [showPaste, setShowPaste] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pasteWarnings, setPasteWarnings] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await createClient()
        .from("profiles")
        .select("id, full_name")
        .order("full_name");
      if (!cancelled) setPlayers((data as PlayerOpt[]) || []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const playerLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of players) m.set(p.id, p.full_name?.trim() || "Unnamed");
    return m;
  }, [players]);

  const applyPaste = useCallback(() => {
    setError(null);
    setOk(null);
    const parsed = parseCadetScorePaste(paste, playedOn);
    if (!parsed.length) {
      setError("Paste rows from your spreadsheet first (Name, Gross, To-par).");
      return;
    }

    const warnings: string[] = [];
    const next: GridRow[] = [];
    for (const line of parsed) {
      if (line.error) {
        warnings.push(`${line.name || "Row"}: ${line.error}`);
        continue;
      }
      const playerId = matchCadetPlayerId(line.name, players);
      if (!playerId) {
        warnings.push(`${line.name}: no matching player in the app — pick them in the table`);
        next.push({
          key: `${Date.now()}-${next.length}`,
          playerId: "",
          gross: String(line.grossScore),
          toPar: line.toPar == null ? "" : String(line.toPar),
        });
        continue;
      }
      next.push({
        key: `${Date.now()}-${next.length}`,
        playerId,
        gross: String(line.grossScore),
        toPar: line.toPar == null ? "" : String(line.toPar),
      });
    }

    if (!next.length) {
      setError(warnings[0] || "Nothing could be imported.");
      setPasteWarnings(warnings);
      return;
    }
    setRows(next);
    setPasteWarnings(warnings);
    setShowPaste(false);
    setOk(
      warnings.length
        ? `Loaded ${next.length} row${next.length === 1 ? "" : "s"} — check highlighted names.`
        : `Loaded ${next.length} row${next.length === 1 ? "" : "s"} from the spreadsheet.`,
    );
  }, [paste, playedOn, players]);

  const saveAll = async () => {
    setBusy(true);
    setError(null);
    setOk(null);

    const drafts = [];
    for (const row of rows) {
      if (!row.playerId && !row.gross.trim() && !row.toPar.trim()) continue;
      if (!row.playerId) {
        setError("Every filled row needs a player.");
        setBusy(false);
        return;
      }
      const grossScore = Number(row.gross);
      if (!Number.isFinite(grossScore) || grossScore < 1) {
        setError(`Enter a gross score for ${playerLabel.get(row.playerId) || "each player"}.`);
        setBusy(false);
        return;
      }
      let toPar: number | null = null;
      if (row.toPar.trim() !== "") {
        const raw = row.toPar.trim();
        if (/^e(ven)?$/i.test(raw)) {
          toPar = 0;
        } else {
          const t = Number(raw.replace(/^\+/, ""));
          if (!Number.isFinite(t)) {
            setError(`To-par must be a number for ${playerLabel.get(row.playerId)}.`);
            setBusy(false);
            return;
          }
          toPar = t;
        }
      }
      drafts.push({
        playerId: row.playerId,
        holeGroup,
        playedOn,
        grossScore,
        toPar,
        courseName: course,
      });
    }

    if (!drafts.length) {
      setError("Add at least one score row.");
      setBusy(false);
      return;
    }

    const res = await insertCadetScoresBulk(createClient(), drafts);
    setBusy(false);
    if (res.error) {
      setError(/cadet_scores|does not exist|schema cache/i.test(res.error) ? CADET_MIGRATION_HINT : res.error);
      return;
    }
    setOk(`Saved ${res.saved} ${cadetHoleGroupLabel(holeGroup)} score${res.saved === 1 ? "" : "s"} for ${playedOn}.`);
    setRows([emptyRow(), emptyRow(), emptyRow()]);
    setPaste("");
    setPasteWarnings([]);
  };

  const field =
    "w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm text-stone-900 outline-none focus:border-[#014421]";

  return (
    <section className="space-y-3">
      <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="flex items-start gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#014421]/10">
            <Table2 className="h-4 w-4 text-[#014421]" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-stone-900">Enter round results</h2>
            <p className="text-xs leading-snug text-stone-500">
              Paste from your spreadsheet or fill the table — one session for the whole group.
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
                {h}-hole
              </button>
            );
          })}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="block text-[11px] font-medium text-stone-500">
            Round date
            <input
              type="date"
              value={playedOn}
              onChange={(e) => setPlayedOn(e.target.value)}
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
      </div>

      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-stone-100 px-4 py-2.5">
          <p className="text-xs font-bold uppercase tracking-wide text-stone-500">Spreadsheet paste</p>
          <button
            type="button"
            onClick={() => setShowPaste((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-[#014421] hover:bg-[#014421]/5"
          >
            <ClipboardPaste className="h-3.5 w-3.5" aria-hidden />
            {showPaste ? "Hide" : "Show"}
          </button>
        </div>
        {showPaste && (
          <div className="space-y-2 px-4 py-3">
            <p className="text-[11px] leading-snug text-stone-500">
              Copy from Excel / Sheets. Columns: <span className="font-semibold text-stone-700">Name · Gross · To-par</span>{" "}
              (to-par optional). Header row is fine.
            </p>
            <textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              rows={6}
              placeholder={"Name\tGross\tTo par\nBlake Dowd\t18\t+2\nSam Lee\t16\tE"}
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 font-mono text-xs text-stone-900 outline-none focus:border-[#014421]"
              disabled={busy}
            />
            <button
              type="button"
              onClick={applyPaste}
              disabled={busy || !paste.trim()}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-stone-900 px-3 py-2.5 text-xs font-bold text-white disabled:opacity-50"
            >
              Load into table
            </button>
            {pasteWarnings.length > 0 && (
              <ul className="space-y-1 rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                {pasteWarnings.slice(0, 8).map((w) => (
                  <li key={w}>· {w}</li>
                ))}
                {pasteWarnings.length > 8 ? <li>…and {pasteWarnings.length - 8} more</li> : null}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-stone-100 px-4 py-2.5">
          <p className="text-xs font-bold uppercase tracking-wide text-stone-500">
            {cadetHoleGroupLabel(holeGroup)} scores · {playedOn}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => setRows((prev) => [...prev, emptyRow()])}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-[#014421] hover:bg-[#014421]/5"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Row
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[320px] text-left text-sm">
            <thead>
              <tr className="border-b border-stone-100 text-[10px] font-bold uppercase tracking-wide text-stone-400">
                <th className="px-3 py-2 font-bold">Player</th>
                <th className="w-20 px-2 py-2 font-bold">Gross</th>
                <th className="w-20 px-2 py-2 font-bold">To par</th>
                <th className="w-10 px-1 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={row.key} className="border-b border-stone-50">
                  <td className="px-3 py-1.5">
                    <select
                      value={row.playerId}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, playerId: e.target.value } : r)),
                        )
                      }
                      className={field}
                      disabled={busy}
                    >
                      <option value="">Select…</option>
                      {players.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name || "Unnamed"}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={row.gross}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, gross: e.target.value } : r)),
                        )
                      }
                      className={field}
                      disabled={busy}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={row.toPar}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, toPar: e.target.value } : r)),
                        )
                      }
                      placeholder="+"
                      className={field}
                      disabled={busy}
                    />
                  </td>
                  <td className="px-1 py-1.5">
                    <button
                      type="button"
                      disabled={busy || rows.length <= 1}
                      onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}
                      className="rounded-lg p-1.5 text-stone-300 hover:text-red-600 disabled:opacity-30"
                      aria-label="Remove row"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-2 border-t border-stone-100 px-4 py-3">
          {error && <p className="text-xs font-medium text-red-600">{error}</p>}
          {ok && <p className="text-xs font-medium text-[#014421]">{ok}</p>}
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveAll()}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#014421] px-3 py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Save all scores
          </button>
        </div>
      </div>
    </section>
  );
}
