"use client";

import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowUp, Crown, Download, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { isCoachEmail } from "@/lib/coachEmails";
import { ReportEmpty, ReportSection } from "@/components/coach/CoachReportParts";
import { Segmented } from "@/components/profile/ProfileStatsParts";
import {
  AGE_GROUPS,
  deletePlayerGroup,
  membersOfGroup,
  renamePlayerGroup,
  squadLabel,
  usePlayerGroups,
  type AgeGroup,
} from "@/lib/playerGroups";
import { usePracticeHandicapOverrides } from "@/lib/practiceHandicapOverrides";
import { formatHandicap } from "@/lib/practiceHandicap";
import { GAME_AREAS } from "@/lib/practiceHandicapBenchmarks";
import { MOBILITY_AREAS } from "@/lib/mobilityScreenConfig";
import {
  areaHandicap,
  buildCombineRankings,
  buildCommitmentRows,
  buildCompareRows,
  buildMobilityRows,
  buildProgressRows,
  cohortKey,
  loadTalentCohort,
  membersFromKey,
  withSquads,
  type CommitmentPeriod,
  type ProgressPeriod,
  type TalentPlayer,
} from "@/lib/talentReport";
import {
  COHORT_ORDER,
  MIN_DATA,
  TALENT_PILLARS,
  blindLabels,
  buildTalentIndex,
  type RankScope,
  type TalentIndexRow,
} from "@/lib/talentIndex";
import { EVENT_TIERS } from "@/lib/eventTiers";

const noopSubscribe = () => () => {};

/** Player id → "Player A" etc. while blind review is on. */
const BlindContext = createContext<Map<string, string> | null>(null);

type Tab = "index" | "compare" | "progress" | "commitment" | "rankings" | "mobility";
const TABS: { id: Tab; label: string }[] = [
  { id: "index", label: "Talent index" },
  { id: "compare", label: "Compare" },
  { id: "progress", label: "Progress" },
  { id: "commitment", label: "Commitment" },
  { id: "rankings", label: "Rankings" },
  { id: "mobility", label: "Mobility" },
];

const PROGRESS_PERIODS: { id: ProgressPeriod; label: string }[] = [
  { id: "3m", label: "3 months" },
  { id: "6m", label: "6 months" },
  { id: "12m", label: "1 year" },
  { id: "start", label: "Since start" },
];

const COMMITMENT_PERIODS: { id: CommitmentPeriod; label: string }[] = [
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
  { id: "start", label: "Since start" },
];

const AREA_SHORT: Record<string, string> = {
  driving: "Drive",
  irons: "Irons",
  wedges: "Wedges",
  chipping: "Chip",
  bunkers: "Sand",
  putting: "Putt",
};

const hcp = (h: number | null) => (h == null ? null : formatHandicap(h));

const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "2-digit" }) : null;

function PlayerCell({ player }: { player: TalentPlayer }) {
  const blind = useContext(BlindContext);
  const ageLine = (
    <span className="block text-[10px] text-stone-500">
      {player.age != null ? `Age ${player.age} · ${player.ageGroup}` : "No DOB"}
      {player.squad && ` · ${squadLabel(player.squad)}`}
    </span>
  );
  if (blind) {
    return (
      <span className="block min-w-0">
        <span className="block truncate text-[13px] font-semibold text-stone-900">{blind.get(player.id) ?? "Player"}</span>
        {ageLine}
      </span>
    );
  }
  return (
    <Link href={`/dashboard/coach/player/${player.id}`} className="block min-w-0 hover:underline">
      <span className="block truncate text-[13px] font-semibold text-stone-900">{player.name}</span>
      {ageLine}
    </Link>
  );
}

type Column<T> = {
  id: string;
  label: string;
  value: (row: T) => number | null;
  render?: (row: T) => ReactNode;
  lowerIsBetter?: boolean;
  /** Shade the group's best value in this column. */
  best?: boolean;
};

