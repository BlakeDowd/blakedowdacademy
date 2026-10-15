"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Dices, Loader2, PartyPopper, Plus, Trash2, Trophy } from "lucide-react";
import ProfileAvatar from "@/components/ProfileAvatar";
import { loadPeople, type CommunityPerson } from "@/lib/community";
import {
  CHALLENGE_METRICS,
  challengeMetric,
  challengeState,
  createChallenge,
  deleteChallenge,
  drawChallengeWinner,
  fetchChallengeBoard,
  fetchMyEntry,
  formatChallengeValue,
  submitChallengeEntry,
  sydneyToday,
  type BoardRow,
  type Challenge,
  type ChallengeEntry,
  type ChallengeMetric,
} from "@/lib/communityChallenges";

const INPUT =
  "mt-1 block w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 focus:border-[#014421] focus:bg-white focus:outline-none";

const niceDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function NewChallengeForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const today = sydneyToday();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [metric, setMetric] = useState<ChallengeMetric>("practice_hours");
  const [unit, setUnit] = useState("");
  const [lowerIsBetter, setLowerIsBetter] = useState(false);
  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState(addDays(today, 6));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!title.trim()) return setError("Give the challenge a name.");
    if (endsOn < startsOn) return setError("The end date is before the start date.");
    setSaving(true);
    setError(null);
    const err = await createChallenge({ title, description, mode, metric, unit, lowerIsBetter, startsOn, endsOn });
    setSaving(false);
    if (err) setError(err);
    else onCreated();
  };

  return (
    <section className="space-y-3 rounded-2xl border border-[#014421]/30 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-bold text-stone-900">New challenge</h3>
      <label className="block text-xs font-medium text-stone-500">
        Name
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="e.g. Practice Week Blitz" className={INPUT} />
      </label>
      <label className="block text-xs font-medium text-stone-500">
        What to do (optional)
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={600}
          rows={2}
          placeholder="Rules, prizes, anything players should know"
          className={`${INPUT} resize-none`}
        />
      </label>

      <div>
        <p className="text-xs font-medium text-stone-500">How it&apos;s scored</p>
        <div className="mt-1 grid grid-cols-2 gap-1.5">
          {(
            [
              ["auto", "Automatically", "From practice, rounds, drills, combines and lessons logged in the app"],
              ["manual", "Players submit", "Players enter a score or tick it off; you confirm each one"],
            ] as const
          ).map(([id, label, hint]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              aria-pressed={mode === id}
              className={`rounded-xl border px-3 py-2 text-left ${
                mode === id ? "border-[#014421] bg-[#014421]/[0.05] ring-1 ring-[#014421]" : "border-stone-200"
              }`}
            >
              <span className="block text-sm font-semibold text-stone-900">{label}</span>
              <span className="block text-[11px] leading-snug text-stone-500">{hint}</span>
            </button>
          ))}
        </div>
      </div>

      {mode === "auto" ? (
        <label className="block text-xs font-medium text-stone-500">
          Leaderboard
          <select value={metric} onChange={(e) => setMetric(e.target.value as ChallengeMetric)} className={INPUT}>
            {CHALLENGE_METRICS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs font-medium text-stone-500">
            Score unit (optional)
            <input value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={30} placeholder="e.g. putts holed" className={INPUT} />
          </label>
          <label className="block text-xs font-medium text-stone-500">
            Best score is
            <select
              value={lowerIsBetter ? "low" : "high"}
              onChange={(e) => setLowerIsBetter(e.target.value === "low")}
              className={INPUT}
            >
              <option value="high">Highest</option>
              <option value="low">Lowest</option>
            </select>
          </label>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs font-medium text-stone-500">
          Starts
          <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className={INPUT} />
        </label>
        <label className="block text-xs font-medium text-stone-500">
          Ends
          <input type="date" value={endsOn} min={startsOn} onChange={(e) => setEndsOn(e.target.value)} className={INPUT} />
        </label>
      </div>

      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-stone-200 py-2.5 text-sm font-semibold text-stone-600">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#014421] py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Start challenge
        </button>
      </div>
      <p className="text-[11px] text-stone-400">Everyone sees it in the feed straight away.</p>
    </section>
  );
}

function EntryForm({ challenge, me }: { challenge: Challenge; me: string }) {
  const [entry, setEntry] = useState<ChallengeEntry | null | undefined>(undefined);
  const [score, setScore] = useState("");
  const [done, setDone] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchMyEntry(challenge.id, me).then((e) => {
      if (cancelled) return;
      setEntry(e);
      if (e) {
        setScore(e.score?.toString() ?? "");
        setDone(e.done);
        setNote(e.note);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [challenge.id, me]);

  const save = async () => {
    const value = score.trim() ? Number(score) : null;
    if (value != null && !Number.isFinite(value)) return setError("Enter a number for your score.");
    if (value == null && !done) return setError("Enter a score or tick that you've done it.");
    setSaving(true);
    setError(null);
    const { entry: saved, error: err } = await submitChallengeEntry(challenge.id, me, { score: value, done, note });
    setSaving(false);
    if (err) setError(err);
    else setEntry(saved);
  };

  if (entry === undefined) return null;
  return (
    <div className="mt-3 space-y-2 rounded-xl bg-stone-50 p-3">
      <p className="text-xs font-bold text-stone-700">Your entry</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-[11px] font-medium text-stone-500">
          Score{challenge.unit ? ` (${challenge.unit})` : ""}
          <input inputMode="decimal" value={score} onChange={(e) => setScore(e.target.value)} placeholder="e.g. 42" className={INPUT} />
        </label>
        <label className="mt-5 flex items-center gap-2 text-sm font-medium text-stone-700">
          <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} className="h-4 w-4 accent-[#014421]" />
          I&apos;ve done it
        </label>
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} placeholder="Note for your coach (optional)" className={INPUT} />
      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-stone-500">
          {entry?.status === "approved"
            ? "Confirmed by your coach"
            : entry?.status === "pending"
              ? "Waiting for your coach to confirm"
              : entry?.status === "rejected"
                ? "Not accepted. Check with your coach."
                : "Your coach confirms entries before they count."}
        </span>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="shrink-0 rounded-xl bg-[#014421] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {entry ? "Update" : "Submit"}
        </button>
      </div>
    </div>
  );
}

function ChallengeCard({
  challenge,
  me,
  isCoach,
  defaultOpen,
  onDeleted,
  onResultsPosted,
}: {
  challenge: Challenge;
  me: string;
  isCoach: boolean;
  defaultOpen: boolean;
  onDeleted: () => void;
  onResultsPosted: () => void;
}) {
  const state = challengeState(challenge);
  const [open, setOpen] = useState(defaultOpen);
  const [board, setBoard] = useState<BoardRow[] | null>(null);
  const [people, setPeople] = useState<Map<string, CommunityPerson>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const metric = challengeMetric(challenge.metric);

  const wantBoard = open && board === null;
  useEffect(() => {
    if (!wantBoard) return;
    let cancelled = false;
    void fetchChallengeBoard(challenge).then(async ({ rows, error: err }) => {
      const ids = rows.map((r) => r.userId);
      if (challenge.winnerId) ids.push(challenge.winnerId);
      const names = await loadPeople(ids);
      if (cancelled) return;
      setError(err);
      setBoard(rows);
      setPeople(names);
    });
    return () => {
      cancelled = true;
    };
  }, [wantBoard, challenge]);

  const myIndex = board?.findIndex((r) => r.userId === me) ?? -1;
  const shown = board ? board.slice(0, 10) : [];

  const draw = async () => {
    if (!board || board.length === 0) return;
    const n = board.length;
    if (!window.confirm(`Draw a random winner from ${n} player${n === 1 ? "" : "s"}? This can only be done once.`)) return;
    setBusy(true);
    const { error: err } = await drawChallengeWinner(challenge, board);
    setBusy(false);
    if (err) setError(err);
    else onResultsPosted();
  };

  const winner = challenge.winnerId ? people.get(challenge.winnerId) : undefined;

  const remove = async () => {
    if (!window.confirm(`Delete "${challenge.title}" and its feed posts?`)) return;
    const err = await deleteChallenge(challenge.id);
    if (err) setError(err);
    else onDeleted();
  };

  return (
    <article className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-start gap-3 p-4 text-left">
        <span
          className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            state === "live" ? "bg-[#014421] text-[#FFC966]" : "bg-stone-100 text-stone-400"
          }`}
        >
          <Trophy className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-[15px] font-bold text-stone-900">{challenge.title}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                state === "live"
                  ? "bg-emerald-100 text-emerald-800"
                  : state === "upcoming"
                    ? "bg-sky-100 text-sky-800"
                    : "bg-stone-100 text-stone-500"
              }`}
            >
              {state === "live" ? "Live" : state === "upcoming" ? "Starts soon" : "Finished"}
            </span>
          </span>
          <span className="block text-xs text-stone-500">
            {niceDate(challenge.startsOn)} – {niceDate(challenge.endsOn)} ·{" "}
            {metric ? metric.label : challenge.lowerIsBetter ? "Lowest score wins" : "Highest score wins"}
          </span>
        </span>
        <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-stone-400 transition ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>

      {open && (
        <div className="border-t border-stone-100 px-4 pb-4 pt-3">
          {challenge.description && <p className="mb-3 whitespace-pre-wrap text-sm text-stone-700">{challenge.description}</p>}

          {challenge.winnerId ? (
            <div className="mb-3 flex items-center gap-3 rounded-xl bg-[#014421] px-3 py-2.5 text-white">
              <PartyPopper className="h-5 w-5 shrink-0 text-[#FFC966]" aria-hidden />
              <ProfileAvatar picture={winner?.picture} name={winner?.name} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold uppercase tracking-wide text-[#FFC966]">Winner</span>
                <span className="block truncate text-sm font-bold">
                  {challenge.winnerId === me ? "You!" : (winner?.name ?? "Golfer")}
                </span>
              </span>
              {challenge.entrantCount != null && (
                <span className="shrink-0 text-[11px] text-white/70">
                  Drawn from {challenge.entrantCount} player{challenge.entrantCount === 1 ? "" : "s"}
                </span>
              )}
            </div>
          ) : (
            state !== "finished" && (
              <p className="mb-3 flex items-center gap-1.5 rounded-xl bg-[#FFA500]/10 px-3 py-2 text-xs font-medium text-orange-800">
                <Dices className="h-4 w-4 shrink-0" aria-hidden />
                The winner is drawn at random from everyone who takes part. Get on the board to be in it!
              </p>
            )
          )}

          {board === null ? (
            <p className="py-3 text-center text-xs text-stone-400">Loading leaderboard…</p>
          ) : board.length === 0 ? (
            <p className="rounded-xl bg-stone-50 py-4 text-center text-xs text-stone-500">
              {state === "upcoming" ? "Leaderboard opens when the challenge starts." : "No scores yet. Be the first!"}
            </p>
          ) : (
            <ol className="divide-y divide-stone-100">
              {shown.map((r, i) => {
                const who = people.get(r.userId);
                const isMe = r.userId === me;
                return (
                  <li key={r.userId} className={`flex items-center gap-3 py-2 ${isMe ? "-mx-2 rounded-lg bg-[#FFA500]/10 px-2" : ""}`}>
                    <span className="w-6 text-center text-sm font-bold tabular-nums text-stone-500">
                      {i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}
                    </span>
                    <ProfileAvatar picture={who?.picture} name={who?.name} size={28} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-800">
                      {isMe ? "You" : (who?.name ?? "Golfer")}
                    </span>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-[#014421]">
                      {formatChallengeValue(challenge, r.value, r.done)}
                    </span>
                  </li>
                );
              })}
              {myIndex >= 10 && board[myIndex] && (
                <li className="flex items-center gap-3 py-2">
                  <span className="w-6 text-center text-sm font-bold tabular-nums text-stone-500">{myIndex + 1}</span>
                  <span className="min-w-0 flex-1 text-sm font-semibold text-stone-800">You</span>
                  <span className="text-sm font-bold tabular-nums text-[#014421]">
                    {formatChallengeValue(challenge, board[myIndex].value, board[myIndex].done)}
                  </span>
                </li>
              )}
            </ol>
          )}

          {challenge.mode === "auto" && state !== "finished" && (
            <p className="mt-2 text-[11px] text-stone-400">Updates automatically from what you log in the app.</p>
          )}
          {challenge.mode === "manual" && state === "live" && !isCoach && <EntryForm challenge={challenge} me={me} />}

          {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}

          {isCoach && (
            <div className="mt-3 flex gap-2 border-t border-stone-100 pt-3">
              {challenge.winnerId ? (
                <p className="flex flex-1 items-center text-xs text-stone-500">Winner drawn and posted to the feed.</p>
              ) : state === "finished" ? (
                <button
                  type="button"
                  onClick={() => void draw()}
                  disabled={busy || !board || board.length === 0}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#FFA500] py-2 text-sm font-semibold text-white disabled:opacity-40"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Dices className="h-4 w-4" aria-hidden />}
                  Draw winner
                </button>
              ) : (
                <p className="flex flex-1 items-center text-xs text-stone-500">
                  You can draw a winner after it ends on {niceDate(challenge.endsOn)}.
                </p>
              )}
              <button
                type="button"
                onClick={() => void remove()}
                className="rounded-xl border border-stone-200 px-3 text-stone-400 hover:text-red-500"
                aria-label="Delete challenge"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export function CommunityChallengesView({
  me,
  isCoach,
  challenges,
  error,
  onReload,
}: {
  me: string;
  isCoach: boolean;
  challenges: Challenge[] | null;
  error: string | null;
  onReload: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const today = sydneyToday();
  const live = (challenges ?? []).filter((c) => challengeState(c, today) !== "finished");
  const finished = (challenges ?? []).filter((c) => challengeState(c, today) === "finished");

  return (
    <div className="space-y-3">
      {isCoach &&
        (creating ? (
          <NewChallengeForm
            onCancel={() => setCreating(false)}
            onCreated={() => {
              setCreating(false);
              onReload();
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#014421]/30 bg-white py-3 text-sm font-bold text-[#014421]"
          >
            <Plus className="h-4 w-4" aria-hidden />
            New challenge
          </button>
        ))}

      {error ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{error}</p>
      ) : challenges === null ? (
        <div className="h-24 animate-pulse rounded-2xl border border-stone-200 bg-white" aria-hidden />
      ) : challenges.length === 0 ? (
        <div className="rounded-2xl border border-stone-200 bg-white py-10 text-center">
          <Trophy className="mx-auto h-8 w-8 text-stone-300" aria-hidden />
          <p className="mt-2 text-sm font-semibold text-stone-700">No challenges yet</p>
          <p className="text-xs text-stone-500">{isCoach ? "Start one above." : "Your coaches will post challenges here."}</p>
        </div>
      ) : (
        <>
          {live.map((c, i) => (
            <ChallengeCard
              key={c.id}
              challenge={c}
              me={me}
              isCoach={isCoach}
              defaultOpen={i === 0}
              onDeleted={onReload}
              onResultsPosted={onReload}
            />
          ))}
          {finished.length > 0 && (
            <>
              <h3 className="px-1 pt-2 text-xs font-bold uppercase tracking-wide text-stone-400">Finished</h3>
              {finished.map((c) => (
                <ChallengeCard
                  key={c.id}
                  challenge={c}
                  me={me}
                  isCoach={isCoach}
                  defaultOpen={false}
                  onDeleted={onReload}
                  onResultsPosted={onReload}
                />
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
