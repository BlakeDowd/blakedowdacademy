"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronDown, ChevronRight, Crown, Flag, Loader2, ShieldCheck, Sparkles, Trophy } from "lucide-react";
import { TournamentRoundsSheet } from "@/components/coaching/TournamentRoundsSheet";
import {
  ageFromDob,
  ageGroup,
  fetchTalentProfiles,
  groupsForPlayer,
  saveTalentProfile,
  setGroupMembership,
  SQUADS,
  setGroupSquad,
  setGroupStartDate,
  squadLabel,
  usePlayerGroups,
  type GroupMember,
  type Squad,
} from "@/lib/playerGroups";
import { usePracticeHandicapOverrides } from "@/lib/practiceHandicapOverrides";
import {
  clearTalentCohortCache,
  cohortKey,
  loadTalentCohort,
  membersFromKey,
  withSquads,
  type TalentPlayer,
} from "@/lib/talentReport";
import {
  MIN_DATA,
  TALENT_PILLARS,
  buildTalentIndex,
  playerRounds,
  type PillarScore,
  type RankScope,
} from "@/lib/talentIndex";

const INPUT =
  "mt-1 block w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 outline-none focus:border-[#014421] focus:bg-white";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Talent = { dob: string; notes: string };

function IndexRing({ value, loading }: { value: number | null; loading: boolean }) {
  const gradientId = useId();
  const r = 34;
  const circumference = 2 * Math.PI * r;
  const pct = value ?? 0;
  return (
    <div className="relative h-[88px] w-[88px] shrink-0">
      <svg viewBox="0 0 88 88" className="h-full w-full -rotate-90" aria-hidden>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFA500" />
            <stop offset="100%" stopColor="#FFE08A" />
          </linearGradient>
        </defs>
        <circle cx="44" cy="44" r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="8" />
        <circle
          cx="44"
          cy="44"
          r={r}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct / 100)}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {loading ? (
          <Loader2 className="h-6 w-6 animate-spin text-white/70" aria-hidden />
        ) : (
          <span className="text-[28px] font-black leading-none tabular-nums">{value ?? "–"}</span>
        )}
        <span className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-white/60">Index</span>
      </div>
    </div>
  );
}

function PillarBar({ label, hint, score }: { label: string; hint: string; score: PillarScore | undefined }) {
  const pct = score?.pct ?? 0;
  const fill =
    score == null
      ? ""
      : pct >= 80
        ? "bg-gradient-to-r from-[#FFA500] to-[#FFD166]"
        : pct >= 40
          ? "bg-[#014421]"
          : "bg-stone-400";
  return (
    <li>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-stone-800">{label}</span>
        <span className={`text-[11px] font-semibold tabular-nums ${score ? "text-stone-600" : "text-stone-300"}`}>
          {score
            ? score.rank === 1 && !score.tied
              ? `1st of ${score.of}`
              : `${score.tied ? "Tied " : ""}#${score.rank} of ${score.of}`
            : "No data yet"}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-100">
        {score && <div className={`h-full rounded-full ${fill} transition-[width] duration-700`} style={{ width: `${Math.max(4, pct)}%` }} />}
      </div>
      <p className="mt-0.5 text-[11px] text-stone-500">{score?.detail || hint}</p>
    </li>
  );
}

/**
 * Coach-only Talent ID for players in a group such as Scholarship: an objective index ranked against the
 * group, plus start date, date of birth and notes. Hidden for everyone else.
 */
