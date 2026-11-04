"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardPaste, Download, Loader2, Table2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  CADET_HOLE_GROUPS,
  cadetHoleGroupLabel,
  type CadetHoleGroup,
} from "@/lib/cadetScoring";
import {
  CADET_SCORECARD_MIGRATION_HINT,
  CADET_SCORECARD_PASTE_HEADERS,
  buildCadetScorecardDraftsFromPaste,
  downloadCadetScorecardTemplate,
  insertCadetScorecardsBulk,
  parseCadetScorecardPaste,
  type CadetScorecardDraft,
} from "@/lib/cadetScorecard";

type PlayerOpt = { id: string; full_name: string | null };

export function CadetBulkScorecardEntry() {
  const [holeGroup, setHoleGroup] = useState<CadetHoleGroup>(3);
  const [playedOn, setPlayedOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [players, setPlayers] = useState<PlayerOpt[]>([]);
  const [paste, setPaste] = useState("");
  const [drafts, setDrafts] = useState<CadetScorecardDraft[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

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

  const applyPaste = useCallback(() => {
    setError(null);
    setOk(null);
    const lines = parseCadetScorecardPaste(paste, playedOn);
    if (!lines.length) {
      setError(`Paste rows first (${CADET_SCORECARD_PASTE_HEADERS}).`);
      setDrafts([]);
      setWarnings([]);
      return;
    }
    const { drafts: next, warnings: warns } = buildCadetScorecardDraftsFromPaste(
      lines,
      players,
      holeGroup,
    );
    if (!next.length) {
      setError(warns[0] || "Nothing could be imported — check names and hole counts.");
      setDrafts([]);
      setWarnings(warns);
      return;
    }
    setDrafts(next);
    setWarnings(warns);
    setOk(
      warns.length
        ? `Ready to save ${next.length} scorecard${next.length === 1 ? "" : "s"} — review warnings.`
        : `Ready to save ${next.length} scorecard${next.length === 1 ? "" : "s"}.`,
    );
  }, [paste, playedOn, players, holeGroup]);

  const saveAll = async () => {
    if (!drafts.length) {
      setError("Load the spreadsheet into the preview first.");
      return;
    }
    setBusy(true);
    setError(null);
    setOk(null);
    const res = await insertCadetScorecardsBulk(createClient(), drafts);
    setBusy(false);
    if (res.error) {
      setError(
        /scorecard|does not exist|schema cache/i.test(res.error)
          ? CADET_SCORECARD_MIGRATION_HINT
          : res.error,
      );
      return;
    }
    setOk(`Saved ${res.saved} detailed scorecard${res.saved === 1 ? "" : "s"}.`);
    setDrafts([]);
    setPaste("");
    setWarnings([]);
  };

  return (
    <section className="space-y-3">
      <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="flex items-start gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#014421]/10">
            <Table2 className="h-4 w-4 text-[#014421]" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-stone-900">Bulk scorecards (spreadsheet)</h2>
            <p className="text-xs leading-snug text-stone-500">
              Paste one row per hole from Excel / Sheets. Names must match player profiles.
            </p>
          </div>
          <button
            type="button"
            onClick={() => downloadCadetScorecardTemplate()}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-[#014421] hover:bg-[#014421]/5"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Template
          </button>
        </div>

        <div className="mt-3 flex gap-1.5" role="radiogroup" aria-label="Default hole group">
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
        <p className="mt-1.5 text-[10px] text-stone-400">
          Used when a card&apos;s hole count is ambiguous. Full 3 / 5 / 7 / 10 sets auto-detect.
        </p>

        <label className="mt-3 block text-[11px] font-medium text-stone-500">
          Default date (if a row omits date)
          <input
            type="date"
            value={playedOn}
            onChange={(e) => setPlayedOn(e.target.value)}
            className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-[#014421]"
            disabled={busy}
          />
        </label>
      </div>

      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-100 px-4 py-2.5">
          <p className="text-xs font-bold uppercase tracking-wide text-stone-500">Spreadsheet paste</p>
          <p className="mt-1 text-[11px] leading-snug text-stone-500">
            Columns: <span className="font-semibold text-stone-700">{CADET_SCORECARD_PASTE_HEADERS}</span>
          </p>
        </div>
        <div className="space-y-2 px-4 py-3">
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={8}
            placeholder={
              "Name\tDate\tHole\tPar\t<30m\tChips\tBunker\tPutts\tTotal\tCourse\nBlake Dowd\t2026-11-04\t1\t4\t2\t1\t0\t2\t5\tStonecutters Ridge"
            }
            className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 font-mono text-xs text-stone-900 outline-none focus:border-[#014421]"
            disabled={busy}
          />
          <button
            type="button"
            onClick={applyPaste}
            disabled={busy || !paste.trim()}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-stone-900 px-3 py-2.5 text-xs font-bold text-white disabled:opacity-50"
          >
            <ClipboardPaste className="h-3.5 w-3.5" aria-hidden />
            Preview scorecards
          </button>
          {warnings.length > 0 && (
            <ul className="space-y-1 rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
              {warnings.slice(0, 10).map((w) => (
                <li key={w}>· {w}</li>
              ))}
              {warnings.length > 10 ? <li>…and {warnings.length - 10} more</li> : null}
            </ul>
          )}
        </div>
      </div>

      {drafts.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="border-b border-stone-100 px-4 py-2.5">
            <p className="text-xs font-bold uppercase tracking-wide text-stone-500">
              Preview · {drafts.length} card{drafts.length === 1 ? "" : "s"}
            </p>
          </div>
          <ul className="divide-y divide-stone-50">
            {drafts.map((d) => {
              const strokes = d.holes.reduce((n, h) => n + h.totalStrokes, 0);
              const par = d.holes.reduce((n, h) => n + h.par, 0);
              const toPar = strokes - par;
              return (
                <li key={`${d.playerId}-${d.playedOn}-${d.holeGroup}`} className="px-4 py-2.5 text-xs">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-bold text-stone-900">{d.playerName}</p>
                    <p className="tabular-nums font-semibold text-[#014421]">
                      {strokes}
                      <span className="ml-1 font-medium text-stone-400">
                        {toPar === 0 ? "E" : toPar > 0 ? `+${toPar}` : String(toPar)}
                      </span>
                    </p>
                  </div>
                  <p className="mt-0.5 text-[11px] text-stone-500">
                    {cadetHoleGroupLabel(d.holeGroup)} · {d.playedOn}
                    {d.courseName ? ` · ${d.courseName}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-stone-100 p-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveAll()}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#014421] px-3 py-2.5 text-xs font-bold text-white disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              Save {drafts.length} scorecard{drafts.length === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      ) : null}

      {error && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-950">{error}</p>
      )}
      {ok && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-medium text-emerald-900">
          {ok}
        </p>
      )}
    </section>
  );
}
