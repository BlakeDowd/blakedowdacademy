"use client";

import { useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { DRILL_SCORE_TYPE_LABELS, type DrillScoreType } from "@/lib/drillScoring";

const CATEGORIES = [
  "Driving",
  "Irons",
  "Wedges",
  "Chipping",
  "Bunkers",
  "Putting",
  "Mental/Strategy",
  "9-Hole Round",
  "18-Hole Round",
] as const;

const SCORE_TYPES = Object.keys(DRILL_SCORE_TYPE_LABELS) as DrillScoreType[];

const FIELD =
  "mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-[#014421]";

function slugCode(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 28);
  const stamp = Date.now().toString(36).slice(-4);
  return `COACH-${slug || "drill"}-${stamp}`.slice(0, 40);
}

type FormState = {
  name: string;
  category: (typeof CATEGORIES)[number];
  focus: string;
  description: string;
  goal: string;
  minutes: string;
  videoUrl: string;
  pdfUrl: string;
  scoreType: DrillScoreType | "";
};

const EMPTY: FormState = {
  name: "",
  category: "Putting",
  focus: "",
  description: "",
  goal: "",
  minutes: "10",
  videoUrl: "",
  pdfUrl: "",
  scoreType: "",
};

/** Coach-only form to insert a drill into the shared library (Supabase `drills`). */
export function CoachAddDrillForm({ onCreated }: { onCreated?: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const close = () => {
    setOpen(false);
    setError(null);
    setOk(null);
  };

  const save = async () => {
    const name = form.name.trim();
    if (!name) {
      setError("Give the drill a name.");
      return;
    }
    const minutes = Math.max(1, Math.min(180, Number(form.minutes) || 10));
    const goal = form.goal.trim();
    const code = slugCode(name);
    const id = crypto.randomUUID();

    const full: Record<string, unknown> = {
      id,
      drill_id: code,
      drill_name: name,
      title: name,
      description: form.description.trim(),
      category: form.category,
      focus: form.focus.trim() || null,
      video_url: form.videoUrl.trim() || null,
      pdf_url: form.pdfUrl.trim() || null,
      goal: goal || null,
      goal_reps: goal || null,
      estimated_minutes: minutes,
      xp_value: 10,
      score_type: form.scoreType || null,
      drill_levels: goal
        ? JSON.stringify([{ id: "goal-1", name: `Goal: ${goal}`, completed: false }])
        : null,
      created_at: new Date().toISOString(),
    };

    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const supabase = createClient();
      let lastMsg = "Couldn't save the drill.";
      const attempts: Record<string, unknown>[] = [
        full,
        omit(full, ["drill_name", "score_type", "goal_reps", "drill_levels", "pdf_url"]),
        omit(full, ["drill_name", "score_type", "goal_reps", "drill_levels", "pdf_url", "focus", "xp_value"]),
      ];
      let saved = false;
      for (const row of attempts) {
        const { error: err } = await supabase.from("drills").insert(row);
        if (!err) {
          saved = true;
          break;
        }
        lastMsg = err.message;
        if (!/column|schema cache|PGRST204/i.test(err.message)) break;
      }
      if (!saved) {
        setError(
          /row-level security|permission|is_coach/i.test(lastMsg)
            ? "Only coaches can add drills. Run the coach drills migration in Supabase if this keeps failing."
            : lastMsg,
        );
        return;
      }
      setForm(EMPTY);
      setOk(`“${name}” is in the library.`);
      window.dispatchEvent(new Event("drillLibraryRefresh"));
      onCreated?.();
      window.setTimeout(() => {
        setOpen(false);
        setOk(null);
      }, 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the drill.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full bg-[#014421] px-3 py-1.5 text-xs font-bold text-white"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        Add drill
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-[#014421]/20 bg-[#014421]/[0.04] p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-stone-900">Add drill to library</p>
          <p className="text-[11px] text-stone-500">Coach only · shows for every player straight away</p>
        </div>
        <button type="button" onClick={close} className="rounded-full p-1.5 text-stone-400 hover:bg-white" aria-label="Close">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="space-y-2.5">
        <label className="block text-xs font-semibold text-stone-700">
          Name
          <input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. 3–6 ft gate putting"
            className={FIELD}
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs font-semibold text-stone-700">
            Category
            <select
              value={form.category}
              onChange={(e) => set("category", e.target.value as FormState["category"])}
              className={FIELD}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold text-stone-700">
            Minutes
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={180}
              value={form.minutes}
              onChange={(e) => set("minutes", e.target.value)}
              className={FIELD}
            />
          </label>
        </div>
        <label className="block text-xs font-semibold text-stone-700">
          Focus
          <input
            value={form.focus}
            onChange={(e) => set("focus", e.target.value)}
            placeholder="e.g. Start line"
            className={FIELD}
          />
        </label>
        <label className="block text-xs font-semibold text-stone-700">
          Description / how to run it
          <textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            rows={3}
            placeholder="Short instructions for the player"
            className={`${FIELD} resize-y`}
          />
        </label>
        <label className="block text-xs font-semibold text-stone-700">
          Goal
          <input
            value={form.goal}
            onChange={(e) => set("goal", e.target.value)}
            placeholder="e.g. 8/10 makes"
            className={FIELD}
          />
        </label>
        <label className="block text-xs font-semibold text-stone-700">
          Score type
          <select
            value={form.scoreType}
            onChange={(e) => set("scoreType", e.target.value as FormState["scoreType"])}
            className={FIELD}
          >
            <option value="">Auto (guess from goal)</option>
            {SCORE_TYPES.map((t) => (
              <option key={t} value={t}>
                {DRILL_SCORE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-semibold text-stone-700">
          Video URL (YouTube or Bunny)
          <input
            value={form.videoUrl}
            onChange={(e) => set("videoUrl", e.target.value)}
            placeholder="https://"
            className={FIELD}
          />
        </label>
        <label className="block text-xs font-semibold text-stone-700">
          PDF URL (optional)
          <input
            value={form.pdfUrl}
            onChange={(e) => set("pdfUrl", e.target.value)}
            placeholder="https://"
            className={FIELD}
          />
        </label>
      </div>

      {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
      {ok && <p className="mt-2 text-xs font-semibold text-[#014421]">{ok}</p>}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={close}
          className="flex-1 rounded-xl bg-white py-2.5 text-sm font-bold text-stone-700 ring-1 ring-stone-200"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#014421] py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
          {saving ? "Saving…" : "Save to library"}
        </button>
      </div>
    </div>
  );
}

function omit(row: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (!keys.includes(k)) out[k] = v;
  }
  return out;
}
