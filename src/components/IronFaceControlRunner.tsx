"use client";

import { useCallback, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ironFaceControlConfig } from "@/lib/ironFaceControlConfig";
import { formatSupabaseWriteError } from "@/lib/formatSupabaseWriteError";

export type IronFaceShot = {
  gate: boolean;
  curve: boolean;
  solid: boolean;
};

export type IronFaceControlMetadata = {
  version: 1;
  shots: IronFaceShot[];
  total_out_of_100: number;
};

function emptyShots(): IronFaceShot[] {
  return Array.from({ length: ironFaceControlConfig.shotCount }, () => ({
    gate: false,
    curve: false,
    solid: false,
  }));
}

function shotPoints(s: IronFaceShot): number {
  return (
    (s.gate ? ironFaceControlConfig.ptsGate : 0) +
    (s.curve ? ironFaceControlConfig.ptsCurve : 0) +
    (s.solid ? ironFaceControlConfig.ptsSolid : 0)
  );
}

function sessionTotal(shots: IronFaceShot[]): number {
  return shots.reduce((acc, s) => acc + shotPoints(s), 0);
}

async function persistIronFaceSession(
  userId: string,
  shots: IronFaceShot[],
  total: number,
): Promise<string | null> {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const metadata: IronFaceControlMetadata = {
      version: 1,
      shots,
      total_out_of_100: total,
    };

    const { error } = await supabase.from("practice_logs").insert({
      user_id: userId,
      log_type: ironFaceControlConfig.practiceLogType,
      score: total,
      total_points: total,
      metadata,
    });

    if (error) {
      console.warn("[IronFaceControl] practice_logs insert:", formatSupabaseWriteError(error));
      return formatSupabaseWriteError(error);
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("practiceSessionsUpdated"));
    }
    return null;
  } catch (e) {
    console.warn("[IronFaceControl] practice_logs insert failed", formatSupabaseWriteError(e));
    return formatSupabaseWriteError(e);
  }
}

function GateMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 40"
      className={className}
      aria-hidden
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="14" y="4" width="5" height="32" rx="1" fill="currentColor" />
      <rect x="29" y="4" width="5" height="32" rx="1" fill="currentColor" />
    </svg>
  );
}

const toggleBase =
  "min-h-[44px] flex-1 rounded-lg border-2 px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide transition-colors sm:text-sm";
const toggleOff = "border-gray-200 bg-white text-gray-600 hover:border-gray-300";
const toggleOn = "border-[#014421] bg-[#014421] text-white";

export function IronFaceControlRunner() {
  const { user } = useAuth();
  const [shots, setShots] = useState<IronFaceShot[]>(() => emptyShots());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const total = useMemo(() => sessionTotal(shots), [shots]);

  const flip = useCallback((index: number, key: keyof IronFaceShot) => {
    setSaved(false);
    setSaveError(null);
    setShots((prev) => {
      const next = [...prev];
      const row = { ...next[index], [key]: !next[index][key] };
      next[index] = row;
      return next;
    });
  }, []);

  const clearRound = useCallback(() => {
    setShots(emptyShots());
    setSaveError(null);
    setSaved(false);
  }, []);

  const saveRound = useCallback(async () => {
    if (!user?.id) {
      setSaveError("Sign in to submit your score to the practice log.");
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    const err = await persistIronFaceSession(user.id, shots, total);
    setIsSaving(false);
    if (err) setSaveError(err);
    else setSaved(true);
  }, [user?.id, shots, total]);

  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-gray-200 bg-white px-4 py-4 shadow-sm">
        <div className="flex items-center gap-3 text-[#014421]" aria-hidden>
          <GateMark className="h-10 w-12 shrink-0" />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Session total
            </p>
            <p className="text-3xl font-bold tabular-nums leading-none">
              {total}{" "}
              <span className="text-lg font-semibold text-gray-500">
                / {ironFaceControlConfig.maxSessionPoints}
              </span>
            </p>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            onClick={clearRound}
            className="rounded-xl border-2 border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            Clear
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => void saveRound()}
            className="rounded-xl bg-[#014421] px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isSaving ? "Submitting…" : "Submit score"}
          </button>
        </div>
      </div>

      {!user?.id && (
        <p className="text-center text-xs text-amber-800">Sign in to submit your score.</p>
      )}
      {saveError && <p className="text-center text-sm text-red-600">{saveError}</p>}
      {saved && user?.id && (
        <p className="text-center text-sm font-medium text-[#014421]">
          Score submitted to practice log.
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[340px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              <th className="w-10 px-2 py-2 text-center sm:px-3">#</th>
              <th className="px-1 py-2 text-center">
                Gate
                <span className="block font-normal normal-case text-gray-400">
                  +{ironFaceControlConfig.ptsGate}
                </span>
              </th>
              <th className="px-1 py-2 text-center">
                Curve
                <span className="block font-normal normal-case text-gray-400">
                  +{ironFaceControlConfig.ptsCurve}
                </span>
              </th>
              <th className="px-1 py-2 text-center">
                Solid
                <span className="block font-normal normal-case text-gray-400">
                  +{ironFaceControlConfig.ptsSolid}
                </span>
              </th>
              <th className="w-14 px-2 py-2 text-center sm:w-16">Pts</th>
            </tr>
          </thead>
          <tbody>
            {shots.map((s, i) => {
              const p = shotPoints(s);
              return (
                <tr key={i} className="border-b border-gray-100 last:border-0">
                  <td className="px-2 py-1.5 text-center text-xs font-bold text-gray-500 sm:px-3">
                    {i + 1}
                  </td>
                  <td className="p-1">
                    <button
                      type="button"
                      aria-pressed={s.gate}
                      aria-label={`Shot ${i + 1} gate`}
                      onClick={() => flip(i, "gate")}
                      className={`${toggleBase} w-full ${s.gate ? toggleOn : toggleOff}`}
                    >
                      Gate
                    </button>
                  </td>
                  <td className="p-1">
                    <button
                      type="button"
                      aria-pressed={s.curve}
                      aria-label={`Shot ${i + 1} curve`}
                      onClick={() => flip(i, "curve")}
                      className={`${toggleBase} w-full ${s.curve ? toggleOn : toggleOff}`}
                    >
                      Curve
                    </button>
                  </td>
                  <td className="p-1">
                    <button
                      type="button"
                      aria-pressed={s.solid}
                      aria-label={`Shot ${i + 1} solid strike`}
                      onClick={() => flip(i, "solid")}
                      className={`${toggleBase} w-full ${s.solid ? toggleOn : toggleOff}`}
                    >
                      Solid
                    </button>
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <span className="inline-block min-w-[2rem] text-base font-bold tabular-nums text-gray-900">
                      {p}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-center text-[11px] text-gray-500">
        Tap toggles after each shot — total updates live. Gate + Curve + Solid = max{" "}
        {ironFaceControlConfig.maxShotPoints} pts per shot.
      </p>
    </div>
  );
}
