"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Hourglass, Loader2, Search, Share2, Trash2, UserPlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  addExistingPlayer,
  createInviteSpace,
  deletePendingSpace,
  fetchPlayerOptions,
  inviteUrl,
  shareInvite,
  type CoachingSpaceRecord,
  type PlayerOption,
} from "@/lib/coachingSpaces";
import { Avatar } from "@/components/coaching/coachingUi";

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

function InviteLinkActions({ code, playerName, coachName }: { code: string; playerName: string; coachName: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "shared">("idle");
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<"shared" | "copied" | "cancelled">) => {
    setError(null);
    try {
      const result = await action();
      if (result === "cancelled") return;
      setStatus(result);
      window.setTimeout(() => setStatus("idle"), 2500);
    } catch {
      setError("Couldn't copy. Press and hold the link to copy it.");
    }
  };

  return (
    <div className="space-y-2">
      <p className="select-all break-all rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 font-mono text-xs text-stone-700">
        {inviteUrl(code)}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void run(() => shareInvite(code, playerName, coachName))}
          className="flex items-center justify-center gap-2 rounded-xl bg-[#014421] px-3 py-2.5 text-sm font-semibold text-white hover:bg-[#013320]"
        >
          <Share2 className="h-4 w-4" aria-hidden />
          {status === "shared" ? "Sent" : "Share invite"}
        </button>
        <button
          type="button"
          onClick={() =>
            void run(async () => {
              await navigator.clipboard.writeText(inviteUrl(code));
              return "copied";
            })
          }
          className="flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-semibold text-stone-800 hover:bg-stone-50"
        >
          {status === "copied" ? <Check className="h-4 w-4 text-[#014421]" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          {status === "copied" ? "Copied" : "Copy link"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function NewSpaceSheet({
  coachId,
  coachName,
  existingIds,
  onClose,
  onCreated,
  onOpenSpace,
}: {
  coachId: string;
  coachName: string;
  existingIds: Set<string>;
  onClose: () => void;
  onCreated: () => void;
  onOpenSpace: (key: string, name: string) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CoachingSpaceRecord | null>(null);
  const [players, setPlayers] = useState<PlayerOption[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchPlayerOptions(createClient())
      .then((list) => {
        if (!cancelled) setPlayers(list);
      })
      .catch(() => {
        if (!cancelled) setPlayers([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !players) return [];
    return players.filter((p) => !existingIds.has(p.id) && p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [players, query, existingIds]);

  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const space = await createInviteSpace(createClient(), coachId, name);
      setCreated(space);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the space.");
    } finally {
      setBusy(false);
    }
  };

  const addPlayer = async (player: PlayerOption) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await addExistingPlayer(createClient(), coachId, player);
      onCreated();
      onOpenSpace(player.id, player.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add that player.");
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-space-title"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-3xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="new-space-title" className="text-lg font-bold text-stone-900">
            {created ? "Space created" : "New space"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-stone-500 hover:bg-stone-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {created ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar name={created.display_name} />
              <div className="min-w-0">
                <p className="truncate font-semibold text-stone-900">{created.display_name}</p>
                <p className="text-xs text-stone-500">Send this link so they can join.</p>
              </div>
            </div>
            <InviteLinkActions code={created.invite_code} playerName={created.display_name} coachName={coachName} />
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
              You can upload swings now. {firstName(created.display_name)} will see everything once they join.
            </p>
            <button
              type="button"
              onClick={() => onOpenSpace(created.id, created.display_name)}
              className="w-full rounded-xl border border-[#014421] px-4 py-2.5 text-sm font-semibold text-[#014421] hover:bg-[#014421]/5"
            >
              Open space
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void create();
              }}
              className="space-y-2"
            >
              <label htmlFor="new-space-name" className="block text-sm font-semibold text-stone-800">
                Invite a player
              </label>
              <input
                id="new-space-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Player's name"
                maxLength={80}
                autoComplete="off"
                className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-[#014421]"
              />
              <button
                type="submit"
                disabled={!name.trim() || busy}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#014421] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#013320] disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <UserPlus className="h-4 w-4" aria-hidden />}
                Create space and get invite link
              </button>
            </form>

            <div className="border-t border-stone-100 pt-4">
              <p className="mb-2 text-sm font-semibold text-stone-800">Already on the app?</p>
              <label className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 focus-within:border-[#014421]">
                <Search className="h-4 w-4 shrink-0 text-stone-400" aria-hidden />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search players"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  aria-label="Search players already on the app"
                />
              </label>
              {query.trim() && (
                <ul className="mt-2 divide-y divide-stone-100">
                  {players === null ? (
                    <li className="flex items-center gap-2 py-3 text-sm text-stone-500">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading players…
                    </li>
                  ) : matches.length === 0 ? (
                    <li className="py-3 text-sm text-stone-500">No players match. Invite them with a link above.</li>
                  ) : (
                    matches.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => void addPlayer(p)}
                          disabled={busy}
                          className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-stone-50 disabled:opacity-50"
                        >
                          <Avatar name={p.name} size="sm" userId={p.id} />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-stone-800">{p.name}</span>
                          <span className="text-xs font-semibold text-[#014421]">Add</span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
            {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Shown at the top of a space whose player hasn't joined yet. */
export function PendingInviteBanner({
  spaceId,
  inviteCode,
  playerName,
  coachName,
  onDeleted,
}: {
  spaceId: string;
  inviteCode: string;
  playerName: string;
  coachName: string;
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await deletePendingSpace(createClient(), spaceId);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete the invite.");
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="flex items-start gap-2">
        <Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-[#FFA500]" aria-hidden />
        <div className="min-w-0 text-sm text-stone-800">
          <p className="font-semibold">Waiting for {firstName(playerName)} to join</p>
          <p className="text-xs text-stone-600">
            Anything you post here now will be waiting for them when they open the invite link.
          </p>
        </div>
      </div>
      <InviteLinkActions code={inviteCode} playerName={playerName} coachName={coachName} />
      {confirming ? (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-xs">
          <span className="text-stone-700">Delete this invite and anything posted in it?</span>
          <span className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-lg px-2 py-1 font-semibold text-stone-600 hover:bg-stone-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy}
              className="rounded-lg bg-red-600 px-2 py-1 font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? "Deleting…" : "Delete"}
            </button>
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-red-700"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          Delete invite
        </button>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
