"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Radio, Save } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  aggregateLiveRound,
  clearLiveRoundDraft,
  createLiveRoundDraft,
  loadLiveRoundDraft,
  saveLiveRoundDraft,
  saveLiveRoundHandoff,
  type LiveFirResult,
  type LiveHoleEntry,
  type LiveRoundDraft,
  type LiveRoundSetup,
} from "@/lib/liveRoundDraft";
import { LiveRoundInProgressBanner } from "@/components/LiveRoundInProgressBanner";
import {
  LIVE_ENTRY_ENABLED,
  LiveEntryTestingBanner,
} from "@/components/LiveEntryNotReadyModal";

function optionalNumberFromInput(value: string): number | null {
  const t = value.trim();
  if (t === "" || t === "." || t === "-") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function roundToOneDecimal(value: number | null): number | null {
  if (value === null) return null;
  return Math.round(value * 10) / 10;
}

export default function LiveRoundEntryPage() {
  return <LiveRoundEntryContent />;
}

function LiveRoundEntryContent() {
  const router = useRouter();
  const { user } = useAuth();
  const today = new Date().toISOString().split("T")[0];

  const [phase, setPhase] = useState<"setup" | "holes">("setup");
  const [draft, setDraft] = useState<LiveRoundDraft | null>(null);
  const [setup, setSetup] = useState<LiveRoundSetup>({
    date: today,
    course: "",
    handicap: null,
    holes: 18,
  });
  const [handicapText, setHandicapText] = useState("");
  const [strokesText, setStrokesText] = useState("");
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    const existing = loadLiveRoundDraft(user.id);
    if (existing) {
      setDraft(existing);
      setSetup(existing.setup);
      setHandicapText(
        existing.setup.handicap != null ? String(existing.setup.handicap) : "",
      );
      setPhase("holes");
      const hole = existing.holes.find((h) => h.hole === existing.currentHole);
      setStrokesText(hole?.strokes != null ? String(hole.strokes) : "");
    }
  }, [user?.id]);

  const currentHoleEntry = useMemo(() => {
    if (!draft) return null;
    return draft.holes.find((h) => h.hole === draft.currentHole) ?? null;
  }, [draft]);

  const aggregated = useMemo(
    () => (draft ? aggregateLiveRound(draft) : null),
    [draft],
  );

  const holesCompleted =
    draft?.holes.filter((h) => h.strokes != null && h.strokes > 0).length ?? 0;

  const persistDraft = (next: LiveRoundDraft) => {
    setDraft(next);
    if (user?.id) saveLiveRoundDraft(user.id, next);
  };

  const updateCurrentHole = (patch: Partial<LiveHoleEntry>) => {
    if (!draft) return;
    const nextHoles = draft.holes.map((h) =>
      h.hole === draft.currentHole ? { ...h, ...patch } : h,
    );
    persistDraft({ ...draft, holes: nextHoles });
  };

  const showSavedToast = (message: string) => {
    setSaveNotice(message);
    window.setTimeout(() => setSaveNotice(null), 2500);
  };

  const startOrResume = () => {
    if (!setup.course.trim()) {
      alert("Enter a course name to start live entry.");
      return;
    }
    const handicap = roundToOneDecimal(optionalNumberFromInput(handicapText));
    const setupWithHcp = { ...setup, course: setup.course.trim(), handicap };
    const next =
      draft && draft.setup.course === setupWithHcp.course
        ? { ...draft, setup: setupWithHcp }
        : createLiveRoundDraft(setupWithHcp);
    persistDraft(next);
    setPhase("holes");
    const hole = next.holes.find((h) => h.hole === next.currentHole);
    setStrokesText(hole?.strokes != null ? String(hole.strokes) : "");
  };

  const goToHole = (hole: number) => {
    if (!draft) return;
    const clamped = Math.min(draft.setup.holes, Math.max(1, hole));
    persistDraft({ ...draft, currentHole: clamped });
    const entry = draft.holes.find((h) => h.hole === clamped);
    setStrokesText(entry?.strokes != null ? String(entry.strokes) : "");
  };

  const saveProgress = () => {
    if (!draft || !user?.id) return;
    saveLiveRoundDraft(user.id, draft);
    showSavedToast("Progress saved — pick up anytime.");
  };

  const finishRound = () => {
    if (!draft || !user?.id) return;
    if (holesCompleted === 0) {
      alert("Log at least one hole before finishing.");
      return;
    }
    const totals = aggregateLiveRound(draft);
    saveLiveRoundHandoff(user.id, totals);
    clearLiveRoundDraft(user.id);
    router.push("/log-round?from=live");
  };

  const firButton = (value: LiveFirResult, label: string) => {
    const active = currentHoleEntry?.fir === value;
    return (
      <button
        type="button"
        onClick={() => updateCurrentHole({ fir: value })}
        className={`rounded-xl border-2 px-2 py-2.5 text-xs font-semibold transition-colors ${
          active
            ? "border-[#014421] bg-[#014421] text-white"
            : "border-gray-200 bg-white text-gray-700 hover:border-[#FFA500]"
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="flex min-h-full flex-col bg-[#014421]">
      <div
        className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-2 px-4 pb-4 pt-6"
        style={{ backgroundColor: "#014421" }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg p-2 text-white transition-colors hover:bg-white/10"
            aria-label="Go back"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Radio className="h-5 w-5 shrink-0 text-[#FFA500]" aria-hidden />
              <h1 className="truncate text-xl font-bold text-white sm:text-2xl">Live Entry</h1>
            </div>
            <p className="text-sm text-white/80">Save hole-by-hole while you play</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => router.push("/log-round")}
          className="shrink-0 rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/20"
        >
          Post-round
        </button>
      </div>

      {saveNotice && (
        <div className="mx-4 mb-2 rounded-xl bg-[#FFA500] px-4 py-2 text-center text-sm font-semibold text-black">
          {saveNotice}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-32">
        <div className="mx-auto max-w-md space-y-4">
          <LiveEntryTestingBanner />
          {LIVE_ENTRY_ENABLED && draft && (
            <LiveRoundInProgressBanner draft={draft} variant="live" />
          )}
          {phase === "setup" ? (
            <div className="rounded-2xl bg-white p-4 shadow-lg">
              <h2 className="mb-1 text-lg font-bold text-gray-900">Start your round</h2>
              <p className="mb-4 text-sm text-gray-600">
                Enter course details now. You&apos;ll log each hole as you play — no need to remember
                everything at the end.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Course *</label>
                  <input
                    type="text"
                    value={setup.course}
                    onChange={(e) => setSetup((s) => ({ ...s, course: e.target.value }))}
                    placeholder="Course name"
                    className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-gray-900 focus:border-[#FFA500] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Date</label>
                  <input
                    type="date"
                    value={setup.date}
                    onChange={(e) => setSetup((s) => ({ ...s, date: e.target.value }))}
                    className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-gray-900 focus:border-[#FFA500] focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Handicap</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={handicapText}
                      onChange={(e) => setHandicapText(e.target.value)}
                      placeholder="0.0"
                      className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-gray-900 focus:border-[#FFA500] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Holes</label>
                    <select
                      value={setup.holes}
                      onChange={(e) =>
                        setSetup((s) => ({
                          ...s,
                          holes: Number(e.target.value) === 9 ? 9 : 18,
                        }))
                      }
                      className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-gray-900 focus:border-[#FFA500] focus:outline-none"
                    >
                      <option value={9}>9 Holes</option>
                      <option value={18}>18 Holes</option>
                    </select>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={startOrResume}
                className="mt-5 w-full rounded-xl bg-[#FFA500] py-3.5 font-semibold text-black shadow-md transition hover:bg-amber-500"
              >
                {draft ? "Continue live round" : "Start live entry"}
              </button>
            </div>
          ) : (
            draft &&
            currentHoleEntry && (
              <>
                <div className="rounded-2xl bg-white/10 px-4 py-3 text-white">
                  <p className="truncate text-sm font-semibold">{draft.setup.course}</p>
                  <p className="text-xs text-white/75">
                    {holesCompleted} of {draft.setup.holes} holes logged
                    {aggregated?.score != null ? ` · Gross ${aggregated.score}` : ""}
                  </p>
                </div>

                <div className="rounded-2xl bg-white p-4 shadow-lg">
                  <div className="mb-4 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => goToHole(draft.currentHole - 1)}
                      disabled={draft.currentHole <= 1}
                      className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-gray-200 disabled:opacity-40"
                      aria-label="Previous hole"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <div className="text-center">
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        Hole
                      </p>
                      <p className="text-3xl font-bold tabular-nums text-gray-900">
                        {draft.currentHole}
                        <span className="text-lg text-gray-400"> / {draft.setup.holes}</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => goToHole(draft.currentHole + 1)}
                      disabled={draft.currentHole >= draft.setup.holes}
                      className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-gray-200 disabled:opacity-40"
                      aria-label="Next hole"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="mb-4">
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Strokes this hole *
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={strokesText}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setStrokesText(raw);
                        const n = optionalNumberFromInput(raw);
                        updateCurrentHole({ strokes: n });
                      }}
                      placeholder="e.g. 5"
                      className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-center text-2xl font-bold text-gray-900 focus:border-[#FFA500] focus:outline-none"
                    />
                  </div>

                  <div className="mb-4">
                    <label className="mb-2 block text-sm font-medium text-gray-700">Putts</label>
                    <div className="flex items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          updateCurrentHole({
                            putts: Math.max(0, currentHoleEntry.putts - 1),
                          })
                        }
                        className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-gray-200 text-lg font-bold"
                      >
                        −
                      </button>
                      <span className="min-w-[2rem] text-center text-2xl font-bold tabular-nums">
                        {currentHoleEntry.putts}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          updateCurrentHole({ putts: currentHoleEntry.putts + 1 })
                        }
                        className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-gray-200 text-lg font-bold"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className="mb-2 block text-sm font-medium text-gray-700">Fairway</label>
                    <div className="grid grid-cols-4 gap-2">
                      {firButton("left", "Left")}
                      {firButton("hit", "Hit")}
                      {firButton("right", "Right")}
                      {firButton("na", "N/A")}
                    </div>
                  </div>

                  <div className="mb-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => updateCurrentHole({ gir: true })}
                      className={`rounded-xl border-2 py-3 text-sm font-semibold ${
                        currentHoleEntry.gir === true
                          ? "border-[#014421] bg-[#014421] text-white"
                          : "border-gray-200 bg-white text-gray-700"
                      }`}
                    >
                      GIR
                    </button>
                    <button
                      type="button"
                      onClick={() => updateCurrentHole({ gir: false })}
                      className={`rounded-xl border-2 py-3 text-sm font-semibold ${
                        currentHoleEntry.gir === false
                          ? "border-[#014421] bg-[#014421] text-white"
                          : "border-gray-200 bg-white text-gray-700"
                      }`}
                    >
                      Missed GIR
                    </button>
                  </div>

                  <div className="mb-2">
                    <label className="mb-2 block text-sm font-medium text-gray-700">Penalties</label>
                    <div className="flex items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          updateCurrentHole({
                            penalties: Math.max(0, currentHoleEntry.penalties - 1),
                          })
                        }
                        className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-gray-200 text-lg font-bold"
                      >
                        −
                      </button>
                      <span className="min-w-[2rem] text-center text-2xl font-bold tabular-nums">
                        {currentHoleEntry.penalties}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          updateCurrentHole({
                            penalties: currentHoleEntry.penalties + 1,
                          })
                        }
                        className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-gray-200 text-lg font-bold"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={saveProgress}
                    className="flex items-center justify-center gap-2 rounded-xl border-2 border-white/40 bg-white/10 py-3.5 text-sm font-semibold text-white hover:bg-white/20"
                  >
                    <Save className="h-4 w-4" aria-hidden />
                    Save progress
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      saveProgress();
                      if (draft.currentHole < draft.setup.holes) {
                        goToHole(draft.currentHole + 1);
                      }
                    }}
                    className="rounded-xl bg-white py-3.5 text-sm font-semibold text-[#014421] shadow-md hover:bg-gray-50"
                  >
                    {draft.currentHole < draft.setup.holes ? "Next hole" : "Last hole"}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={finishRound}
                  className="w-full rounded-xl bg-[#FFA500] py-4 font-semibold text-black shadow-lg hover:bg-amber-500"
                >
                  Finish round → review &amp; save
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (
                      confirm(
                        "Discard this live round draft? Saved hole data on this device will be cleared.",
                      )
                    ) {
                      if (user?.id) clearLiveRoundDraft(user.id);
                      setDraft(null);
                      setPhase("setup");
                    }
                  }}
                  className="w-full py-2 text-center text-sm text-white/70 hover:text-white"
                >
                  Discard live draft
                </button>
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}
