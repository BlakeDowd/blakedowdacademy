"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  CalendarPlus,
  Check,
  ChevronDown,
  ClipboardList,
  Loader2,
  Plus,
  Search,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  assignmentHref,
  assignToPlayers,
  deleteAssignment,
  fetchAssignableItems,
  fetchAssignments,
  fetchCoachAssignments,
  setAssignmentDone,
  type AssignableItem,
  type CoachingAssignment,
} from "@/lib/coachingAssignments";
import type { CoachingSpaceSummary } from "@/lib/coachingFeed";
import { Avatar, timeAgo } from "@/components/coaching/coachingUi";

const itemKey = (i: Pick<AssignableItem, "kind" | "itemId">) => `${i.kind}:${i.itemId}`;

type Player = { id: string; name: string };

function openKeysByPlayer(list: CoachingAssignment[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const a of list) {
    if (a.completed_at) continue;
    let keys = out.get(a.student_id);
    if (!keys) out.set(a.student_id, (keys = new Set()));
    keys.add(itemKey({ kind: a.kind, itemId: a.item_id }));
  }
  return out;
}

let catalogPromise: Promise<AssignableItem[]> | null = null;
function loadCatalog(): Promise<AssignableItem[]> {
  catalogPromise ??= fetchAssignableItems().catch((err) => {
    catalogPromise = null;
    throw err;
  });
  return catalogPromise;
}

