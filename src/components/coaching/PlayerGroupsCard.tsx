"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ReportSection } from "@/components/coach/CoachReportParts";
import {
  ageFromDob,
  ageGroup,
  fetchTalentProfiles,
  groupsForPlayer,
  saveTalentProfile,
  setGroupMembership,
  setGroupStartDate,
  usePlayerGroups,
} from "@/lib/playerGroups";

const INPUT =
  "mt-1 block w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 outline-none focus:border-[#014421] focus:bg-white";

type Talent = { dob: string; notes: string };

/**
 * Coach-only talent ID details (start date, date of birth, notes) for players in a group such as Scholarship.
 * Hidden for everyone else; players are added from the Player reports list.
 */
export function PlayerGroupsCard({ playerId, playerName }: { playerId: string; playerName: string }) {
  const groupsState = usePlayerGroups();
  const mine = groupsForPlayer(groupsState, playerId);
  const [error, setError] = useState<string | null>(null);

  const [saved, setSaved] = useState<Talent | null>(null);
  const [draft, setDraft] = useState<Talent>({ dob: "", notes: "" });
  const [talentStatus, setTalentStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inGroup = mine.length > 0;

  useEffect(() => {
    if (!inGroup) return;
    let cancelled = false;
    void fetchTalentProfiles([playerId]).then((map) => {
      if (cancelled) return;
      const row = map.get(playerId);
      const t = { dob: row?.date_of_birth ?? "", notes: row?.notes ?? "" };
      setSaved(t);
      setDraft(t);
    });
    return () => {
      cancelled = true;
    };
  }, [playerId, inGroup]);

  if (!inGroup) return null;

  const first = playerName.split(" ")[0] || "this player";
  const age = ageFromDob(draft.dob || null);
  const dirty = saved != null && (draft.dob !== saved.dob || draft.notes.trim() !== saved.notes.trim());

  const remove = async (groupId: string, groupName: string) => {
    if (!window.confirm(`Take ${first} out of ${groupName}?`)) return;
    setError(null);
    const err = await setGroupMembership(groupId, playerId, false);
    if (err) setError(err);
  };

  const saveTalent = async () => {
    setSaving(true);
    setTalentStatus(null);
    const next = { dob: draft.dob, notes: draft.notes.trim() };
    const err = await saveTalentProfile(playerId, { date_of_birth: next.dob || null, notes: next.notes || null });
    setSaving(false);
    if (err) {
      setTalentStatus(err);
      return;
    }
    setSaved(next);
    setDraft(next);
    setTalentStatus("Saved");
  };

  return (
    <ReportSection title={`${mine.map((g) => g.name).join(" · ")} · Talent ID`} subtitle={`Only coaches see this`}>
      <ul className="divide-y divide-stone-100 rounded-xl bg-stone-50">
        {mine.map((g) => {
          const member = groupsState.members.find((m) => m.group_id === g.id && m.player_id === playerId);
          return (
            <li key={g.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-stone-800">{g.name}</p>
                <label className="mt-0.5 flex items-center gap-2 text-[11px] text-stone-500">
                  Started
                  <input
                    type="date"
                    value={member?.started_on ?? ""}
                    onChange={(e) => {
                      void setGroupStartDate(g.id, playerId, e.target.value || null).then((err) => err && setError(err));
                    }}
                    className="rounded-lg border border-stone-200 bg-white px-2 py-0.5 text-[11px] text-stone-700 outline-none focus:border-[#014421]"
                  />
                </label>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Link
                  href={`/dashboard/coach/groups/${g.id}`}
                  className="inline-flex items-center gap-0.5 text-xs font-semibold text-[#014421] hover:underline"
                >
                  Talent report
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
                <button
                  type="button"
                  onClick={() => void remove(g.id, g.name)}
                  className="text-[11px] font-medium text-stone-400 hover:text-red-600"
                >
                  Remove
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}

      <div className="mt-4">
        <label className="block text-[11px] font-medium text-stone-500">
          Date of birth
          <input
            type="date"
            value={draft.dob}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDraft((d) => ({ ...d, dob: e.target.value }))}
            className={INPUT}
            disabled={saved == null}
          />
        </label>
        {age != null && (
          <p className="mt-1 text-[11px] text-stone-500">
            Age {age} · {ageGroup(age)} age group
          </p>
        )}
        <label className="mt-3 block text-[11px] font-medium text-stone-500">
          Talent notes
          <textarea
            value={draft.notes}
            onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
            rows={3}
            maxLength={4000}
            placeholder="Strengths, potential, attitude, what to watch for…"
            className={`${INPUT} resize-y`}
            disabled={saved == null}
          />
        </label>
        <div className="mt-2 flex items-center justify-end gap-3">
          {talentStatus && (
            <span className={`text-xs font-medium ${talentStatus === "Saved" ? "text-[#014421]" : "text-red-600"}`}>
              {talentStatus}
            </span>
          )}
          <button
            type="button"
            onClick={() => void saveTalent()}
            disabled={!dirty || saving}
            className="rounded-xl bg-[#014421] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </ReportSection>
  );
}
