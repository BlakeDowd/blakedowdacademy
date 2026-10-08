"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Hourglass, Loader2, Plus, RefreshCw, Search, Share2, Trash2, UserPlus, Users, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { authJsonHeaders, fetchProfileNames } from "@/lib/coachingFeed";
import { fetchPlayerOptions, inviteUrl, type PlayerOption } from "@/lib/coachingSpaces";
import { resetFamilyInvite, shareFamilyInvite } from "@/lib/family";
import { Avatar } from "@/components/coaching/coachingUi";

type Member = { userId: string; name: string; role: "guardian" | "player"; managed: boolean };
type Family = { id: string; name: string; inviteCode: string | null; members: Member[] };

const SETUP_MESSAGE = "Families need a database update. Run supabase/migrations/20261008160000_families.sql in Supabase.";

const surnameOf = (familyName: string) => familyName.replace(/\s+family$/i, "").trim();

async function fetchFamilies(): Promise<Family[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("families")
    .select("id, name, invite_code, created_at, family_members(user_id, role, managed, added_at)")
    .order("created_at", { ascending: false });
  if (error) {
    if (error.code === "42703" || /invite_code/.test(error.message)) {
      throw new Error(
        "Family invite links need a database update. Run supabase/migrations/20261008170000_family_invites.sql in Supabase.",
      );
    }
    if (error.code === "PGRST205" || error.code === "42P01" || /families/.test(error.message)) {
      throw new Error(SETUP_MESSAGE);
    }
    throw new Error(error.message);
  }
  const rows = (data ?? []) as {
    id: string;
    name: string;
    invite_code?: string | null;
    family_members: { user_id: string; role: string; managed: boolean; added_at: string }[];
  }[];
  const names = await fetchProfileNames(
    supabase,
    rows.flatMap((f) => f.family_members.map((m) => m.user_id)),
  );
  return rows.map((f) => ({
    id: f.id,
    name: f.name,
    inviteCode: f.invite_code ?? null,
    members: [...f.family_members]
      .sort((a, b) => Number(b.role === "guardian") - Number(a.role === "guardian") || a.added_at.localeCompare(b.added_at))
      .map((m) => ({
        userId: m.user_id,
        name: names.get(m.user_id) ?? "Player",
        role: m.role === "guardian" ? "guardian" : "player",
        managed: m.managed,
      })),
  }));
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
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

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-3xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-stone-900">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-stone-500 hover:bg-stone-100" aria-label="Close">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function usePlayerOptions() {
  const [players, setPlayers] = useState<PlayerOption[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchPlayerOptions(createClient())
      .then((list) => !cancelled && setPlayers(list))
      .catch(() => !cancelled && setPlayers([]));
    return () => {
      cancelled = true;
    };
  }, []);
  return players;
}