function useCatalog(enabled: boolean) {
  const [items, setItems] = useState<AssignableItem[] | null>(null);
  useEffect(() => {
    if (!enabled || items) return;
    let cancelled = false;
    loadCatalog()
      .then((list) => !cancelled && setItems(list))
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, [enabled, items]);
  return items;
}

function KindIcon({ kind, className }: { kind: AssignableItem["kind"]; className?: string }) {
  return kind === "lesson" ? (
    <BookOpen className={className} aria-hidden />
  ) : (
    <Target className={className} aria-hidden />
  );
}

function AssignmentRow({
  a,
  viewerIsCoach,
  detail,
  onToggle,
  onRemove,
}: {
  a: CoachingAssignment;
  viewerIsCoach: boolean;
  detail: AssignableItem | undefined;
  onToggle: (a: CoachingAssignment) => void;
  onRemove: (a: CoachingAssignment) => void;
}) {
  const [open, setOpen] = useState(false);
  const done = Boolean(a.completed_at);
  return (
    <li className="py-2.5">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => onToggle(a)}
          role="checkbox"
          aria-checked={done}
          aria-label={done ? `Mark ${a.title} as not done` : `Mark ${a.title} as done`}
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition ${
            done ? "border-[#014421] bg-[#014421] text-white" : "border-stone-300 bg-white hover:border-[#014421]"
          }`}
        >
          {done && <Check className="h-3.5 w-3.5" aria-hidden />}
        </button>
        <button type="button" onClick={() => setOpen((v) => !v)} className="min-w-0 flex-1 text-left" aria-expanded={open}>
          <span
            className={`block text-sm font-semibold leading-snug ${done ? "text-stone-400 line-through" : "text-stone-900"}`}
          >
            {a.title}
          </span>
          <span className="mt-0.5 flex items-center gap-1 text-[11px] text-stone-500">
            <KindIcon kind={a.kind} className="h-3 w-3" />
            {a.kind === "lesson" ? "Lesson" : "Drill"}
            {detail?.group ? ` · ${detail.group}` : ""} ·{" "}
            {done
              ? a.completed_auto
                ? `Done ${timeAgo(a.completed_at!, true)} (logged it)`
                : `Done ${timeAgo(a.completed_at!, true)}`
              : `Assigned ${timeAgo(a.created_at, true)}`}
          </span>
          {a.note && !open && <span className="mt-1 block truncate text-xs text-stone-600">{a.note}</span>}
        </button>
        <ChevronDown
          className={`mt-1 h-4 w-4 shrink-0 text-stone-400 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </div>
      {open && (
        <div className="ml-9 mt-2 space-y-2">
          {a.note && (
            <p className="whitespace-pre-wrap rounded-xl bg-orange-50 px-3 py-2 text-xs leading-snug text-stone-800">
              <span className="font-semibold">Coach&apos;s note: </span>
              {a.note}
            </p>
          )}
          {detail?.description && <p className="text-xs leading-relaxed text-stone-600">{detail.description}</p>}
          {detail?.goal && (
            <p className="text-xs text-stone-600">
              <span className="font-semibold text-stone-900">Goal: </span>
              {detail.goal}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {!viewerIsCoach && (
              <Link
                href={assignmentHref(a)}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#014421] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#013320]"
              >
                {a.kind === "lesson" ? (
                  <>
                    <BookOpen className="h-3.5 w-3.5" aria-hidden />
                    Open lesson
                  </>
                ) : (
                  <>
                    <CalendarPlus className="h-3.5 w-3.5" aria-hidden />
                    Add to my week
                  </>
                )}
              </Link>
            )}
            {viewerIsCoach && (
              <button
                type="button"
                onClick={() => onRemove(a)}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Remove
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * "Assigned by your coach" list. Players see it at the top of their Coaching tab (hidden when empty);
 * coaches see it inside a player's space with an Assign button.
 */
export function AssignmentsPanel({
  studentId,
  studentName,
  viewerId,
  viewerIsCoach,
  onAssigned,
}: {
  studentId: string;
  studentName?: string;
  viewerId: string;
  viewerIsCoach: boolean;
  /** Called after new assignments are posted (their feed message is new too). */
  onAssigned?: () => void;
}) {
  const [items, setItems] = useState<CoachingAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const catalog = useCatalog(items.length > 0 || assigning);
  const details = useMemo(() => new Map((catalog ?? []).map((i) => [itemKey(i), i] as const)), [catalog]);

  const load = useCallback(async () => {
    try {
      setItems(await fetchAssignments(createClient(), studentId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load assigned drills.");
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const toggle = async (a: CoachingAssignment) => {
    const done = !a.completed_at;
    setItems((prev) =>
      prev.map((x) => (x.id === a.id ? { ...x, completed_at: done ? new Date().toISOString() : null, completed_auto: false } : x)),
    );
    try {
      await setAssignmentDone(createClient(), a.id, done);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update.");
      void load();
    }
  };

  const remove = async (a: CoachingAssignment) => {
    if (!window.confirm(`Remove "${a.title}" from ${studentName ?? "this player"}'s assigned drills?`)) return;
    setItems((prev) => prev.filter((x) => x.id !== a.id));
    try {
      await deleteAssignment(createClient(), a.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove.");
      void load();
    }
  };

  const open = items.filter((a) => !a.completed_at);
  const done = items.filter((a) => a.completed_at);

  if (!viewerIsCoach && !loading && !error && items.length === 0) return null;

  return (
    <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-4 w-4 text-[#FFA500]" aria-hidden />
        <h3 className="text-sm font-bold text-stone-900">
          {viewerIsCoach ? "Assigned drills" : "Assigned by your coach"}
        </h3>
        {open.length > 0 && (
          <span className="rounded-full bg-[#FFA500] px-1.5 text-[10px] font-bold leading-4 text-white">{open.length}</span>
        )}
        {viewerIsCoach && (
          <button
            type="button"
            onClick={() => setAssigning(true)}
            className="ml-auto inline-flex items-center gap-1 rounded-full bg-[#014421] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#013320]"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Assign
          </button>
        )}
      </div>

      {loading ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-stone-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Loading…
        </p>
      ) : error ? (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{error}</p>
      ) : items.length === 0 ? (
        <p className="mt-2 text-xs text-stone-500">
          Nothing assigned yet. Pick drills or library lessons from your session and they&apos;ll show at the top of their
          Coaching tab.
        </p>
      ) : (
        <>
          {open.length === 0 ? (
            <p className="mt-2 text-xs text-stone-500">
              {viewerIsCoach ? "Everything assigned is done." : "All done. Nice work!"}
            </p>
          ) : (
            <ul className="mt-1 divide-y divide-stone-100">
              {open.map((a) => (
                <AssignmentRow
                  key={a.id}
                  a={a}
                  viewerIsCoach={viewerIsCoach}
                  detail={details.get(itemKey({ kind: a.kind, itemId: a.item_id }))}
                  onToggle={toggle}
                  onRemove={remove}
                />
              ))}
            </ul>
          )}
          {done.length > 0 && (
            <div className="mt-2 border-t border-stone-100 pt-2">
              <button
                type="button"
                onClick={() => setShowDone((v) => !v)}
                className="text-xs font-semibold text-stone-500 hover:text-stone-800"
                aria-expanded={showDone}
              >
                {showDone ? "Hide" : "Show"} {done.length} done
              </button>
              {showDone && (
                <ul className="divide-y divide-stone-100">
                  {done.map((a) => (
                    <AssignmentRow
                      key={a.id}
                      a={a}
                      viewerIsCoach={viewerIsCoach}
                      detail={details.get(itemKey({ kind: a.kind, itemId: a.item_id }))}
                      onToggle={toggle}
                      onRemove={remove}
                    />
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      {assigning && (
        <AssignSheet
          coachId={viewerId}
          catalog={catalog}
          players={[{ id: studentId, name: studentName ?? "this player" }]}
          initialPlayerIds={[studentId]}
          openByPlayer={openKeysByPlayer(items)}
          onClose={() => setAssigning(false)}
          onCreated={(created) => {
            setItems((prev) => [...created, ...prev]);
            onAssigned?.();
          }}
        />
      )}
    </section>
  );
}

type KindFilter = "all" | "drill" | "lesson";
const MAX_RESULTS = 80;

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/**
 * Pick drills/lessons (and, when given more than one player to choose from, who gets them).
 * Each player gets their own feed post.
 */
function AssignSheet({
  coachId,
  catalog,
  players,
  initialPlayerIds,
  openByPlayer,
  onClose,
  onCreated,
}: {
  coachId: string;
  catalog: AssignableItem[] | null;
  players: Player[];
  initialPlayerIds: string[];
  openByPlayer: Map<string, Set<string>>;
  onClose: () => void;
  onCreated: (created: CoachingAssignment[]) => void;
}) {
  const choosePlayers = players.length > 1;
  const [step, setStep] = useState<"items" | "players">("items");
  const [query, setQuery] = useState("");
  const [playerQuery, setPlayerQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [picked, setPicked] = useState<AssignableItem[]>([]);
  const [playerIds, setPlayerIds] = useState<string[]>(initialPlayerIds);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = players.filter((p) => playerIds.includes(p.id));
  const playerResults = useMemo(() => {
    const words = playerQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return players.filter((p) => words.every((w) => p.name.toLowerCase().includes(w)));
  }, [players, playerQuery]);
  const togglePlayer = (id: string) =>
    setPlayerIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const alreadyLabel = (key: string) => {
    const have = chosen.filter((p) => openByPlayer.get(p.id)?.has(key)).length;
    if (have === 0) return "";
    return chosen.length === 1 ? " · already assigned" : ` · already assigned to ${have}`;
  };
  const title =
    !choosePlayers && chosen.length === 1 ? `Assign to ${chosen[0].name}` : "Assign drills";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pickedKeys = new Set(picked.map(itemKey));
  const results = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (catalog ?? []).filter(
      (i) =>
        (kind === "all" || i.kind === kind) &&
        words.every((w) => `${i.title} ${i.group}`.toLowerCase().includes(w)),
    );
  }, [catalog, query, kind]);

  const toggle = (i: AssignableItem) =>
    setPicked((prev) => (prev.some((p) => itemKey(p) === itemKey(i)) ? prev.filter((p) => itemKey(p) !== itemKey(i)) : [...prev, i]));

  const submit = async () => {
    if (picked.length === 0 || chosen.length === 0) return;
    setSaving(true);
    setError(null);
    const { created, failed, error: failure } = await assignToPlayers(createClient(), {
      players: chosen,
      coachId,
      items: picked,
      note,
    });
    if (created.length > 0) onCreated(created);
    if (failed.length === 0) {
      onClose();
      return;
    }
    setPlayerIds(failed.map((p) => p.id));
    setError(
      created.length > 0
        ? `Assigned, except for ${failed.map((p) => p.name).join(", ")}: ${failure}`
        : (failure ?? "Couldn't assign."),
    );
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] w-full max-w-md flex-col rounded-t-3xl bg-white shadow-xl sm:rounded-3xl"
      >
        <div className="flex items-center gap-2 border-b border-stone-100 px-4 py-3">
          <h2 className="min-w-0 flex-1 truncate text-base font-bold text-stone-900">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-stone-500 hover:bg-stone-100" aria-label="Close">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {choosePlayers && (
          <div className="flex gap-1 px-4 pt-3" role="tablist">
            {(
              [
                ["items", `Drills & lessons${picked.length ? ` (${picked.length})` : ""}`],
                ["players", `Players${chosen.length ? ` (${chosen.length})` : ""}`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={step === id}
                onClick={() => setStep(id)}
                className={`flex-1 rounded-xl py-2 text-xs font-semibold transition ${
                  step === id ? "bg-[#014421] text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {step === "players" ? (
          <>
            <div className="px-4 pt-3">
              <label className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 focus-within:border-[#014421]">
                <Search className="h-4 w-4 shrink-0 text-stone-400" aria-hidden />
                <input
                  autoFocus
                  value={playerQuery}
                  onChange={(e) => setPlayerQuery(e.target.value)}
                  placeholder="Search players"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  aria-label="Search players"
                />
              </label>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
              {playerResults.length === 0 ? (
                <p className="py-8 text-center text-sm text-stone-500">No players match “{playerQuery.trim()}”.</p>
              ) : (
                <ul>
                  {playerResults.slice(0, MAX_RESULTS).map((p) => {
                    const isPicked = playerIds.includes(p.id);
                    const openCount = openByPlayer.get(p.id)?.size ?? 0;
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => togglePlayer(p.id)}
                          role="checkbox"
                          aria-checked={isPicked}
                          className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition ${
                            isPicked ? "bg-[#014421]/5" : "hover:bg-stone-50"
                          }`}
                        >
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${
                              isPicked ? "border-[#014421] bg-[#014421] text-white" : "border-stone-300"
                            }`}
                          >
                            {isPicked && <Check className="h-3 w-3" aria-hidden />}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-stone-900">{p.name}</span>
                          {openCount > 0 && <span className="text-[11px] text-stone-500">{openCount} open</span>}
                        </button>
                      </li>
                    );
                  })}
                  {playerResults.length > MAX_RESULTS && (
                    <li className="px-2 py-2 text-center text-[11px] text-stone-400">
                      {playerResults.length - MAX_RESULTS} more. Search to narrow it down.
                    </li>
                  )}
                </ul>
              )}
            </div>
          </>
        ) : (
        <>
        <div className="space-y-2 px-4 pt-3">
          <label className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 focus-within:border-[#014421]">
            <Search className="h-4 w-4 shrink-0 text-stone-400" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search drills and lessons"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              aria-label="Search drills and lessons"
            />
          </label>
          <div className="flex gap-1.5">
            {(
              [
                ["all", "All"],
                ["drill", "Drills"],
                ["lesson", "Library lessons"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setKind(id)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  kind === id ? "bg-[#014421] text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {catalog == null ? (
            <p className="flex items-center justify-center gap-2 py-8 text-sm text-stone-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading drills and lessons…
            </p>
          ) : results.length === 0 ? (
            <p className="py-8 text-center text-sm text-stone-500">Nothing matches “{query.trim()}”.</p>
          ) : (
            <ul>
              {results.slice(0, MAX_RESULTS).map((i) => {
                const key = itemKey(i);
                const isPicked = pickedKeys.has(key);
                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => toggle(i)}
                      role="checkbox"
                      aria-checked={isPicked}
                      className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition ${
                        isPicked ? "bg-[#014421]/5" : "hover:bg-stone-50"
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${
                          isPicked ? "border-[#014421] bg-[#014421] text-white" : "border-stone-300"
                        }`}
                      >
                        {isPicked && <Check className="h-3 w-3" aria-hidden />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-stone-900">{i.title}</span>
                        <span className="flex items-center gap-1 text-[11px] text-stone-500">
                          <KindIcon kind={i.kind} className="h-3 w-3" />
                          {i.kind === "lesson" ? "Lesson" : "Drill"}
                          {i.group ? ` · ${i.group}` : ""}
                          {alreadyLabel(key)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
              {results.length > MAX_RESULTS && (
                <li className="px-2 py-2 text-center text-[11px] text-stone-400">
                  {results.length - MAX_RESULTS} more. Search to narrow it down.
                </li>
              )}
            </ul>
          )}
        </div>
        </>
        )}

        <div className="space-y-2 border-t border-stone-100 px-4 py-3">
          {choosePlayers && chosen.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Players">
              {chosen.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => togglePlayer(p.id)}
                    className="inline-flex max-w-[10rem] items-center gap-1 rounded-full bg-[#FFA500] px-2.5 py-1 text-[11px] font-semibold text-white"
                  >
                    <span className="truncate">{p.name}</span>
                    <X className="h-3 w-3 shrink-0" aria-label="Remove" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {picked.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {picked.map((i) => (
                <li key={itemKey(i)}>
                  <button
                    type="button"
                    onClick={() => toggle(i)}
                    className="inline-flex max-w-[14rem] items-center gap-1 rounded-full bg-[#014421] px-2.5 py-1 text-[11px] font-semibold text-white"
                  >
                    <span className="truncate">{i.title}</span>
                    <X className="h-3 w-3 shrink-0" aria-label="Remove" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 1000))}
            rows={2}
            placeholder="Note for the player (optional), e.g. 3 × 10 balls, keep the hold at the finish"
            className="w-full resize-none rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-[#014421]"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          {choosePlayers && picked.length > 0 && chosen.length === 0 ? (
            <button
              type="button"
              onClick={() => setStep("players")}
              className="w-full rounded-xl bg-[#014421] py-2.5 text-sm font-semibold text-white hover:bg-[#013320]"
            >
              Next: pick players
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={picked.length === 0 || chosen.length === 0 || saving}
              className="w-full rounded-xl bg-[#014421] py-2.5 text-sm font-semibold text-white hover:bg-[#013320] disabled:opacity-40"
            >
              {saving
                ? "Assigning…"
                : picked.length === 0
                  ? "Pick drills or lessons"
                  : `Assign ${picked.length} to ${chosen.length === 1 ? firstName(chosen[0].name) : `${chosen.length} players`}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const WEEK_MS = 7 * 86400_000;

type PlayerGroup = {
  player: Player;
  pending: boolean;
  open: CoachingAssignment[];
  done: CoachingAssignment[];
  lastAt: number;
};

function PlayerAssignments({
  group,
  details,
  onToggle,
  onRemove,
  onAssignMore,
  onOpenSpace,
}: {
  group: PlayerGroup;
  details: Map<string, AssignableItem>;
  onToggle: (a: CoachingAssignment) => void;
  onRemove: (a: CoachingAssignment) => void;
  onAssignMore: (player: Player) => void;
  onOpenSpace: (id: string, name: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { player, open, done } = group;
  const total = open.length + done.length;
  const lastDone = done.reduce<string | null>(
    (best, a) => (a.completed_at && (!best || a.completed_at > best) ? a.completed_at : best),
    null,
  );
  const rowProps = (a: CoachingAssignment) => ({
    a,
    viewerIsCoach: true,
    detail: details.get(itemKey({ kind: a.kind, itemId: a.item_id })),
    onToggle,
    onRemove,
  });

  return (
    <li className="py-1">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 rounded-2xl px-1 py-2 text-left hover:bg-stone-50"
      >
        <Avatar name={player.name} size="sm" userId={group.pending ? null : player.id} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-stone-900">{player.name}</span>
          <span className="block text-[11px] text-stone-500">
            {open.length > 0 ? `${open.length} open` : "All done"} · {done.length} done
            {lastDone ? ` · last done ${timeAgo(lastDone, true)}` : ""}
          </span>
          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-stone-100">
            <span
              className="block h-full rounded-full bg-[#014421]"
              style={{ width: `${total ? Math.round((done.length / total) * 100) : 0}%` }}
            />
          </span>
        </span>
        {open.length > 0 && (
          <span className="rounded-full bg-[#FFA500] px-1.5 text-[10px] font-bold leading-4 text-white">{open.length}</span>
        )}
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-stone-400 transition-transform ${expanded ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {expanded && (
        <div className="ml-10 pb-2">
          <ul className="divide-y divide-stone-100">
            {open.map((a) => (
              <AssignmentRow key={a.id} {...rowProps(a)} />
            ))}
            {done.map((a) => (
              <AssignmentRow key={a.id} {...rowProps(a)} />
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onAssignMore(player)}
              className="inline-flex items-center gap-1 rounded-full bg-[#014421] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#013320]"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Assign more
            </button>
            <button
              type="button"
              onClick={() => onOpenSpace(player.id, player.name)}
              className="rounded-full px-3 py-1.5 text-xs font-semibold text-[#014421] hover:bg-[#014421]/5"
            >
              Open space
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/** Coach-wide view: allocate drills to one or many clients and see who's working through them. */
export function AssignedOverview({
  viewerId,
  spaces,
  onOpenSpace,
}: {
  viewerId: string;
  spaces: CoachingSpaceSummary[];
  onOpenSpace: (id: string, name: string) => void;
}) {
  const [items, setItems] = useState<CoachingAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [query, setQuery] = useState("");
  const [assignTo, setAssignTo] = useState<string[] | null>(null);
  const catalog = useCatalog(items.length > 0 || assignTo !== null);
  const details = useMemo(() => new Map((catalog ?? []).map((i) => [itemKey(i), i] as const)), [catalog]);

  const players = useMemo(
    () =>
      spaces
        .map((s) => ({ id: s.studentId, name: s.name || "Golfer" }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [spaces],
  );

  const load = useCallback(async () => {
    try {
      setItems(await fetchCoachAssignments(createClient(), viewerId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load assigned drills.");
    } finally {
      setLoading(false);
    }
  }, [viewerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (a: CoachingAssignment) => {
    const done = !a.completed_at;
    setItems((prev) =>
      prev.map((x) => (x.id === a.id ? { ...x, completed_at: done ? new Date().toISOString() : null, completed_auto: false } : x)),
    );
    try {
      await setAssignmentDone(createClient(), a.id, done);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update.");
      void load();
    }
  };

  const remove = async (a: CoachingAssignment) => {
    const name = players.find((p) => p.id === a.student_id)?.name ?? "this player";
    if (!window.confirm(`Remove "${a.title}" from ${name}'s assigned drills?`)) return;
    setItems((prev) => prev.filter((x) => x.id !== a.id));
    try {
      await deleteAssignment(createClient(), a.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove.");
      void load();
    }
  };

  const groups = useMemo(() => {
    const pendingIds = new Set(spaces.filter((s) => s.space?.pending).map((s) => s.studentId));
    const nameOf = new Map(players.map((p) => [p.id, p.name] as const));
    const byPlayer = new Map<string, PlayerGroup>();
    for (const a of items) {
      let g = byPlayer.get(a.student_id);
      if (!g) {
        g = {
          player: { id: a.student_id, name: nameOf.get(a.student_id) ?? "Golfer" },
          pending: pendingIds.has(a.student_id),
          open: [],
          done: [],
          lastAt: 0,
        };
        byPlayer.set(a.student_id, g);
      }
      (a.completed_at ? g.done : g.open).push(a);
      g.lastAt = Math.max(g.lastAt, Date.parse(a.completed_at ?? a.created_at) || 0);
    }
    return [...byPlayer.values()].sort((x, y) => Number(y.open.length > 0) - Number(x.open.length > 0) || y.lastAt - x.lastAt);
  }, [items, players, spaces]);

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = groups.filter(
    (g) => (filter === "all" || g.open.length > 0) && words.every((w) => g.player.name.toLowerCase().includes(w)),
  );
  const openCount = items.filter((a) => !a.completed_at).length;
  const weekAgo = Date.now() - WEEK_MS;
  const doneThisWeek = items.filter((a) => a.completed_at && Date.parse(a.completed_at) >= weekAgo).length;
  const playersWithOpen = groups.filter((g) => g.open.length > 0).length;

  return (
    <div className="space-y-3">
      <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-[#FFA500]" aria-hidden />
          <h3 className="text-sm font-bold text-stone-900">Assigned drills</h3>
          <button
            type="button"
            onClick={() => setAssignTo([])}
            className="ml-auto inline-flex items-center gap-1 rounded-full bg-[#014421] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#013320]"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Assign
          </button>
        </div>
        <p className="mt-1 text-xs text-stone-500">
          Allocate drills or library lessons to one or more clients. They show at the top of each player&apos;s Coaching tab.
        </p>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
          {(
            [
              ["Open", openCount],
              ["Done this week", doneThisWeek],
              ["Players working", playersWithOpen],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-stone-50 px-2 py-2">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">{label}</dt>
              <dd className="text-lg font-bold text-[#014421]">{loading ? "–" : value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
        <div className="flex items-center gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-1.5 focus-within:border-[#014421]">
            <Search className="h-3.5 w-3.5 shrink-0 text-stone-400" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search players"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              aria-label="Search players"
            />
          </label>
          {(
            [
              ["open", "Open"],
              ["all", "All"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              aria-pressed={filter === id}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                filter === id ? "bg-[#014421] text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="mt-3 flex items-center gap-2 text-xs text-stone-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Loading…
          </p>
        ) : error ? (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{error}</p>
        ) : groups.length === 0 ? (
          <p className="mt-3 text-xs text-stone-500">
            Nothing assigned yet. Tap Assign to pick drills and the players who should work on them.
          </p>
        ) : shown.length === 0 ? (
          <p className="mt-3 text-xs text-stone-500">
            {words.length ? "No players match." : "Everything assigned is done. Tap All to see completed drills."}
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-stone-100">
            {shown.map((g) => (
              <PlayerAssignments
                key={g.player.id}
                group={g}
                details={details}
                onToggle={toggle}
                onRemove={remove}
                onAssignMore={(p) => setAssignTo([p.id])}
                onOpenSpace={onOpenSpace}
              />
            ))}
          </ul>
        )}
      </section>

      {assignTo && (
        <AssignSheet
          coachId={viewerId}
          catalog={catalog}
          players={players}
          initialPlayerIds={assignTo}
          openByPlayer={openKeysByPlayer(items)}
          onClose={() => setAssignTo(null)}
          onCreated={(created) => setItems((prev) => [...created, ...prev])}
        />
      )}
    </div>
  );
}