export function PlayerGroupsCard({ playerId, playerName }: { playerId: string; playerName: string }) {
  const groupsState = usePlayerGroups();
  const overrides = usePracticeHandicapOverrides();
  const mine = groupsForPlayer(groupsState, playerId);
  const [error, setError] = useState<string | null>(null);

  const [saved, setSaved] = useState<Talent | null>(null);
  const [draft, setDraft] = useState<Talent>({ dob: "", notes: "" });
  const [talentStatus, setTalentStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [roundsOpen, setRoundsOpen] = useState(false);
  const [scope, setScope] = useState<RankScope>("group");
  const dobRef = useRef<HTMLInputElement>(null);
  const [dobHint, setDobHint] = useState(false);
  const [squadHint, setSquadHint] = useState(false);
  const [reload, setReload] = useState(0);
  const inGroup = mine.length > 0;

  const cohort = useMemo(() => {
    const groupIds = new Set(mine.map((g) => g.id));
    const byPlayer = new Map<string, GroupMember>();
    for (const m of groupsState.members) {
      if (groupIds.has(m.group_id) && !byPlayer.has(m.player_id)) byPlayer.set(m.player_id, m);
    }
    return [...byPlayer.values()];
  }, [mine, groupsState.members]);
  const key = `${cohortKey(cohort)}#${reload}`;
  const [loaded, setLoaded] = useState<{ key: string; players: TalentPlayer[] } | null>(null);

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

  useEffect(() => {
    const members = membersFromKey(key.split("#")[0]);
    if (members.length === 0) return;
    let cancelled = false;
    void loadTalentCohort(members).then((players) => {
      if (!cancelled) setLoaded({ key, players });
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const groupNames = mine.map((g) => g.name).join(" · ");
  const groupIdsKey = mine.map((g) => g.id).join(",");
  const players = useMemo(
    () =>
      loaded?.key === key ? withSquads(loaded.players, groupsState.members, new Set(groupIdsKey.split(","))) : null,
    [loaded, key, groupsState.members, groupIdsKey],
  );
  const groupRows = useMemo(
    () => (players ? buildTalentIndex(players, overrides.byId, "group", groupNames) : null),
    [players, overrides.byId, groupNames],
  );
  const ageRows = useMemo(() => (players ? buildTalentIndex(players, overrides.byId, "age") : null), [players, overrides.byId]);
  const squadRows = useMemo(() => (players ? buildTalentIndex(players, overrides.byId, "squad") : null), [players, overrides.byId]);
  const meGroup = groupRows?.find((r) => r.player.id === playerId) ?? null;
  const meAge = ageRows?.find((r) => r.player.id === playerId) ?? null;
  const meSquad = squadRows?.find((r) => r.player.id === playerId) ?? null;
  const me = scope === "age" ? meAge : scope === "squad" ? meSquad : meGroup;
  const mySquad =
    groupsState.members.find((m) => m.player_id === playerId && groupIdsKey.split(",").includes(m.group_id) && m.squad)?.squad ??
    null;
  const myRounds = useMemo(() => {
    const p = players?.find((x) => x.id === playerId);
    return p ? playerRounds(p) : [];
  }, [players, playerId]);

  if (!inGroup) return null;

  const loading = groupRows == null;
  const first = playerName.split(" ")[0] || "this player";
  const age = ageFromDob(draft.dob || null);
  const birthMonth = draft.dob ? Number(draft.dob.slice(5, 7)) - 1 : null;
  const youngForYear = birthMonth != null && birthMonth >= 8;
  const dirty = saved != null && (draft.dob !== saved.dob || draft.notes.trim() !== saved.notes.trim());

  const standouts: string[] = [];
  const watch: string[] = [];
  const missing: string[] = [];
  if (me) {
    for (const p of TALENT_PILLARS) {
      const s = me.pillars[p.id];
      if (!s) continue;
      if (s.rank === 1 && !s.tied) standouts.push(`Best in group · ${p.label}`);
      else if (s.pct >= 80) standouts.push(`Top ${Math.ceil((s.rank / s.of) * 100)}% · ${p.label}`);
      else if (s.pct <= 25) watch.push(`${p.label} · ${s.tied ? "tied " : ""}#${s.rank} of ${s.of}`);
    }
    for (const lead of me.combineLeads) standouts.push(`#1 · ${lead.label} (${lead.of} tested)`);
    if (!me.pillars.competitive) missing.push(`Tag ${MIN_DATA} tournament rounds to score Competitive`);
    if (!me.pillars.skill) missing.push("No combines in 6 months: skill can't be scored");
    if (!draft.dob) missing.push("Add a date of birth to score skill for age");
  }
  const ageLabel = meAge?.cohort ?? null;
  const hasAge = !!ageLabel && ageLabel !== "No DOB";
  const otherRank = [
    scope !== "group" && meGroup?.rank != null ? `#${meGroup.rank} of ${meGroup.ranked} in ${groupNames}` : null,
    scope !== "age" && hasAge && meAge?.rank != null ? `#${meAge.rank} of ${meAge.ranked} in ${ageLabel}` : null,
    scope !== "squad" && mySquad && meSquad?.rank != null ? `#${meSquad.rank} of ${meSquad.ranked} in ${squadLabel(mySquad)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const changeSquad = async (squad: Squad | null) => {
    setError(null);
    for (const g of mine) {
      const err = await setGroupSquad(g.id, playerId, squad);
      if (err) {
        setError(err);
        return;
      }
    }
    if (!squad && scope === "squad") setScope("group");
  };
  const reloadCohort = () => {
    clearTalentCohortCache();
    setReload((n) => n + 1);
  };

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
    if (next.dob !== saved?.dob) reloadCohort();
    setSaved(next);
    setDraft(next);
    setTalentStatus("Saved");
  };

  let headline: string;
  let subline: string;
  if (loading) {
    headline = "Crunching the numbers…";
    subline = `Comparing with everyone in ${groupNames}`;
  } else if (me?.rank != null) {
    headline = me.rank === 1 ? `1st of ${me.ranked}` : `#${me.rank} of ${me.ranked}`;
    subline = `in ${me.cohort}`;
  } else {
    const scopeRows = scope === "age" ? ageRows : scope === "squad" ? squadRows : groupRows;
    const cohortName = me?.cohort ?? groupNames;
    const cohortSize = scopeRows?.filter((r) => r.cohort === cohortName).length ?? 0;
    headline = "Not ranked yet";
    subline =
      cohortSize < MIN_DATA
        ? `Needs ${MIN_DATA}+ players in ${cohortName} to compare`
        : "Needs data in at least 2 areas below";
  }

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-[#014421]/25 bg-white shadow-sm print:break-inside-avoid print:shadow-none">
      <div className="relative overflow-hidden bg-gradient-to-br from-[#014421] via-[#0b5a32] to-[#022c17] px-4 py-5 text-white sm:px-5">
        <div aria-hidden className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-[#FFA500]/25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-16 left-10 h-36 w-36 rounded-full bg-emerald-300/10 blur-3xl" />
        <div className="relative flex items-center gap-4">
          <IndexRing value={me?.index ?? null} loading={loading} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#FFC966]">
              <Sparkles className="h-3 w-3" aria-hidden />
              {groupNames} · Talent ID
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-2xl font-bold leading-tight">
              {me?.rank === 1 && <Crown className="h-5 w-5 text-[#FFC966]" aria-hidden />}
              {headline}
            </p>
            <p className="text-xs text-white/70">
              {subline}
              {otherRank && <span className="text-white/50"> · {otherRank}</span>}
            </p>
            {me?.readiness != null && (
              <div className="mt-2 flex items-center gap-2" title="Competitive form, current skill and current workload">
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/60">Readiness</span>
                <span className="h-1.5 w-20 overflow-hidden rounded-full bg-white/15">
                  <span className="block h-full rounded-full bg-[#FFC966]" style={{ width: `${Math.max(4, me.readiness)}%` }} />
                </span>
                <span className="text-xs font-bold tabular-nums">{me.readiness}</span>
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {mySquad && (
                <span className="rounded-full bg-[#FFC966] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#4a2c00]">
                  {squadLabel(mySquad)} squad
                </span>
              )}
              {age != null ? (
                <span className="rounded-full bg-white/12 px-2 py-0.5 text-[10px] font-semibold ring-1 ring-white/20">
                  Age {age} · {ageGroup(age)}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setDetailsOpen(true)}
                  className="rounded-full bg-[#FFA500]/25 px-2 py-0.5 text-[10px] font-semibold text-[#FFE08A] ring-1 ring-[#FFA500]/40"
                >
                  Add date of birth
                </button>
              )}
              {youngForYear && (
                <span
                  className="rounded-full bg-white/12 px-2 py-0.5 text-[10px] font-semibold ring-1 ring-white/20"
                  title="Born late in the year, so often up to a year younger than others in the same age group. Skill for age allows for this."
                >
                  Born {MONTHS[birthMonth!]} · young for their year
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="relative mt-4 flex rounded-full bg-black/20 p-0.5 text-[11px] font-semibold" role="radiogroup" aria-label="Rank against">
          {(
            [
              { id: "group", label: `All ${groupNames}`, missing: false },
              { id: "age", label: hasAge ? `${ageLabel} only` : "Age group", missing: !hasAge },
              { id: "squad", label: mySquad ? `${squadLabel(mySquad)} only` : "Squad", missing: !mySquad },
            ] as const
          ).map((o) => {
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={scope === o.id}
                title={o.missing ? (o.id === "age" ? "Add a date of birth first" : "Pick a squad first") : undefined}
                onClick={() => {
                  if (o.id === "age" && o.missing) {
                    setDetailsOpen(true);
                    setDobHint(true);
                    requestAnimationFrame(() => dobRef.current?.focus());
                    return;
                  }
                  if (o.id === "squad" && o.missing) {
                    setSquadHint(true);
                    return;
                  }
                  setScope(o.id);
                }}
                className={`flex-1 truncate rounded-full px-2 py-1.5 transition ${
                  scope === o.id ? "bg-white text-[#014421] shadow-sm" : o.missing ? "text-white/55" : "text-white/75"
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        <p className="relative mt-3 flex items-start gap-1.5 text-[11px] leading-snug text-white/65">
          <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0 text-[#FFC966]" aria-hidden />
          Scored only from combines, practice and coach-tagged competition rounds, with recent results counting most. No
          opinions, names or reputations. Only coaches see this.
        </p>
      </div>

      <div className="px-4 py-4 sm:px-5">
        <div className={`mb-4 rounded-xl p-2.5 transition ${squadHint && !mySquad ? "bg-[#FFF8EA] ring-1 ring-[#FFA500]/40" : "bg-stone-50"}`}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-stone-600">Squad</p>
            {squadHint && !mySquad && <p className="text-[11px] font-medium text-[#b86e00]">Pick one to rank by squad</p>}
          </div>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Squad">
            {SQUADS.map((s) => {
              const on = mySquad === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => void changeSquad(on ? null : s.id)}
                  className={`rounded-lg px-2 py-1.5 text-xs font-semibold transition ${
                    on
                      ? s.id === "elite"
                        ? "bg-gradient-to-r from-[#FFA500] to-[#FFC966] text-[#4a2c00] shadow-sm"
                        : "bg-[#014421] text-white shadow-sm"
                      : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-100"
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
          {error && <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>}
        </div>
        <ul className="space-y-3">
          {TALENT_PILLARS.map((p) => (
            <PillarBar key={p.id} label={p.label} hint={p.hint} score={me?.pillars[p.id]} />
          ))}
        </ul>

        {standouts.length > 0 && (
          <div className="mt-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-stone-400">Stands out</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {standouts.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#FFF4DC] to-[#FFE7B3] px-2.5 py-1 text-[11px] font-semibold text-[#8a5300] ring-1 ring-[#FFA500]/30"
                >
                  <Trophy className="h-3 w-3" aria-hidden />
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {(watch.length > 0 || missing.length > 0) && (
          <div className="mt-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-stone-400">Watch</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {watch.map((s) => (
                <span key={s} className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">
                  <AlertTriangle className="h-3 w-3" aria-hidden />
                  {s}
                </span>
              ))}
              {missing.map((s) => (
                <span key={s} className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-600">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => setRoundsOpen(true)}
          disabled={players == null}
          className="mt-4 flex w-full items-center gap-3 rounded-xl border border-[#FFA500]/30 bg-[#FFF8EA] px-3 py-2.5 text-left disabled:opacity-50"
        >
          <Flag className="h-4 w-4 shrink-0 text-[#b86e00]" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-stone-800">Tournament rounds</span>
            <span className="block text-[11px] text-stone-500">
              {myRounds.filter((r) => r.tier).length} tagged · tag comps so they count toward Competitive
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-stone-400" aria-hidden />
        </button>
        {roundsOpen && (
          <TournamentRoundsSheet
            playerName={playerName}
            rounds={myRounds}
            onClose={() => setRoundsOpen(false)}
            onChanged={reloadCohort}
          />
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-3">
          <p className="text-[11px] text-stone-400">
            Index = weighted share of the group they&apos;re ahead of.{" "}
            {TALENT_PILLARS.map((p) => `${p.label} ${p.weight}%`).join(" · ")}
          </p>
          {mine.map((g) => (
            <Link
              key={g.id}
              href={`/dashboard/coach/groups/${g.id}`}
              className="inline-flex items-center gap-0.5 text-xs font-semibold text-[#014421] hover:underline"
            >
              {mine.length > 1 ? `${g.name} report` : "Full talent report"}
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          ))}
        </div>

        <div className="mt-3 rounded-xl bg-stone-50">
          <button
            type="button"
            onClick={() => setDetailsOpen((o) => !o)}
            aria-expanded={detailsOpen}
            className="flex w-full items-center justify-between px-3 py-2.5 text-left text-xs font-semibold text-stone-700"
          >
            Start date, date of birth & coach notes
            <ChevronDown className={`h-4 w-4 text-stone-400 transition ${detailsOpen ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {detailsOpen && (
            <div className="border-t border-stone-200/70 px-3 pb-3 pt-2">
              <ul className="divide-y divide-stone-200/70">
                {mine.map((g) => {
                  const member = groupsState.members.find((m) => m.group_id === g.id && m.player_id === playerId);
                  return (
                    <li key={g.id} className="flex items-center gap-3 py-2">
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
                      <button
                        type="button"
                        onClick={() => void remove(g.id, g.name)}
                        className="shrink-0 text-[11px] font-medium text-stone-400 hover:text-red-600"
                      >
                        Remove
                      </button>
                    </li>
                  );
                })}
              </ul>
              {error && <p className="mt-1 text-xs font-medium text-red-600">{error}</p>}

              <label className="mt-2 block text-[11px] font-medium text-stone-500">
                Date of birth
                <input
                  ref={dobRef}
                  type="date"
                  value={draft.dob}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setDraft((d) => ({ ...d, dob: e.target.value }))}
                  className={INPUT}
                  disabled={saved == null}
                />
              </label>
              {dobHint && !draft.dob && (
                <p className="mt-1 text-[11px] font-medium text-[#b86e00]">Add a date of birth and save to rank by age group.</p>
              )}
              <label className="mt-3 block text-[11px] font-medium text-stone-500">
                Coach notes · not part of the index
                <textarea
                  value={draft.notes}
                  onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                  rows={3}
                  maxLength={4000}
                  placeholder="Strengths, attitude, what to watch for…"
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
          )}
        </div>
      </div>
    </section>
  );
}
