"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookHeart,
  Loader2,
  Pin,
  PinOff,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { isCoachEmail } from "@/lib/coachEmails";
import { createClient } from "@/lib/supabase/client";
import { trackToolUse } from "@/lib/appUsage";
import { TestingForSelect } from "@/components/combine/TestingForSelect";
import type { PlayerOption } from "@/lib/coachingSpaces";
import {
  FEEL_LOG_BALL_FLIGHTS,
  FEEL_LOG_CLUBS,
  FEEL_LOG_FOCUS_AREAS,
  FEEL_LOG_MIGRATION_HINT,
  deleteFeelLog,
  fetchFeelLogs,
  formatFeelLogWhen,
  insertFeelLog,
  updateFeelLog,
  type FeelLogBallFlight,
  type FeelLogEntry,
} from "@/lib/feelLog";

const FIELD =
  "w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-[#014421]";

function readStoredTestingFor(): PlayerOption | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(sessionStorage.getItem("combine:testing-for") ?? "null");
    return parsed && typeof parsed.id === "string" && typeof parsed.name === "string"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export default function FeelLog({ hideHeader }: { hideHeader?: boolean }) {
  const { user } = useAuth();
  const isCoach = isCoachEmail(user?.email) || user?.role === "coach";
  const [testingFor, setTestingFor] = useState<PlayerOption | null>(null);
  const [testingHydrated, setTestingHydrated] = useState(!isCoach);

  useEffect(() => {
    if (!isCoach) {
      setTestingHydrated(true);
      return;
    }
    setTestingFor(readStoredTestingFor());
    setTestingHydrated(true);
  }, [isCoach]);

  // Coaches default to their own log until they pick a player.
  const ownerId = isCoach ? testingFor?.id ?? user?.id ?? null : user?.id ?? null;
  const loggingForSelf = Boolean(user?.id && ownerId === user.id);

  const [club, setClub] = useState("7-Iron");
  const [focusArea, setFocusArea] = useState("Tempo");
  const [targetFeel, setTargetFeel] = useState("");
  const [ballFlight, setBallFlight] = useState<FeelLogBallFlight | "">("");
  const [golden, setGolden] = useState(false);
  const [pinOnSave, setPinOnSave] = useState(false);
  const [coachNotesDraft, setCoachNotesDraft] = useState("");

  const [rows, setRows] = useState<FeelLogEntry[]>([]);
  const [goldenOnly, setGoldenOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [available, setAvailable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!ownerId) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetchFeelLogs(createClient(), {
      userId: ownerId,
      goldenOnly,
    });
    setLoading(false);
    setAvailable(res.available);
    if (res.error) {
      setError(res.error);
      setRows([]);
      return;
    }
    setRows(res.rows);
  }, [ownerId, goldenOnly]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const pinnedCount = useMemo(() => rows.filter((r) => r.is_pinned).length, [rows]);
  const goldenCount = useMemo(() => rows.filter((r) => r.is_hitting_it_good).length, [rows]);

  const save = async () => {
    if (!user?.id) {
      setError("Sign in to save feels.");
      return;
    }
    if (!ownerId) {
      setError(isCoach ? "Pick who this feel log is for." : "Sign in to save feels.");
      return;
    }
    if (!targetFeel.trim()) {
      setError("Add the feel / cue you want to remember.");
      return;
    }
    setSaving(true);
    setError(null);
    setOk(null);
    const wasGolden = golden;
    const res = await insertFeelLog(createClient(), {
      userId: ownerId,
      club,
      targetFeel,
      focusArea,
      isHittingItGood: golden,
      ballFlightResult: ballFlight || null,
      isPinned: pinOnSave,
      coachNotes: isCoach && coachNotesDraft.trim() ? coachNotesDraft : undefined,
    });
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    try {
      trackToolUse("feel-log");
    } catch {
      /* usage tracking is optional */
    }
    setTargetFeel("");
    setBallFlight("");
    setGolden(false);
    setPinOnSave(false);
    setCoachNotesDraft("");
    setOk(wasGolden ? "Golden anchor saved." : "Feel logged.");
    await reload();
  };

  const togglePin = async (entry: FeelLogEntry) => {
    setBusyId(entry.id);
    setError(null);
    const res = await updateFeelLog(createClient(), entry.id, {
      isPinned: !entry.is_pinned,
    });
    setBusyId(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    await reload();
  };

  const toggleGolden = async (entry: FeelLogEntry) => {
    setBusyId(entry.id);
    setError(null);
    const res = await updateFeelLog(createClient(), entry.id, {
      isHittingItGood: !entry.is_hitting_it_good,
    });
    setBusyId(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    await reload();
  };

  const saveCoachNotes = async (entry: FeelLogEntry, notes: string) => {
    setBusyId(entry.id);
    setError(null);
    const res = await updateFeelLog(createClient(), entry.id, {
      coachNotes: notes,
    });
    setBusyId(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    await reload();
  };

  const remove = async (entry: FeelLogEntry) => {
    if (!confirm("Delete this feel log entry?")) return;
    setBusyId(entry.id);
    setError(null);
    const res = await deleteFeelLog(createClient(), entry.id);
    setBusyId(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    await reload();
  };

  return (
    <div className="space-y-4">
      {!hideHeader && (
        <div className="flex items-center gap-2 text-[#014421]">
          <BookHeart className="h-5 w-5" aria-hidden />
          <h2 className="text-lg font-bold">Feel Log</h2>
        </div>
      )}

      {isCoach && testingHydrated && (
        <div className="space-y-2">
          <TestingForSelect
            value={testingFor}
            onChange={setTestingFor}
            promptTitle="Whose feel log?"
            promptHint="Search a player, or leave blank to log for yourself"
            selectedTitle={(name) => `Logging for ${name}`}
            selectedHint="Entries save under their account so they can revisit later."
          />
          {!testingFor ? (
            <p className="rounded-xl bg-[#014421]/5 px-3 py-2 text-[11px] font-medium text-[#014421]">
              Saving to <span className="font-bold">your</span> feel log
              {user?.fullName ? ` (${user.fullName})` : ""}.
            </p>
          ) : null}
        </div>
      )}

      {!available ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
          {FEEL_LOG_MIGRATION_HINT}
        </p>
      ) : null}

      <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
          New entry
        </p>
        <p className="mt-1 text-[11px] leading-snug text-stone-500">
          Capture the cue that clicked — golden anchors rebuild confidence later.
        </p>

        <label className="mt-3 block text-[11px] font-medium text-stone-500">
          Club
          <select
            value={club}
            onChange={(e) => setClub(e.target.value)}
            className={`${FIELD} mt-1`}
            disabled={saving}
          >
            {FEEL_LOG_CLUBS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-3 block text-[11px] font-medium text-stone-500">
          Working on
          <select
            value={focusArea}
            onChange={(e) => setFocusArea(e.target.value)}
            className={`${FIELD} mt-1`}
            disabled={saving}
          >
            {FEEL_LOG_FOCUS_AREAS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-3 block text-[11px] font-medium text-stone-500">
          Target feel / mental cue
          <textarea
            value={targetFeel}
            onChange={(e) => setTargetFeel(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder='e.g. "Keep chest pointed at ball during takeaway"'
            className={`${FIELD} mt-1 resize-y`}
            disabled={saving}
          />
        </label>

        <label className="mt-3 block text-[11px] font-medium text-stone-500">
          Ball flight (optional)
          <select
            value={ballFlight}
            onChange={(e) => setBallFlight(e.target.value as FeelLogBallFlight | "")}
            className={`${FIELD} mt-1`}
            disabled={saving}
          >
            <option value="">—</option>
            {FEEL_LOG_BALL_FLIGHTS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setGolden((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${
              golden
                ? "bg-amber-500 text-white"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
            disabled={saving}
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Golden anchor
          </button>
          <button
            type="button"
            onClick={() => setPinOnSave((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${
              pinOnSave
                ? "bg-[#014421] text-white"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
            disabled={saving}
          >
            <Pin className="h-3.5 w-3.5" aria-hidden />
            Pin for warmup
          </button>
        </div>

        {isCoach ? (
          <label className="mt-3 block text-[11px] font-medium text-stone-500">
            Coach notes (optional)
            <textarea
              value={coachNotesDraft}
              onChange={(e) => setCoachNotesDraft(e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder="Cue for them to revisit…"
              className={`${FIELD} mt-1 resize-y`}
              disabled={saving}
            />
          </label>
        ) : null}

        {error ? <p className="mt-3 text-xs font-medium text-red-600">{error}</p> : null}
        {ok ? <p className="mt-3 text-xs font-medium text-[#014421]">{ok}</p> : null}

        <button
          type="button"
          disabled={saving || !user?.id || !testingHydrated}
          onClick={() => void save()}
          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#014421] px-3 py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {loggingForSelf ? "Save feel" : `Save for ${testingFor?.name || "player"}`}
        </button>
        {!user?.id ? (
          <p className="mt-2 text-center text-[11px] text-stone-500">Sign in to save feels.</p>
        ) : null}
      </section>

      <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
              Diary
            </p>
            <p className="mt-0.5 text-[11px] text-stone-400">
              {rows.length} entr{rows.length === 1 ? "y" : "ies"}
              {pinnedCount ? ` · ${pinnedCount} pinned` : ""}
              {goldenCount ? ` · ${goldenCount} golden` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setGoldenOnly((v) => !v)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
              goldenOnly
                ? "bg-amber-500 text-white"
                : "bg-stone-100 text-stone-600"
            }`}
          >
            Golden only
          </button>
        </div>

        {!ownerId ? (
          <p className="mt-3 text-center text-xs text-stone-500">
            {isCoach ? "Select a player to view their feel log." : "Sign in to see your diary."}
          </p>
        ) : loading ? (
          <p className="mt-4 flex items-center justify-center gap-2 text-sm text-stone-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading…
          </p>
        ) : rows.length === 0 ? (
          <p className="mt-3 text-center text-xs text-stone-500">
            {goldenOnly
              ? "No golden anchors yet — flag a breakthrough session when it clicks."
              : "No feels logged yet. Save your first cue above."}
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {rows.map((entry) => {
              const busy = busyId === entry.id;
              return (
                <li
                  key={entry.id}
                  className={`rounded-2xl px-3 py-2.5 ring-1 ${
                    entry.is_hitting_it_good
                      ? "bg-gradient-to-br from-amber-50 to-white ring-amber-200"
                      : "bg-stone-50/80 ring-stone-200"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-bold text-stone-900">{entry.club}</span>
                        <span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-semibold text-stone-500 ring-1 ring-stone-200">
                          {entry.focus_area}
                        </span>
                        {entry.is_hitting_it_good ? (
                          <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                            <Sparkles className="h-3 w-3" aria-hidden />
                            Golden
                          </span>
                        ) : null}
                        {entry.is_pinned ? (
                          <span className="inline-flex items-center gap-0.5 rounded-md bg-[#014421]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#014421]">
                            <Pin className="h-3 w-3" aria-hidden />
                            Pinned
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm font-medium leading-snug text-stone-800">
                        {entry.target_feel}
                      </p>
                      <p className="mt-1 text-[10px] font-medium text-stone-400">
                        {formatFeelLogWhen(entry.logged_at)}
                        {entry.ball_flight_result ? ` · ${entry.ball_flight_result}` : ""}
                      </p>
                      {entry.coach_notes ? (
                        <p className="mt-1.5 rounded-lg bg-[#014421]/5 px-2 py-1.5 text-[11px] leading-snug text-[#014421]">
                          <span className="font-bold">Coach · </span>
                          {entry.coach_notes}
                        </p>
                      ) : null}
                      {isCoach ? (
                        <CoachNotesInline
                          initial={entry.coach_notes || ""}
                          busy={busy}
                          onSave={(notes) => void saveCoachNotes(entry, notes)}
                        />
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void togglePin(entry)}
                        className="rounded-lg p-1.5 text-stone-400 hover:bg-white hover:text-[#014421] disabled:opacity-50"
                        title={entry.is_pinned ? "Unpin" : "Pin"}
                        aria-label={entry.is_pinned ? "Unpin" : "Pin"}
                      >
                        {entry.is_pinned ? (
                          <PinOff className="h-4 w-4" aria-hidden />
                        ) : (
                          <Pin className="h-4 w-4" aria-hidden />
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void toggleGolden(entry)}
                        className={`rounded-lg p-1.5 hover:bg-white disabled:opacity-50 ${
                          entry.is_hitting_it_good
                            ? "text-amber-600"
                            : "text-stone-400 hover:text-amber-600"
                        }`}
                        title={
                          entry.is_hitting_it_good
                            ? "Remove golden anchor"
                            : "Mark as golden anchor"
                        }
                        aria-label="Toggle golden anchor"
                      >
                        <Sparkles className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void remove(entry)}
                        className="rounded-lg p-1.5 text-stone-400 hover:bg-white hover:text-red-600 disabled:opacity-50"
                        title="Delete"
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function CoachNotesInline({
  initial,
  busy,
  onSave,
}: {
  initial: string;
  busy: boolean;
  onSave: (notes: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(initial);

  useEffect(() => {
    setValue(initial);
  }, [initial]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1.5 text-[10px] font-bold text-[#014421] hover:underline"
      >
        {initial ? "Edit coach notes" : "Add coach notes"}
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-1.5">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={2}
        maxLength={1000}
        className={`${FIELD} text-xs`}
        disabled={busy}
        placeholder="Coach cue…"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            onSave(value);
            setOpen(false);
          }}
          className="rounded-lg bg-[#014421] px-2.5 py-1 text-[10px] font-bold text-white disabled:opacity-50"
        >
          Save notes
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setValue(initial);
            setOpen(false);
          }}
          className="rounded-lg px-2.5 py-1 text-[10px] font-semibold text-stone-500"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
