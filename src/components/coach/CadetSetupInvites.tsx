"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Link2, Loader2, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import {
  CADET_HOLE_GROUPS,
  cadetHoleGroupLabel,
  type CadetHoleGroup,
} from "@/lib/cadetScoring";
import {
  CADET_INVITE_MIGRATION_HINT,
  cadetInviteUrl,
  createCadetInvite,
  deleteCadetInvite,
  fetchCadetInvites,
  type CadetInviteRow,
} from "@/lib/cadetInvites";
import { shareInvite } from "@/lib/coachingSpaces";

export function CadetSetupInvites() {
  const { user } = useAuth();
  const [rows, setRows] = useState<CadetInviteRow[]>([]);
  const [available, setAvailable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [holeGroup, setHoleGroup] = useState<CadetHoleGroup>(3);
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const reload = useCallback(async () => {
    const res = await fetchCadetInvites(createClient());
    setAvailable(res.available);
    if (res.error) setError(res.error);
    else setError(null);
    setRows(res.rows);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create = async () => {
    if (!user?.id) return;
    setBusy(true);
    setError(null);
    const res = await createCadetInvite(createClient(), {
      coachId: user.id,
      displayName: name,
      holeGroup,
    });
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setName("");
    await reload();
    if (res.row) {
      try {
        await navigator.clipboard.writeText(cadetInviteUrl(res.row.invite_code));
        setCopiedId(res.row.id);
        setTimeout(() => setCopiedId(null), 2000);
      } catch {
        /* ignore */
      }
    }
  };

  const copy = async (row: CadetInviteRow) => {
    try {
      await navigator.clipboard.writeText(cadetInviteUrl(row.invite_code));
      setCopiedId(row.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setError("Couldn't copy — long-press the link instead.");
    }
  };

  const share = async (row: CadetInviteRow) => {
    const coachName = user?.fullName || "Your coach";
    await shareInvite(row.invite_code, row.display_name, coachName);
  };

  const remove = async (row: CadetInviteRow) => {
    if (row.player_id) {
      if (!confirm(`${row.display_name} already joined. Delete the setup link record only? (Enrolment stays.)`)) {
        return;
      }
    } else if (!confirm(`Delete setup link for ${row.display_name}?`)) {
      return;
    }
    const res = await deleteCadetInvite(createClient(), row.id);
    if (res.error) setError(res.error);
    else void reload();
  };

  const pending = rows.filter((r) => !r.player_id);
  const claimed = rows.filter((r) => r.player_id);

  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span>
          <span className="block text-xs font-bold uppercase tracking-wide text-stone-500">
            Cadet setup links
          </span>
          <span className="mt-0.5 block text-xs text-stone-400">
            One-time link per junior → links their account to a Cadet profile
          </span>
        </span>
        <Link2 className={`h-4 w-4 text-stone-400 ${open ? "text-[#014421]" : ""}`} aria-hidden />
      </button>

      {open ? (
        <div className="space-y-3 border-t border-stone-100 px-4 py-3">
          {!available ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
              {error || CADET_INVITE_MIGRATION_HINT}
            </p>
          ) : (
            <>
              <div className="space-y-2 rounded-xl bg-stone-50 px-3 py-3 ring-1 ring-stone-100">
                <label className="block text-[11px] font-medium text-stone-500">
                  Cadet name
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Sam Lee"
                    className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-[#014421]"
                    disabled={busy}
                  />
                </label>
                <div className="flex gap-1.5" role="radiogroup" aria-label="Starting hole group">
                  {CADET_HOLE_GROUPS.map((h) => {
                    const on = holeGroup === h;
                    return (
                      <button
                        key={h}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => setHoleGroup(h)}
                        className={`flex-1 rounded-lg px-1.5 py-1.5 text-[11px] font-bold ${
                          on ? "bg-[#014421] text-white" : "border border-stone-200 bg-white text-stone-700"
                        }`}
                      >
                        {h}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  disabled={busy || !name.trim()}
                  onClick={() => void create()}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#014421] px-3 py-2.5 text-xs font-bold text-white disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                  )}
                  Create setup link
                </button>
              </div>

              {error && available ? (
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-900">{error}</p>
              ) : null}

              {pending.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">
                    Waiting to join · {pending.length}
                  </p>
                  {pending.map((row) => (
                    <InviteRow
                      key={row.id}
                      row={row}
                      copied={copiedId === row.id}
                      onCopy={() => void copy(row)}
                      onShare={() => void share(row)}
                      onDelete={() => void remove(row)}
                    />
                  ))}
                </div>
              ) : null}

              {claimed.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">
                    Linked · {claimed.length}
                  </p>
                  {claimed.map((row) => (
                    <InviteRow
                      key={row.id}
                      row={row}
                      copied={copiedId === row.id}
                      onCopy={() => void copy(row)}
                      onShare={() => void share(row)}
                      onDelete={() => void remove(row)}
                    />
                  ))}
                </div>
              ) : null}

              {rows.length === 0 ? (
                <p className="text-center text-xs text-stone-500">
                  No Cadet links yet. Create one, send it to the junior/parent, then search them by name once they join.
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function InviteRow({
  row,
  copied,
  onCopy,
  onShare,
  onDelete,
}: {
  row: CadetInviteRow;
  copied: boolean;
  onCopy: () => void;
  onShare: () => void;
  onDelete: () => void;
}) {
  const linked = Boolean(row.player_id);
  return (
    <div className="rounded-xl border border-stone-100 bg-stone-50/80 px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-stone-900">{row.display_name}</p>
          <p className="text-[10px] font-medium text-stone-400">
            {cadetHoleGroupLabel(row.hole_group)}
            {linked
              ? ` · linked${row.player_name ? ` as ${row.player_name}` : ""}`
              : " · waiting"}
          </p>
          <p className="mt-1 truncate font-mono text-[10px] text-stone-500">
            {cadetInviteUrl(row.invite_code)}
          </p>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-lg p-1.5 text-stone-400 hover:bg-white hover:text-red-600"
          aria-label="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      {!linked ? (
        <div className="mt-2 flex gap-1.5">
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-white px-2 py-1.5 text-[11px] font-bold text-[#014421] ring-1 ring-stone-200"
          >
            {copied ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            onClick={onShare}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-[#014421] px-2 py-1.5 text-[11px] font-bold text-white"
          >
            Share
          </button>
        </div>
      ) : null}
    </div>
  );
}
