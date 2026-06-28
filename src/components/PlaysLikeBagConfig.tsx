"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, Plus, Settings2, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { resolveAuthUserId } from "@/lib/resolveAuthUserId";
import {
  addableClubTemplatesForBag,
  carryUnitLabel,
  clubFromTemplate,
  createEmptyClub,
  createPresetBagFormState,
  deleteUserClub,
  deriveShortLabel,
  displayToMetres,
  fetchUserClubs,
  loadDistanceUnitPreference,
  metresToDisplay,
  saveDistanceUnitPreference,
  upsertUserClubs,
  validateBagForSave,
  type DistanceUnit,
  type PlaysLikeClubFormState,
} from "@/lib/playsLikeBag";

function parseInputNumber(value: string): number | null {
  const t = value.trim();
  if (t === "" || t === "." || t === "-") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

type NumericFieldProps = {
  id: string;
  label: string;
  unit: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  step?: number;
};

function NumericField({
  id,
  label,
  unit,
  value,
  onChange,
  min = 0,
  step = 1,
}: NumericFieldProps) {
  return (
    <div className="min-w-0 flex-1">
      <label
        htmlFor={id}
        className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-gray-500"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          step={step}
          value={value ?? ""}
          onChange={(e) => onChange(parseInputNumber(e.target.value))}
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 pr-12 text-sm font-semibold tabular-nums text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-[#014421]/40 focus:ring-2 focus:ring-[#014421]/15"
          placeholder="—"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-wide text-gray-400">
          {unit}
        </span>
      </div>
    </div>
  );
}

function UnitToggle({
  unit,
  onChange,
}: {
  unit: DistanceUnit;
  onChange: (unit: DistanceUnit) => void;
}) {
  return (
    <div className="flex rounded-xl border border-gray-200 bg-gray-50 p-1">
      {(["metres", "yards"] as const).map((option) => {
        const active = unit === option;
        const label = option === "metres" ? "Metres" : "Yards";
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`flex-1 rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wide transition ${
              active
                ? "bg-[#014421] text-white shadow-sm"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

type MyDigitalBagProps = {
  onSaveSuccess?: () => void;
  onLoadComplete?: () => void;
  onClubsChange?: (clubs: PlaysLikeClubFormState[]) => void;
};

export function MyDigitalBag({ onSaveSuccess, onLoadComplete, onClubsChange }: MyDigitalBagProps) {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const expandAdvancedOnLoad = searchParams.get("advanced") === "1";

  const [clubs, setClubs] = useState<PlaysLikeClubFormState[]>([]);
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>("metres");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const addableTemplates = useMemo(() => addableClubTemplatesForBag(clubs), [clubs]);

  useEffect(() => {
    setDistanceUnit(loadDistanceUnitPreference());
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!user?.id) {
        if (!cancelled) {
          setLoading(false);
          onLoadComplete?.();
        }
        return;
      }
      setLoading(true);
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const uid = await resolveAuthUserId(supabase);
        if (!uid || cancelled) return;
        const rows = await fetchUserClubs(supabase, uid, {
          expandAdvanced: expandAdvancedOnLoad,
        });
        if (cancelled) return;
        setClubs(rows);
      } catch (err) {
        console.warn("[PlaysLikeBag] load failed:", err);
      } finally {
        if (!cancelled) {
          setLoading(false);
          onLoadComplete?.();
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user?.id, expandAdvancedOnLoad, onLoadComplete]);

  useEffect(() => {
    if (loading) return;
    onClubsChange?.(clubs);
  }, [clubs, loading, onClubsChange]);

  const clearSaveFeedback = useCallback(() => {
    setSaveMessage(null);
    setSaveError(null);
  }, []);

  const handleUnitChange = useCallback(
    (unit: DistanceUnit) => {
      setDistanceUnit(unit);
      saveDistanceUnitPreference(unit);
      clearSaveFeedback();
    },
    [clearSaveFeedback],
  );

  const updateClub = useCallback(
    (id: string, patch: Partial<PlaysLikeClubFormState>) => {
      setClubs((prev) =>
        prev.map((c) => {
          if (c.id !== id) return c;
          const next = { ...c, ...patch };
          if (patch.label != null && patch.shortLabel === undefined) {
            next.shortLabel = deriveShortLabel(patch.label);
          }
          return next;
        }),
      );
      clearSaveFeedback();
    },
    [clearSaveFeedback],
  );

  const updateCarryDisplay = useCallback(
    (id: string, displayValue: number | null) => {
      updateClub(id, { baseCarryMetres: displayToMetres(displayValue, distanceUnit) });
    },
    [distanceUnit, updateClub],
  );

  const toggleAdvanced = useCallback((id: string) => {
    setClubs((prev) =>
      prev.map((c) => (c.id === id ? { ...c, advancedExpanded: !c.advancedExpanded } : c)),
    );
  }, []);

  const removeClub = useCallback(
    async (club: PlaysLikeClubFormState) => {
      clearSaveFeedback();
      setClubs((prev) => prev.filter((c) => c.id !== club.id));

      if (!club.isPersisted) return;

      setDeletingId(club.id);
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const result = await deleteUserClub(supabase, club.id);
        if (!result.ok) {
          setSaveError(result.error);
          setClubs((prev) => {
            if (prev.some((c) => c.id === club.id)) return prev;
            return [...prev, club];
          });
        }
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "Failed to delete club.");
        setClubs((prev) => {
          if (prev.some((c) => c.id === club.id)) return prev;
          return [...prev, club];
        });
      } finally {
        setDeletingId(null);
      }
    },
    [clearSaveFeedback],
  );

  const addCustomClub = useCallback(() => {
    setClubs((prev) => [...prev, createEmptyClub({ label: "" })]);
    setPickerOpen(false);
    clearSaveFeedback();
  }, [clearSaveFeedback]);

  const addTemplateClub = useCallback(
    (templateKey: string) => {
      const template = addableTemplates.find((t) => t.templateKey === templateKey);
      if (!template) return;
      setClubs((prev) => [...prev, clubFromTemplate(template)]);
      setPickerOpen(false);
      clearSaveFeedback();
    },
    [addableTemplates, clearSaveFeedback],
  );

  const restoreStandardBag = useCallback(() => {
    setClubs(createPresetBagFormState({ expandAdvanced: expandAdvancedOnLoad }));
    clearSaveFeedback();
  }, [clearSaveFeedback, expandAdvancedOnLoad]);

  const handleSave = async () => {
    setSaveMessage(null);
    setSaveError(null);

    const validationError = validateBagForSave(clubs);
    if (validationError) {
      setSaveError(validationError);
      return;
    }

    if (!user?.id) {
      setSaveError("Sign in to save your bag profile.");
      return;
    }

    setSaving(true);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const uid = await resolveAuthUserId(supabase);
      if (!uid) {
        setSaveError("Sign in to save your bag profile.");
        return;
      }

      const result = await upsertUserClubs(supabase, uid, clubs);

      if (result.ok) {
        setClubs(result.clubs);
        setSaveMessage("Bag profile saved to your account.");
        onSaveSuccess?.();
      } else {
        setSaveError(result.error);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save bag profile.");
    } finally {
      setSaving(false);
    }
  };

  const carryUnit = carryUnitLabel(distanceUnit);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#014421]" aria-hidden />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col">
      <div className="space-y-4">
        <div className="space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#014421]/80">
            Bag profile
          </p>
          <h2 className="text-xl font-bold tracking-tight text-stone-900">Your carry numbers</h2>
          <p className="text-sm leading-relaxed text-stone-600">
            A standard 12-club bag is pre-filled for new players — enter carry distances, remove
            what you don&apos;t use, or add more clubs below.
          </p>
        </div>

        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">
            Distance unit
          </p>
          <UnitToggle unit={distanceUnit} onChange={handleUnitChange} />
        </div>
      </div>

      {clubs.length === 0 ? (
        <div className="mt-6 space-y-3 rounded-2xl border border-dashed border-gray-300 bg-white px-4 py-8 text-center shadow-sm">
          <p className="text-sm text-stone-600">Your bag is empty.</p>
          <button
            type="button"
            onClick={restoreStandardBag}
            className="inline-flex items-center justify-center rounded-xl bg-[#014421] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#013318]"
          >
            Load standard 12-club bag
          </button>
        </div>
      ) : (
        <ul className="mt-6 space-y-2">
          {clubs.map((club) => {
            const advancedActive =
              club.advancedExpanded ||
              club.peakHeightMetres != null ||
              club.launchAngleDeg != null ||
              club.spinRateRpm != null;
            const carryDisplay = metresToDisplay(club.baseCarryMetres, distanceUnit);

            return (
              <li
                key={club.id}
                className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
              >
                <div className="flex flex-col gap-3 p-4">
                  <div className="flex items-start gap-2">
                    <span className="mt-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#014421]/10 text-[10px] font-bold text-[#014421]">
                      {club.shortLabel || "—"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <label
                        htmlFor={`${club.id}-name`}
                        className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-500"
                      >
                        Club name
                      </label>
                      <input
                        id={`${club.id}-name`}
                        type="text"
                        value={club.label}
                        onChange={(e) => updateClub(club.id, { label: e.target.value })}
                        placeholder="e.g. 7-Iron"
                        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900 outline-none placeholder:text-gray-400 focus:border-[#014421]/40 focus:ring-2 focus:ring-[#014421]/15"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeClub(club)}
                      disabled={deletingId === club.id}
                      aria-label={`Remove ${club.label || "club"}`}
                      className="mt-6 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    >
                      {deletingId === club.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <Trash2 className="h-4 w-4" aria-hidden />
                      )}
                    </button>
                  </div>

                  <div className="flex items-end gap-2 sm:gap-3">
                    <NumericField
                      id={`${club.id}-carry`}
                      label={`Base carry (${carryUnit})`}
                      unit={carryUnit}
                      value={carryDisplay}
                      onChange={(v) => updateCarryDisplay(club.id, v)}
                      min={distanceUnit === "metres" ? 1 : 1}
                      step={distanceUnit === "metres" ? 0.5 : 1}
                    />

                    <button
                      type="button"
                      onClick={() => toggleAdvanced(club.id)}
                      aria-expanded={club.advancedExpanded}
                      aria-label={`${club.advancedExpanded ? "Hide" : "Show"} advanced tracking for ${club.label || "club"}`}
                      title="Advanced tracking"
                      className={`mb-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-all ${
                        club.advancedExpanded
                          ? "border-[#014421]/40 bg-[#014421]/10 text-[#014421]"
                          : advancedActive
                            ? "border-amber-300 bg-amber-50 text-amber-700"
                            : "border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300 hover:text-gray-700"
                      }`}
                    >
                      <Settings2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </div>

                <AnimatePresence initial={false}>
                  {club.advancedExpanded ? (
                    <motion.div
                      key={`${club.id}-advanced`}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-gray-100 bg-stone-50 px-4 py-4">
                        <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                          Advanced tracking · optional
                        </p>
                        <div className="flex flex-col gap-3 sm:flex-row sm:gap-3">
                          <NumericField
                            id={`${club.id}-peak`}
                            label="Peak height (apex)"
                            unit="m"
                            value={club.peakHeightMetres}
                            onChange={(v) => updateClub(club.id, { peakHeightMetres: v })}
                            step={0.1}
                          />
                          <NumericField
                            id={`${club.id}-launch`}
                            label="Launch angle"
                            unit="deg"
                            value={club.launchAngleDeg}
                            onChange={(v) => updateClub(club.id, { launchAngleDeg: v })}
                            step={0.1}
                          />
                          <NumericField
                            id={`${club.id}-spin`}
                            label="Spin rate"
                            unit="rpm"
                            value={club.spinRateRpm}
                            onChange={(v) => updateClub(club.id, { spinRateRpm: v })}
                            step={100}
                          />
                        </div>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={addCustomClub}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-300 bg-white py-3.5 text-sm font-semibold text-stone-700 transition hover:border-[#014421]/40 hover:bg-[#014421]/5 hover:text-[#014421]"
        >
          <Plus className="h-4 w-4 shrink-0" aria-hidden />
          Add Custom Club
        </button>
        {addableTemplates.length > 0 ? (
          <div className="relative flex-1">
            <button
              type="button"
              onClick={() => setPickerOpen((o) => !o)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white py-3.5 text-sm font-semibold text-stone-700 transition hover:border-gray-300 hover:bg-gray-50"
            >
              <Plus className="h-4 w-4 shrink-0" aria-hidden />
              Add common club
            </button>
            {pickerOpen ? (
              <ul className="absolute bottom-full left-0 z-20 mb-2 max-h-52 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                {addableTemplates.map((t) => (
                  <li key={t.templateKey}>
                    <button
                      type="button"
                      onClick={() => addTemplateClub(t.templateKey)}
                      className="w-full px-3 py-2.5 text-left text-sm text-stone-700 hover:bg-gray-50"
                    >
                      {t.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      <footer className="mt-8 border-t border-gray-200 pt-6">
        {saveError ? (
          <p className="mb-3 text-center text-sm font-medium text-red-600" role="alert">
            {saveError}
          </p>
        ) : null}
        {saveMessage ? (
          <p className="mb-3 flex items-center justify-center gap-1.5 text-center text-sm font-medium text-[#014421]">
            <Check className="h-4 w-4 shrink-0" aria-hidden />
            {saveMessage}
          </p>
        ) : null}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FFA500] px-5 py-3.5 text-sm font-bold text-white shadow-md transition hover:bg-[#e68900] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Saving…
            </>
          ) : (
            "Save Bag Profile"
          )}
        </button>
        <p className="mt-2 text-center text-[10px] text-gray-500">
          Saved to your account · carry stored in metres for Plays Like algorithms
        </p>
      </footer>
    </div>
  );
}