/** Player table with tap-to-sort headers; empty values always sort last. */
function SortTable<T extends { player: TalentPlayer }>({
  rows,
  columns,
  initialSort,
}: {
  rows: T[];
  columns: Column<T>[];
  initialSort: string;
}) {
  const [sort, setSort] = useState<{ id: string; asc: boolean }>(() => {
    const col = columns.find((c) => c.id === initialSort);
    return { id: initialSort, asc: !!col?.lowerIsBetter };
  });
  const col = columns.find((c) => c.id === sort.id) ?? columns[0];
  const sorted = [...rows].sort((a, b) => {
    const va = col.value(a);
    const vb = col.value(b);
    if (va == null && vb == null) return a.player.name.localeCompare(b.player.name);
    if (va == null) return 1;
    if (vb == null) return -1;
    return sort.asc ? va - vb : vb - va;
  });
  const bestById = new Map<string, number>();
  for (const c of columns) {
    if (!c.best) continue;
    const values = rows.map(c.value).filter((v): v is number => v != null);
    if (values.length > 1) bestById.set(c.id, c.lowerIsBetter ? Math.min(...values) : Math.max(...values));
  }

  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[560px] border-separate border-spacing-0 text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-white py-2 pr-2 text-left text-[10px] font-bold uppercase tracking-wide text-stone-400">
              Player
            </th>
            {columns.map((c) => {
              const active = c.id === col.id;
              return (
                <th key={c.id} className="px-1 py-2 text-right">
                  <button
                    type="button"
                    onClick={() =>
                      setSort((s) => (s.id === c.id ? { id: c.id, asc: !s.asc } : { id: c.id, asc: !!c.lowerIsBetter }))
                    }
                    className={`inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      active ? "text-[#014421]" : "text-stone-400 hover:text-stone-700"
                    }`}
                  >
                    {c.label}
                    {active && (sort.asc ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />)}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.player.id}>
              <td className="sticky left-0 z-10 max-w-[130px] border-t border-stone-100 bg-white py-2 pr-2">
                <PlayerCell player={row.player} />
              </td>
              {columns.map((c) => {
                const v = c.value(row);
                const isBest = v != null && bestById.get(c.id) === v;
                return (
                  <td key={c.id} className="border-t border-stone-100 px-1 py-2 text-right tabular-nums">
                    <span
                      className={`inline-block rounded-md px-1.5 py-0.5 ${
                        isBest ? "bg-[#014421]/10 font-bold text-[#014421]" : v == null ? "text-stone-300" : "text-stone-800"
                      }`}
                    >
                      {c.render ? c.render(row) : (v ?? "–")}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Change({ gain }: { gain: number | null }) {
  if (gain == null) return <span className="text-stone-300">–</span>;
  const r = Math.round(gain * 10) / 10;
  if (r === 0) return <span className="text-stone-500">0.0</span>;
  return (
    <span className={`font-bold ${r > 0 ? "text-[#014421]" : "text-red-600"}`}>
      {r > 0 ? "▲" : "▼"} {Math.abs(r).toFixed(1)}
    </span>
  );
}

export default function GroupTalentReportPage() {
  const params = useParams();
  const router = useRouter();
  const groupId = (params?.id as string) ?? "";
  const { user } = useAuth();
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const isCoach = hydrated && (isCoachEmail(user?.email) || user?.role === "coach");

  const groupsState = usePlayerGroups();
  const overrides = usePracticeHandicapOverrides();
  const group = groupsState.groups.find((g) => g.id === groupId) ?? null;
  const members = useMemo(() => membersOfGroup(groupsState, groupId), [groupsState, groupId]);
  const membersKey = cohortKey(members);

  const [loaded, setLoaded] = useState<{ key: string; players: TalentPlayer[] } | null>(null);
  const [tab, setTab] = useState<Tab>("index");
  const [blind, setBlind] = useState(false);
  const [rankScope, setRankScope] = useState<RankScope>("group");
  const [age, setAge] = useState<AgeGroup | "all">("all");
  const [progressPeriod, setProgressPeriod] = useState<ProgressPeriod>("6m");
  const [commitmentPeriod, setCommitmentPeriod] = useState<CommitmentPeriod>("90d");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [manageError, setManageError] = useState<string | null>(null);

  useEffect(() => {
    if (!isCoach || !groupsState.loaded) return;
    let cancelled = false;
    void loadTalentCohort(membersFromKey(membersKey)).then((players) => {
      if (!cancelled) setLoaded({ key: membersKey, players });
    });
    return () => {
      cancelled = true;
    };
  }, [isCoach, groupsState.loaded, groupId, membersKey]);

  const allPlayers = useMemo(
    () => (loaded?.key === membersKey ? withSquads(loaded.players, members, new Set([groupId])) : null),
    [loaded, membersKey, members, groupId],
  );
  const players = useMemo(
    () => (allPlayers ?? []).filter((p) => age === "all" || p.ageGroup === age),
    [allPlayers, age],
  );
  const presentAges = AGE_GROUPS.filter((g) => allPlayers?.some((p) => p.ageGroup === g));

  const blindMap = useMemo(() => (blind && allPlayers ? blindLabels(allPlayers.map((p) => p.id)) : null), [blind, allPlayers]);
  const indexRows = useMemo(
    () => (tab === "index" ? buildTalentIndex(players, overrides.byId, rankScope, group?.name ?? "the group") : []),
    [tab, players, overrides.byId, rankScope, group?.name],
  );
  const indexCohorts = useMemo(() => {
    const out = new Map<string, TalentIndexRow[]>();
    for (const row of indexRows) out.set(row.cohort, [...(out.get(row.cohort) ?? []), row]);
    return [...out].sort(([a], [b]) => COHORT_ORDER.indexOf(a) - COHORT_ORDER.indexOf(b));
  }, [indexRows]);
  const compareRows = useMemo(() => buildCompareRows(players, overrides.byId), [players, overrides.byId]);
  const progressRows = useMemo(
    () => (tab === "progress" ? buildProgressRows(compareRows, overrides.byId, progressPeriod) : []),
    [tab, compareRows, overrides.byId, progressPeriod],
  );
  const commitmentRows = useMemo(
    () => (tab === "commitment" ? buildCommitmentRows(players, commitmentPeriod) : []),
    [tab, players, commitmentPeriod],
  );
  const rankings = useMemo(() => (tab === "rankings" ? buildCombineRankings(compareRows) : []), [tab, compareRows]);
  const mobilityRows = useMemo(() => (tab === "mobility" ? buildMobilityRows(players) : []), [tab, players]);

  if (!hydrated) return null;
  if (!isCoach) {
    return <p className="px-4 py-10 text-center text-sm text-stone-500">Talent reports are for coaches only.</p>;
  }

  const busy = !groupsState.loaded || (group != null && allPlayers == null);

  const content = () => {
    if (players.length === 0) {
      return (
        <ReportEmpty>
          {members.length === 0
            ? "No players in this group yet. Open a player's report and tap the group under Groups & talent ID."
            : "No players in this age group."}
        </ReportEmpty>
      );
    }
    switch (tab) {
      case "index": {
        const indexColumns: Column<TalentIndexRow>[] = [
          {
            id: "index",
            label: "Index",
            value: (r) => r.index,
            render: (r) =>
              r.index == null ? (
                "–"
              ) : (
                <span className="inline-flex items-center gap-1 font-bold">
                  {r.rank === 1 && <Crown className="h-3.5 w-3.5 text-[#FFA500]" aria-hidden />}
                  {r.index}
                </span>
              ),
            best: true,
          },
          { id: "readiness", label: "Ready", value: (r) => r.readiness, best: true },
          ...TALENT_PILLARS.map(
            (p): Column<TalentIndexRow> => ({
              id: p.id,
              label: p.short,
              value: (r) => r.pillars[p.id]?.pct ?? null,
              render: (r) => {
                const s = r.pillars[p.id];
                if (!s) return "–";
                return (
                  <span title={s.detail} className={s.pct >= 80 ? "font-bold text-[#b86e00]" : s.pct <= 25 ? "text-stone-400" : ""}>
                    {s.rank === 1 && !s.tied ? "1st" : `${s.tied ? "=" : "#"}${s.rank}`}
                  </span>
                );
              },
              best: true,
            }),
          ),
          {
            id: "leads",
            label: "Combine #1s",
            value: (r) => (r.combineLeads.length ? r.combineLeads.length : null),
            best: true,
          },
        ];
        return (
          <div className="space-y-3">
            <ReportSection
              title="Talent index"
              subtitle={
                <span className="inline-flex items-start gap-1">
                  <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0 text-[#014421]" aria-hidden />
                  Data only: combines, practice and coach-tagged competition rounds. Turn on Blind review to hide names.
                </span>
              }
              aside={
                <Segmented
                  label="Rank against"
                  value={rankScope}
                  onChange={setRankScope}
                  options={[
                    { id: "group", label: "Whole group" },
                    { id: "age", label: "Age groups" },
                    { id: "squad", label: "Squads" },
                  ]}
                />
              }
            >
              {rankScope === "group" ? (
                <SortTable key="group" rows={indexRows} initialSort="index" columns={indexColumns} />
              ) : (
                <p className="text-xs text-stone-500">
                  Each player is ranked only against their own {rankScope === "age" ? "age group" : "squad"}.{" "}
                  {rankScope === "age" ? "Age groups" : "Squads"} with fewer than {MIN_DATA} players can&apos;t be ranked.
                  {rankScope === "squad" && " Set a player's squad on their Talent ID card."}
                </p>
              )}
            </ReportSection>
            {rankScope !== "group" &&
              indexCohorts.map(([cohort, rows]) => (
                <ReportSection key={cohort} title={cohort} subtitle={`${rows.length} ${rows.length === 1 ? "player" : "players"}`}>
                  {rows.length < MIN_DATA ? (
                    <ReportEmpty>Not enough players in {cohort} to rank (needs {MIN_DATA}).</ReportEmpty>
                  ) : (
                    <SortTable key={`${rankScope}-${cohort}`} rows={rows} initialSort="index" columns={indexColumns} />
                  )}
                </ReportSection>
              ))}
            <p className="px-1 text-[11px] leading-relaxed text-stone-500">
              The index (0–100) is the weighted share of the cohort each player is ahead of:{" "}
              {TALENT_PILLARS.map((p) => `${p.label.toLowerCase()} ${p.weight}%`).join(", ")}. Ready blends competitive,
              skill and commitment. Competitive uses score differentials from coach-tagged comps (
              {EVENT_TIERS.map((t) => `${t.label} ×${t.weight}`).join(", ")}) and needs {MIN_DATA} rounds. Social rounds
              don&apos;t count. Recent results count most: full weight
              for 30 days, 70% to 90 days, 40% to 6 months, then nothing. Gold is the top 20%.
            </p>
          </div>
        );
      }
      case "compare":
        return (
          <ReportSection title="Side by side" subtitle="Handicaps by area. Green is the best in the group. Tap a heading to sort.">
            <SortTable
              rows={compareRows}
              initialSort="practice"
              columns={[
                { id: "age", label: "Age", value: (r) => r.player.age },
                { id: "playing", label: "Playing", value: (r) => r.playing, render: (r) => hcp(r.playing) ?? "–", lowerIsBetter: true, best: true },
                {
                  id: "practice",
                  label: "Practice",
                  value: (r) => r.practice.overall,
                  render: (r) => hcp(r.practice.overall) ?? "–",
                  lowerIsBetter: true,
                  best: true,
                },
                ...GAME_AREAS.map(({ id }) => ({
                  id,
                  label: AREA_SHORT[id] ?? id,
                  value: (r: (typeof compareRows)[number]) => areaHandicap(r.practice, id),
                  render: (r: (typeof compareRows)[number]) => hcp(areaHandicap(r.practice, id)) ?? "–",
                  lowerIsBetter: true,
                  best: true,
                })),
              ]}
            />
            <p className="mt-3 text-[11px] leading-relaxed text-stone-500">
              Practice handicaps use the average of each player&apos;s last 3 attempts at every combine. A dash means no combine
              done in that area yet.
            </p>
          </ReportSection>
        );
      case "progress":
        return (
          <ReportSection
            title="Progress"
            subtitle="Shots improved on each handicap. ▲ is better."
            aside={
              <Segmented label="Progress period" value={progressPeriod} onChange={setProgressPeriod} options={PROGRESS_PERIODS} />
            }
          >
            <SortTable
              key={progressPeriod}
              rows={progressRows}
              initialSort="practiceGain"
              columns={[
                {
                  id: "playingNow",
                  label: "Playing",
                  value: (r) => r.playingNow,
                  render: (r) => (
                    <span className="whitespace-nowrap">
                      {hcp(r.playingThen) ?? "–"} → {hcp(r.playingNow) ?? "–"}
                    </span>
                  ),
                  lowerIsBetter: true,
                },
                { id: "playingGain", label: "Change", value: (r) => r.playingGain, render: (r) => <Change gain={r.playingGain} />, best: true },
                {
                  id: "practiceNow",
                  label: "Practice",
                  value: (r) => r.practiceNow,
                  render: (r) => (
                    <span className="whitespace-nowrap">
                      {hcp(r.practiceThen) ?? "–"} → {hcp(r.practiceNow) ?? "–"}
                    </span>
                  ),
                  lowerIsBetter: true,
                },
                { id: "practiceGain", label: "Change", value: (r) => r.practiceGain, render: (r) => <Change gain={r.practiceGain} />, best: true },
              ]}
            />
            <p className="mt-3 text-[11px] leading-relaxed text-stone-500">
              {progressPeriod === "start"
                ? "Compared with where each player was on their start date in this group."
                : "Compared with where each player was at the start of the period."}{" "}
              A dash means there&apos;s no handicap from back then to compare with.
            </p>
          </ReportSection>
        );
      case "commitment":
        return (
          <ReportSection
            title="Commitment"
            subtitle="How much work each player is putting in"
            aside={
              <Segmented
                label="Commitment period"
                value={commitmentPeriod}
                onChange={setCommitmentPeriod}
                options={COMMITMENT_PERIODS}
              />
            }
          >
            <SortTable
              key={commitmentPeriod}
              rows={commitmentRows}
              initialSort="hours"
              columns={[
                { id: "hours", label: "Hours", value: (r) => Math.round(r.hours * 10) / 10, best: true },
                { id: "days", label: "Days", value: (r) => r.activeDays, best: true },
                { id: "combines", label: "Combines", value: (r) => r.combines, best: true },
                { id: "lessons", label: "Lessons", value: (r) => r.lessons, best: true },
                { id: "rounds", label: "Rounds", value: (r) => r.rounds, best: true },
                { id: "streak", label: "Streak", value: (r) => r.player.streak, best: true },
                {
                  id: "active",
                  label: "Last on",
                  value: (r) => (r.player.lastActive ? new Date(r.player.lastActive).getTime() : null),
                  render: (r) => shortDate(r.player.lastActive) ?? "–",
                },
              ]}
            />
            <p className="mt-3 text-[11px] leading-relaxed text-stone-500">
              Days counts different days with practice logged. Streak is their current login streak.
            </p>
          </ReportSection>
        );
      case "rankings":
        return rankings.length === 0 ? (
          <ReportEmpty>No combines done by this group yet.</ReportEmpty>
        ) : (
          <div className="space-y-3">
            {rankings.map((r) => (
              <ReportSection
                key={r.id}
                title={r.label}
                subtitle={`${GAME_AREAS.find((a) => a.id === r.area)?.label ?? r.area} · ${r.entries.length} of ${players.length} players tested`}
              >
                <ol className="divide-y divide-stone-100">
                  {r.entries.map((e, i) => (
                    <li key={e.player.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                          i === 0 ? "bg-[#FFA500] text-white" : "bg-stone-100 text-stone-600"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <PlayerCell player={e.player} />
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold tabular-nums text-stone-900">{e.combine.averageDisplay}</p>
                        <p className="text-[10px] text-stone-500">
                          Level {formatHandicap(e.combine.handicap)} · {e.combine.attempts} {e.combine.attempts === 1 ? "try" : "tries"}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </ReportSection>
            ))}
          </div>
        );
      case "mobility": {
        const screened = mobilityRows.filter((r) => r.latest);
        const areaAverages = MOBILITY_AREAS.map((area) => {
          const values = screened.map((r) => r.latest!.areas.get(area)).filter((v): v is number => v != null);
          return { area, pct: values.length ? Math.round(values.reduce((a, v) => a + v, 0) / values.length) : null };
        });
        return (
          <div className="space-y-3">
            <ReportSection
              title="Group body check"
              subtitle={`Average % of checks passed on each player's latest screen · ${screened.length} of ${players.length} screened`}
            >
              {screened.length === 0 ? (
                <ReportEmpty>No mobility screens yet for this group.</ReportEmpty>
              ) : (
                <ul className="space-y-2">
                  {areaAverages.map(({ area, pct }) => (
                    <li key={area} className="flex items-center gap-3">
                      <span className="w-28 shrink-0 text-xs font-medium text-stone-700">{area}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100">
                        <span
                          className={`block h-full rounded-full ${pct != null && pct < 50 ? "bg-[#FFA500]" : "bg-[#014421]"}`}
                          style={{ width: `${pct ?? 0}%` }}
                        />
                      </span>
                      <span className="w-9 shrink-0 text-right text-xs font-semibold tabular-nums text-stone-800">
                        {pct == null ? "–" : `${pct}%`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </ReportSection>
            <ReportSection title="Latest screens" subtitle="Tap a heading to sort">
              <SortTable
                rows={mobilityRows}
                initialSort="pct"
                columns={[
                  { id: "pct", label: "Score", value: (r) => r.latest?.pct ?? null, render: (r) => (r.latest ? `${r.latest.pct}%` : "–"), best: true },
                  { id: "change", label: "Change", value: (r) => r.latest?.change ?? null, render: (r) => <Change gain={r.latest?.change ?? null} /> },
                  { id: "pain", label: "Pain", value: (r) => r.latest?.pain ?? null, render: (r) =>
                      r.latest ? <span className={r.latest.pain > 0 ? "font-bold text-red-600" : ""}>{r.latest.pain}</span> : "–" },
                  ...MOBILITY_AREAS.map((area) => ({
                    id: area,
                    label: area.split(" ")[0],
                    value: (r: (typeof mobilityRows)[number]) => r.latest?.areas.get(area) ?? null,
                    render: (r: (typeof mobilityRows)[number]) => {
                      const v = r.latest?.areas.get(area);
                      return v == null ? "–" : <span className={v < 50 ? "text-[#c46a00]" : ""}>{v}%</span>;
                    },
                  })),
                  {
                    id: "date",
                    label: "Done",
                    value: (r) => (r.latest ? new Date(r.latest.at).getTime() : null),
                    render: (r) => shortDate(r.latest?.at ?? null) ?? "–",
                  },
                ]}
              />
              <p className="mt-3 text-[11px] leading-relaxed text-stone-500">
                Area columns show % of checks passed. Pain counts checks marked as painful, worth following up.
              </p>
            </ReportSection>
          </div>
        );
      }
    }
  };

  return (
    <div className="coach-deepdive-root mx-auto flex w-full min-w-0 max-w-3xl flex-col overflow-x-hidden bg-stone-50">
      <header className="coach-deepdive-no-print shrink-0 px-4 pt-4">
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/dashboard/coach"
            className="inline-flex items-center gap-1.5 py-1.5 pr-2 text-sm font-semibold text-stone-600 hover:text-stone-900"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Players
          </Link>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setBlind((b) => !b)}
              aria-pressed={blind}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm ${
                blind ? "bg-[#014421] text-white" : "border border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
              }`}
            >
              <EyeOff className="h-3.5 w-3.5" aria-hidden />
              Blind review{blind ? " on" : ""}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 shadow-sm hover:bg-stone-50"
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              Save PDF
            </button>
          </div>
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-stone-900">
          {group ? `${group.name} talent report` : groupsState.loaded && groupsState.available ? "Group not found" : "Talent report"}
        </h1>
        {(busy || group) && (
          <p className="mt-0.5 text-sm text-stone-500">
            {busy
              ? "Loading players…"
              : `${players.length} ${players.length === 1 ? "player" : "players"}${age === "all" ? "" : ` · ${age}`}`}
          </p>
        )}
      </header>

      {!groupsState.available ? (
        <p className="mx-4 mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Run supabase/migrations/20261013120000_player_groups.sql in Supabase to turn on player groups.
        </p>
      ) : groupsState.loaded && !group ? (
        <p className="mx-4 mt-4 text-sm text-stone-500">This group may have been deleted.</p>
      ) : (
        <div className="w-full flex-1 px-4 pb-32 pt-3">
          <div className="coach-deepdive-no-print -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Report">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  tab === t.id ? "bg-[#014421] text-white shadow-sm" : "border border-stone-200 bg-white text-stone-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {presentAges.length > 1 && (
            <div className="coach-deepdive-no-print mt-2 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-stone-400">Age</span>
              {(["all", ...presentAges] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setAge(g)}
                  aria-pressed={age === g}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    age === g ? "bg-[#FFA500] text-white" : "bg-white text-stone-600 ring-1 ring-stone-200"
                  }`}
                >
                  {g === "all" ? "All" : g}
                </button>
              ))}
            </div>
          )}

          <div className="mt-3 space-y-3">
            {group && (
              <p className="hidden border-b border-gray-200 pb-2 text-sm font-bold text-gray-900 print:block">
                {group.name} talent report · {TABS.find((t) => t.id === tab)?.label}
                {age === "all" ? "" : ` · ${age}`}
              </p>
            )}
            {busy ? (
              <p className="flex items-center justify-center gap-2 py-10 text-sm text-stone-500">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Loading players…
              </p>
            ) : (
              <BlindContext.Provider value={blindMap}>{content()}</BlindContext.Provider>
            )}
          </div>

          {group && (
            <div className="coach-deepdive-no-print mt-8 rounded-2xl border border-stone-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-stone-400">Manage group</p>
              {renaming != null ? (
                <div className="mt-2 flex gap-2">
                  <input
                    value={renaming}
                    onChange={(e) => setRenaming(e.target.value)}
                    maxLength={40}
                    autoFocus
                    className="min-w-0 flex-1 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm outline-none focus:border-[#014421] focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const err = await renamePlayerGroup(group.id, renaming);
                      setManageError(err);
                      if (!err) setRenaming(null);
                    }}
                    className="rounded-xl bg-[#014421] px-3 py-2 text-xs font-semibold text-white"
                  >
                    Save
                  </button>
                  <button type="button" onClick={() => setRenaming(null)} className="px-2 text-xs font-semibold text-stone-500">
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setRenaming(group.name)}
                    className="rounded-xl border border-stone-200 px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!window.confirm(`Delete ${group.name}? Players stay, they just leave the group.`)) return;
                      const err = await deletePlayerGroup(group.id);
                      if (err) setManageError(err);
                      else router.push("/dashboard/coach");
                    }}
                    className="rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                  >
                    Delete group
                  </button>
                </div>
              )}
              {manageError && <p className="mt-2 text-xs font-medium text-red-600">{manageError}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