function PlayerSearch({
  label,
  placeholder,
  excludeIds,
  actionLabel,
  busy,
  onPick,
}: {
  label: string;
  placeholder: string;
  excludeIds: Set<string>;
  actionLabel: string;
  busy: boolean;
  onPick: (p: PlayerOption) => void;
}) {
  const players = usePlayerOptions();
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !players) return [];
    return players.filter((p) => !excludeIds.has(p.id) && p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [players, query, excludeIds]);

  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-stone-800">{label}</p>
      <label className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 focus-within:border-[#014421]">
        <Search className="h-4 w-4 shrink-0 text-stone-400" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          aria-label={label}
        />
      </label>
      {query.trim() && (
        <ul className="mt-2 divide-y divide-stone-100">
          {players === null ? (
            <li className="flex items-center gap-2 py-3 text-sm text-stone-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading players…
            </li>
          ) : matches.length === 0 ? (
            <li className="py-3 text-sm text-stone-500">No players match.</li>
          ) : (
            matches.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onPick(p)}
                  disabled={busy}
                  className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-stone-50 disabled:opacity-50"
                >
                  <Avatar name={p.name} size="sm" userId={p.id} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-stone-800">{p.name}</span>
                  <span className="text-xs font-semibold text-[#014421]">{actionLabel}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

function NewFamilySheet({ onClose, onCreated }: { onClose: () => void; onCreated: (familyId: string) => void }) {
  const [name, setName] = useState("");
  const [parent, setParent] = useState<PlayerOption | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noIds = useMemo(() => new Set<string>(), []);

  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error: famError } = await supabase.from("families").insert({ name: name.trim() }).select("id").single();
    if (famError || !data) {
      setError(famError?.message.includes("families") ? SETUP_MESSAGE : famError?.message || "Couldn't create the family.");
      setBusy(false);
      return;
    }
    const { error: memberError } = parent
      ? await supabase.from("family_members").insert({ family_id: data.id, user_id: parent.id, role: "guardian" })
      : { error: null };
    if (memberError) {
      await supabase.from("families").delete().eq("id", data.id);
      setError(memberError.message);
      setBusy(false);
      return;
    }
    onCreated(data.id as string);
  };

  return (
    <Sheet title="New family" onClose={onClose}>
      <div className="space-y-5">
        <div className="space-y-2">
          <label htmlFor="family-name" className="block text-sm font-semibold text-stone-800">
            Family name
          </label>
          <input
            id="family-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Dobson family"
            maxLength={80}
            autoComplete="off"
            className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-[#014421]"
          />
        </div>
        {parent ? (
          <div>
            <p className="mb-2 text-sm font-semibold text-stone-800">Family login</p>
            <div className="flex items-center gap-3 rounded-xl border border-[#014421]/30 bg-[#014421]/5 px-3 py-2">
              <Avatar name={parent.name} size="sm" userId={parent.id} />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-900">{parent.name}</span>
              <button type="button" onClick={() => setParent(null)} className="text-xs font-semibold text-stone-500 hover:text-stone-800">
                Change
              </button>
            </div>
          </div>
        ) : (
          <PlayerSearch
            label="Parent already on the app? (optional)"
            placeholder="Search players on the app"
            excludeIds={noIds}
            actionLabel="Choose"
            busy={busy}
            onPick={setParent}
          />
        )}
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Add the kids next. If the parent isn&apos;t on the app yet, you&apos;ll get a family link to text them. They sign up
          through it and become the family login.
        </p>
        <button
          type="button"
          onClick={() => void create()}
          disabled={!name.trim() || busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#014421] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#013320] disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Users className="h-4 w-4" aria-hidden />}
          Create family
        </button>
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>
    </Sheet>
  );
}

function AddMemberSheet({ family, onClose, onAdded }: { family: Family; onClose: () => void; onAdded: () => void }) {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState(surnameOf(family.name));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const memberIds = useMemo(() => new Set(family.members.map((m) => m.userId)), [family.members]);

  const addJunior = async () => {
    if (!first.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/family/children", {
        method: "POST",
        headers: await authJsonHeaders(),
        body: JSON.stringify({ familyId: family.id, firstName: first, lastName: last }),
      });
      const body = (await res.json().catch(() => ({}))) as { name?: string; error?: string };
      if (!res.ok) throw new Error(body.error || "Couldn't add the child.");
      setAdded((a) => [...a, body.name ?? first.trim()]);
      setFirst("");
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add the child.");
    } finally {
      setBusy(false);
    }
  };

  const addExisting = async (p: PlayerOption) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const { error: insertError } = await createClient()
      .from("family_members")
      .insert({ family_id: family.id, user_id: p.id, role: "player" });
    setBusy(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setAdded((a) => [...a, p.name]);
    onAdded();
  };

  return (
    <Sheet title={`Add to ${family.name}`} onClose={onClose}>
      <div className="space-y-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void addJunior();
          }}
          className="space-y-2"
        >
          <p className="text-sm font-semibold text-stone-800">New junior</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              value={first}
              onChange={(e) => setFirst(e.target.value)}
              placeholder="First name"
              maxLength={40}
              autoComplete="off"
              aria-label="First name"
              className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-[#014421]"
            />
            <input
              value={last}
              onChange={(e) => setLast(e.target.value)}
              placeholder="Last name"
              maxLength={40}
              autoComplete="off"
              aria-label="Last name"
              className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-[#014421]"
            />
          </div>
          <p className="text-xs text-stone-500">
            Shown as {first.trim() ? `${first.trim()}${last.trim() ? ` ${last.trim()[0]!.toUpperCase()}.` : ""}` : "first name + last initial"} on
            leaderboards. No email needed.
          </p>
          <button
            type="submit"
            disabled={!first.trim() || busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#014421] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#013320] disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <UserPlus className="h-4 w-4" aria-hidden />}
            Add junior
          </button>
        </form>
        {added.length > 0 && (
          <p className="rounded-xl bg-[#014421]/5 px-3 py-2 text-xs font-semibold text-[#014421]">Added {added.join(", ")}</p>
        )}
        <div className="border-t border-stone-100 pt-4">
          <PlayerSearch
            label="Already on the app?"
            placeholder="Search players"
            excludeIds={memberIds}
            actionLabel="Add"
            busy={busy}
            onPick={(p) => void addExisting(p)}
          />
        </div>
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>
    </Sheet>
  );
}

function FamilyLinkActions({ family, coachName }: { family: Family; coachName: string }) {
  const [code, setCode] = useState(family.inviteCode);
  const [status, setStatus] = useState<"idle" | "copied" | "shared">("idle");
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!code) return null;

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

  const reset = async () => {
    setResetting(true);
    setError(null);
    try {
      setCode(await resetFamilyInvite(family.id));
      setConfirmReset(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't make a new link.");
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="select-all break-all rounded-xl border border-stone-200 bg-white px-3 py-2 font-mono text-xs text-stone-700">
        {inviteUrl(code)}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void run(() => shareFamilyInvite(code, family.name, coachName))}
          className="flex items-center justify-center gap-2 rounded-xl bg-[#014421] px-3 py-2.5 text-sm font-semibold text-white hover:bg-[#013320]"
        >
          <Share2 className="h-4 w-4" aria-hidden />
          {status === "shared" ? "Sent" : "Share link"}
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
      {confirmReset ? (
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-stone-600">The old link will stop working.</span>
          <span className="flex shrink-0 gap-1">
            <button type="button" onClick={() => setConfirmReset(false)} className="rounded-lg px-2 py-1 font-semibold text-stone-600 hover:bg-stone-100">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void reset()}
              disabled={resetting}
              className="rounded-lg bg-stone-800 px-2 py-1 font-semibold text-white hover:bg-stone-900 disabled:opacity-50"
            >
              {resetting ? "Making…" : "New link"}
            </button>
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmReset(true)}
          className="flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-stone-800"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Make a new link
        </button>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function FamilyCard({
  family,
  coachName,
  onAdd,
  onOpenSpace,
  onChanged,
}: {
  family: Family;
  coachName: string;
  onAdd: () => void;
  onOpenSpace: (id: string, name: string) => void;
  onChanged: () => void;
}) {
  const hasLogin = family.members.some((m) => m.role === "guardian");
  const [showLink, setShowLink] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: "member"; member: Member } | { kind: "family" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    if (!confirm) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: removeError } =
      confirm.kind === "family"
        ? await supabase.from("families").delete().eq("id", family.id)
        : await supabase.from("family_members").delete().eq("family_id", family.id).eq("user_id", confirm.member.userId);
    setBusy(false);
    if (removeError) {
      setError(removeError.message);
      return;
    }
    setConfirm(null);
    onChanged();
  };

  const juniors = family.members.filter((m) => m.role === "player").length;

  return (
    <li className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold text-stone-900">{family.name}</h3>
          <p className="text-xs text-stone-500">
            {juniors} {juniors === 1 ? "player" : "players"} · one login
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="flex shrink-0 items-center gap-1 rounded-full bg-[#014421] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#013320]"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add
        </button>
      </div>
      <ul className="mt-3 divide-y divide-stone-100">
        {family.members.map((m) => (
          <li key={m.userId} className="flex items-center gap-3 py-2">
            <button
              type="button"
              onClick={() => onOpenSpace(m.userId, m.name)}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              <Avatar name={m.name} size="sm" userId={m.userId} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-stone-800">{m.name}</span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  m.role === "guardian" ? "bg-[#FFA500]/20 text-[#3d2600]" : "bg-stone-100 text-stone-600"
                }`}
              >
                {m.role === "guardian" ? "Family login" : m.managed ? "Junior" : "Player"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setConfirm({ kind: "member", member: m })}
              className="shrink-0 rounded-full p-1.5 text-stone-400 hover:bg-stone-100 hover:text-red-600"
              aria-label={`Remove ${m.name} from the family`}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {!hasLogin ? (
        <div className="mt-2 space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
          <div className="flex items-start gap-2">
            <Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-[#FFA500]" aria-hidden />
            <div className="min-w-0 text-sm text-stone-800">
              <p className="font-semibold">Waiting for the parent to sign up</p>
              <p className="text-xs text-stone-600">
                Text them this link. You can test the kids and post videos for them in the meantime.
              </p>
            </div>
          </div>
          <FamilyLinkActions family={family} coachName={coachName} />
        </div>
      ) : showLink ? (
        <div className="mt-2 space-y-2 rounded-xl bg-stone-50 p-3">
          <p className="text-xs text-stone-600">Send this to another parent so they can sign in on their own phone too.</p>
          <FamilyLinkActions family={family} coachName={coachName} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowLink(true)}
          className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-[#014421] hover:underline"
        >
          <Share2 className="h-3.5 w-3.5" aria-hidden />
          Invite another parent
        </button>
      )}
      {confirm ? (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-stone-50 px-3 py-2 text-xs">
          <span className="text-stone-700">
            {confirm.kind === "family"
              ? "Delete this family? Players keep their accounts and history."
              : `Remove ${confirm.member.name}? They keep their history${confirm.member.managed ? ", but can't be picked on the family phone" : ""}.`}
          </span>
          <span className="flex shrink-0 gap-1">
            <button type="button" onClick={() => setConfirm(null)} className="rounded-lg px-2 py-1 font-semibold text-stone-600 hover:bg-stone-100">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy}
              className="rounded-lg bg-red-600 px-2 py-1 font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? "Removing…" : "Remove"}
            </button>
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirm({ kind: "family" })}
          className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-stone-400 hover:text-red-700"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          Delete family
        </button>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </li>
  );
}

/** Coach view: families sharing one login on a family device, each child still their own player. */
export function CoachingFamilies({
  coachName,
  onOpenSpace,
  onChanged,
}: {
  coachName: string;
  onOpenSpace: (id: string, name: string) => void;
  onChanged: () => void;
}) {
  const [families, setFamilies] = useState<Family[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [addingTo, setAddingTo] = useState<string | null>(null);

  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchFamilies()
      .then((list) => {
        if (cancelled) return;
        setFamilies(list);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Couldn't load families.");
        setFamilies([]);
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  const refresh = () => {
    setVersion((v) => v + 1);
    onChanged();
  };
  const closeCreating = useCallback(() => setCreating(false), []);
  const closeAdding = useCallback(() => setAddingTo(null), []);
  const adding = families?.find((f) => f.id === addingTo) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 px-1">
        <p className="text-xs text-stone-500">
          One login on the family phone. Each child picks their face and keeps their own scores, streaks and coaching space.
        </p>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#014421] px-3 py-2 text-xs font-bold text-white hover:bg-[#013320]"
        >
          <Users className="h-4 w-4" aria-hidden />
          New family
        </button>
      </div>
      {error ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{error}</p>
      ) : families === null ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-stone-400" aria-hidden />
        </div>
      ) : families.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 px-4 py-10 text-center">
          <Users className="mx-auto h-8 w-8 text-stone-300" aria-hidden />
          <p className="mt-2 text-sm font-semibold text-stone-700">No families yet</p>
          <p className="mt-1 text-xs text-stone-500">Create one at the lesson, add the kids, then text the parent the family link.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {families.map((f) => (
            <FamilyCard
              key={f.id}
              family={f}
              coachName={coachName}
              onAdd={() => setAddingTo(f.id)}
              onOpenSpace={onOpenSpace}
              onChanged={refresh}
            />
          ))}
        </ul>
      )}
      {creating && (
        <NewFamilySheet
          onClose={closeCreating}
          onCreated={(familyId) => {
            setCreating(false);
            setAddingTo(familyId);
            refresh();
          }}
        />
      )}
      {adding && <AddMemberSheet family={adding} onClose={closeAdding} onAdded={refresh} />}
    </div>
  );
}
