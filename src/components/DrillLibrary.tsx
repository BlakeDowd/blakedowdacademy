"use client";

import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { ChevronDown, ChevronUp, X, UserPlus, FileText, Youtube, Search, Star, ListChecks, Plus, Pencil, Trash2 } from "lucide-react";
import {
  createDrillList,
  deleteDrillList,
  dismissDrillCollectionsError,
  drillInKeys,
  renameDrillList,
  useDrillCollections,
} from "@/hooks/useDrillCollections";
import { DrillListPicker, FavouriteButton, NewListInput } from "@/components/drills/DrillCollectionsUi";
import { OFFICIAL_DRILLS, DESCRIPTION_BY_DRILL_ID, type DrillRecord } from "@/data/official_drills";
import { fetchDrillsCatalogRows } from "@/lib/fetchDrillsCatalog";
import { keepElementInView } from "@/hooks/useKeepInView";
import { SHOW_PDFS } from "@/lib/drillResources";
import DrillScoringPicker from "@/components/DrillScoringPicker";
import { DrillGuide, DrillHero, DrillSteps } from "@/components/drills/DrillIntro";
import { stableDrillKey } from "@/lib/drillPersonalBests";
import { resolveDrillScoring } from "@/lib/drillScoring";
import { runnerDrillKey } from "@/lib/drillRunners";
import { realVideoUrl } from "@/lib/videoLinks";
import { bunnyVideoIdForDrill } from "@/lib/bunnyStream";
import DrillBunnyVideo from "@/components/DrillBunnyVideo";
import { drillScoringOverride, useDrillScoringOverrides } from "@/lib/drillScoringOverrides";

const LIBRARY_CATEGORIES = [
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

const DRILL_TO_LIBRARY: Record<string, string[]> = {
  "Mental/Strategy": ["Mental/Strategy"],
  Driving: ["Driving"],
  Irons: ["Irons"],
  Wedges: ["Wedges"],
  Chipping: ["Chipping"],
  Bunkers: ["Bunkers"],
  Putting: ["Putting"],
  "9-Hole Round": ["9-Hole Round"],
  "18-Hole Round": ["18-Hole Round"],
};

/** Normalize DB category strings so library sections match (case / minor variants). */
function normalizeLibraryCategory(cat: unknown): string {
  if (cat == null || !String(cat).trim()) return "Practice";
  const s = String(cat).trim();
  const key = s.toLowerCase();
  const aliases: Record<string, string> = {
    putting: "Putting",
    driving: "Driving",
    irons: "Irons",
    wedges: "Wedges",
    chipping: "Chipping",
    bunkers: "Bunkers",
    "mental/strategy": "Mental/Strategy",
    "mental strategy": "Mental/Strategy",
    "9-hole round": "9-Hole Round",
    "18-hole round": "18-Hole Round",
    "9 hole round": "9-Hole Round",
    "18 hole round": "18-Hole Round",
  };
  return aliases[key] ?? s;
}

/** UUID shape (DB id) — not a CSV drill code */
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Which library accordion a drill belongs in. Uses drill_id prefix (9HOL-/18HO-) and
 * official list so DB rows with wrong category (e.g. On-Course) still show under 9/18 Hole Round.
 */
function librarySectionKeyForDrill(d: DrillRecord): string | null {
  const code = String(d.drill_id ?? "").trim().toUpperCase();
  if (code.startsWith("9HOL-")) return "9-Hole Round";
  if (code.startsWith("18HO-")) return "18-Hole Round";

  const c = normalizeLibraryCategory(d.category);
  if (DRILL_TO_LIBRARY[c]) return c;

  const n = (d.drill_name ?? d.title ?? "").trim().toLowerCase();
  if (n) {
    const match = OFFICIAL_DRILLS.find(
      (o) => (o.drill_name ?? o.title ?? "").trim().toLowerCase() === n
    );
    if (match?.category === "9-Hole Round" || match?.category === "18-Hole Round") {
      return match.category;
    }
  }
  return null;
}

function drillBelongsInLibraryCategory(d: DrillRecord, category: string): boolean {
  const section = librarySectionKeyForDrill(d);
  if (section === category) return true;
  const c = normalizeLibraryCategory(d.category);
  return DRILL_TO_LIBRARY[c]?.includes(category) ?? false;
}

function roundDrillDedupeKey(d: DrillRecord): string {
  const code = String(d.drill_id ?? "").trim();
  if (code && !UUID_LIKE.test(code)) return code.toLowerCase();
  const name = (d.drill_name ?? d.title ?? "").trim().toLowerCase();
  if (name) return `name:${name}`;
  return `id:${d.id}`;
}

function roundOfficialDedupeKey(o: (typeof OFFICIAL_DRILLS)[number]): string {
  const code = (o as { drill_id?: string }).drill_id;
  if (code && String(code).trim()) return String(code).trim().toLowerCase();
  return `id:${o.id}`;
}

/** Map DB drill to DrillRecord - supports both drill_name/title and description (Supabase columns) */
function dbToDrillRecord(db: Record<string, unknown>): DrillRecord {
  const name = (db.drill_name ?? (db as any).title ?? "") as string;
  const desc = (
    (db as any).description ??
    (db as any).drill_description ??
    (db as any).content ??
    (db as any).instructions ??
    ""
  ) as string;
  const pdfUrl = ((db as any).pdf_url ?? "").toString().trim() || undefined;
  const videoUrl = realVideoUrl((db as any).video_url ?? (db as any).youtube_url);
  const humanCode = (db as { drill_id?: string }).drill_id;
  return {
    id: String(db.id),
    drill_id: humanCode != null && String(humanCode).trim() ? String(humanCode).trim() : String(db.id),
    drill_name: name && String(name).trim() ? name : undefined,
    title: name && String(name).trim() ? name : "Untitled",
    category: normalizeLibraryCategory(db.category),
    focus: String(db.focus || ""),
    description: (typeof desc === "string" && desc.trim()) ? desc : "",
    goal: String(db.goal_reps || db.goal || ""),
    score_type: String(db.score_type ?? "").trim() || undefined,
    pdf_url: pdfUrl,
    video_url: videoUrl,
    estimatedMinutes: Number(db.estimated_minutes ?? (db as any).estimatedMinutes ?? 10),
    xpValue: 10,
    contentType: "text",
  };
}

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface DrillDetailModalProps {
  drill: DrillRecord | null;
  onClose: () => void;
  onAssignToDay: (drill: DrillRecord, dayIndex: number) => void;
}

function DrillScoringRow({ drill }: { drill: DrillRecord }) {
  const drillKey = stableDrillKey(drill);
  const coachScoreType = drillScoringOverride(useDrillScoringOverrides(), drillKey);
  const scoring = resolveDrillScoring({
    override: coachScoreType ?? drill.score_type,
    goalText: drill.goal,
    focus: drill.focus,
    title: drill.drill_name ?? drill.title,
    category: drill.category,
  });
  if (runnerDrillKey(drill)) return null;
  return (
    <div className="mt-3">
      <DrillScoringPicker drillKey={drillKey} scoring={scoring} hasOverride={coachScoreType != null} />
    </div>
  );
}

function DrillDetailModal({ drill, onClose, onAssignToDay }: DrillDetailModalProps) {
  const [showDayPicker, setShowDayPicker] = useState(false);

  useEffect(() => {
    if (drill) setShowDayPicker(false);
  }, [drill]);

  if (!drill) return null;

  const bunnyVideoId = bunnyVideoIdForDrill(drill);

  const handleAssign = (dayIndex: number) => {
    onAssignToDay(drill, dayIndex);
    setShowDayPicker(false);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-1 space-y-3 overflow-y-auto p-3">
          <DrillHero
            title={drill.drill_name ?? drill.title ?? "Untitled"}
            kicker={`${drill.category} drill`}
            chips={[
              `${drill.estimatedMinutes} min`,
              ...(drill.xpValue ? [`${drill.xpValue} XP`] : []),
              ...(drill.focus?.trim() ? [drill.focus.trim()] : []),
            ]}
            category={drill.category}
            action={
              <div className="flex items-center gap-1.5">
                <FavouriteButton drill={drill} onDark />
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full bg-white/15 p-1.5 text-white transition-colors hover:bg-white/25"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            }
          />

          {drill.description?.trim() ? (
            <DrillSteps description={drill.description} />
          ) : (
            <p className="rounded-2xl bg-gray-50 p-3 text-sm text-gray-500">No description available.</p>
          )}

          {drill.goal?.trim() && (
            <DrillGuide title="Goal" defaultOpen>
              {drill.goal}
            </DrillGuide>
          )}
          <DrillScoringRow drill={drill} />
          <DrillListPicker drill={drill} />

          {bunnyVideoId && <DrillBunnyVideo videoId={bunnyVideoId} />}

          {(((SHOW_PDFS && drill.pdf_url) || (!bunnyVideoId && (drill.video_url || (drill as any).youtube_url)))) && (
            <div className="flex flex-wrap gap-2">
              {!bunnyVideoId && (drill.video_url || (drill as any).youtube_url) && (
                <a
                  href={drill.video_url || (drill as any).youtube_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50"
                >
                  <Youtube className="h-5 w-5 text-red-600" />
                  Watch video
                </a>
              )}
              {SHOW_PDFS && drill.pdf_url && (
                <a
                  href={drill.pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50"
                >
                  <FileText className="h-5 w-5" />
                  View PDF
                </a>
              )}
            </div>
          )}

          {showDayPicker && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-sm font-medium text-gray-700 mb-3">Assign to day</p>
              <div className="grid grid-cols-2 gap-2">
                {DAY_NAMES.map((dayName, dayIndex) => (
                  <button
                    key={dayName}
                    type="button"
                    onClick={() => handleAssign(dayIndex)}
                    className="py-2.5 px-3 rounded-lg border-2 border-gray-200 hover:border-[#014421] hover:bg-green-50 text-sm font-medium text-gray-700 transition-colors"
                  >
                    {dayName}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="p-4 border-t border-gray-200">
          {!showDayPicker ? (
            <button
              onClick={() => setShowDayPicker(true)}
              className="w-full flex items-center justify-center gap-2 py-4 px-4 rounded-2xl text-base font-bold text-white shadow-md transition-colors"
              style={{ backgroundColor: "#014421" }}
            >
              <UserPlus className="w-5 h-5" />
              Assign to Day
            </button>
          ) : (
            <button
              onClick={() => setShowDayPicker(false)}
              className="w-full py-2.5 px-4 rounded-xl font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DrillRow({ drill, sub, onOpen }: { drill: DrillRecord; sub?: string; onOpen: () => void }) {
  return (
    <div className="flex items-center gap-1 rounded-lg pr-1 transition-colors hover:bg-gray-100">
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 px-3 py-2 text-left text-sm text-gray-700">
        {drill.drill_name ?? drill.title ?? "Untitled"}
        {sub && <span className="block text-[11px] text-gray-400">{sub}</span>}
      </button>
      <FavouriteButton drill={drill} />
    </div>
  );
}

function DrillRows({ drills, onOpen, keyPrefix = "" }: { drills: DrillRecord[]; onOpen: (d: DrillRecord) => void; keyPrefix?: string }) {
  return (
    <ul className="space-y-1">
      {drills.map((drill) => (
        <li key={`${keyPrefix}-${roundDrillDedupeKey(drill)}`}>
          <DrillRow drill={drill} onOpen={() => onOpen(drill)} />
        </li>
      ))}
    </ul>
  );
}

function LibrarySection({
  title,
  icon,
  count,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  icon?: ReactNode;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="scroll-mt-4">
      <button
        type="button"
        onClick={(e) => {
          const section = e.currentTarget.parentElement;
          onToggle();
          keepElementInView(section);
        }}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between gap-4 p-4 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="flex min-w-0 items-center gap-2 font-semibold" style={{ color: "#014421" }}>
          {icon}
          <span className="truncate">{title}</span>
        </span>
        <span className="flex items-center gap-2 shrink-0 text-sm text-gray-500">
          <span className="flex items-center justify-end gap-1 tabular-nums">
            <span className="min-w-[2ch] text-right">{count}</span>
            <span>drill{count !== 1 ? "s" : ""}</span>
          </span>
          {expanded ? <ChevronUp className="w-5 h-5 text-gray-500 shrink-0" /> : <ChevronDown className="w-5 h-5 text-gray-500 shrink-0" />}
        </span>
      </button>
      {expanded && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

/** Rename / delete controls at the top of an open list. */
function ListToolbar({ listId, name }: { listId: string; name: string }) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (renaming) {
    return (
      <form
        className="mb-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void renameDrillList(listId, draft);
          setRenaming(false);
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={60}
          autoFocus
          aria-label="List name"
          className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-[#014421]"
        />
        <button type="submit" disabled={!draft.trim()} className="rounded-xl bg-[#014421] px-3 text-xs font-semibold text-white disabled:opacity-40">
          Save
        </button>
        <button type="button" onClick={() => setRenaming(false)} className="text-xs font-semibold text-gray-500">
          Cancel
        </button>
      </form>
    );
  }

  return (
    <div className="mb-2 flex items-center gap-3 text-xs font-semibold">
      <button
        type="button"
        onClick={() => {
          setDraft(name);
          setRenaming(true);
        }}
        className="flex items-center gap-1 text-gray-500 hover:text-gray-800"
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden />
        Rename
      </button>
      {confirmDelete ? (
        <span className="flex items-center gap-2">
          <button type="button" onClick={() => void deleteDrillList(listId)} className="text-red-600 hover:underline">
            Delete &ldquo;{name}&rdquo;?
          </button>
          <button type="button" onClick={() => setConfirmDelete(false)} className="text-gray-500">
            Keep
          </button>
        </span>
      ) : (
        <button type="button" onClick={() => setConfirmDelete(true)} className="flex items-center gap-1 text-gray-500 hover:text-red-600">
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          Delete list
        </button>
      )}
    </div>
  );
}

interface DrillLibraryProps {
  onAssignToDay?: (drill: DrillRecord, dayIndex: number) => void;
  showHeader?: boolean;
  /** Opens this drill (by drill_id or id) once the catalog has loaded, e.g. from a coach assignment link. */
  initialDrillKey?: string | null;
}

export function DrillLibrary({ onAssignToDay, showHeader = true, initialDrillKey = null }: DrillLibraryProps) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [selectedDrill, setSelectedDrill] = useState<DrillRecord | null>(null);
  const [drills, setDrills] = useState<DrillRecord[]>(OFFICIAL_DRILLS);
  const [dismissedInitialKey, setDismissedInitialKey] = useState<string | null>(null);
  const initialKey = initialDrillKey?.trim().toLowerCase() || null;
  const initialDrill = useMemo(() => {
    if (!initialKey) return null;
    return (
      drills.find(
        (d) =>
          String(d.drill_id ?? "").trim().toLowerCase() === initialKey ||
          String(d.id).trim().toLowerCase() === initialKey,
      ) ?? null
    );
  }, [initialKey, drills]);
  const shownDrill = selectedDrill ?? (initialKey !== dismissedInitialKey ? initialDrill : null);
  const closeDrill = () => {
    setSelectedDrill(null);
    setDismissedInitialKey(initialKey);
  };

  const loadDrillsFromDb = useCallback(async () => {
    try {
      const dbDrills = await fetchDrillsCatalogRows();
      if (dbDrills.length > 0) {
        const officialByDrillCode = new Map<string, (typeof OFFICIAL_DRILLS)[number]>();
        const officialById = new Map(OFFICIAL_DRILLS.map((o) => [o.id, o]));
        const officialByName = new Map<string, (typeof OFFICIAL_DRILLS)[number]>();
        for (const o of OFFICIAL_DRILLS) {
          const code = (o as { drill_id?: string }).drill_id;
          if (code && String(code).trim()) {
            officialByDrillCode.set(String(code).trim().toLowerCase(), o);
          }
          const n = (o.drill_name ?? o.title ?? "").trim().toLowerCase();
          if (n) officialByName.set(n, o);
        }

        const fromDb = dbDrills.map((d: any) => {
          let r = dbToDrillRecord(d);
          const rawCode = String(d.drill_id ?? "").trim().toLowerCase();
          const nameKey = (r.drill_name ?? r.title ?? "").trim().toLowerCase();
          const officialMatch =
            (rawCode ? officialByDrillCode.get(rawCode) : undefined) ??
            (nameKey ? officialByName.get(nameKey) : undefined) ??
            officialById.get(r.id);
          if (officialMatch) {
            // Keep the official code so scores and coach scoring line up with the practice planner's drill cards.
            r = {
              ...r,
              category: officialMatch.category || r.category,
              drill_id: rawCode ? r.drill_id : officialMatch.drill_id || r.drill_id,
              focus: r.focus || officialMatch.focus,
              goal: r.goal || officialMatch.goal,
              score_type: r.score_type ?? officialMatch.score_type,
            };
          }
          return r;
        });

        const enriched: DrillRecord[] = fromDb.map((r) => {
          if ((r.description || "").trim()) return r;
          const codeKey = String(r.drill_id ?? "").trim().toLowerCase();
          const official =
            officialByDrillCode.get(codeKey) ??
            officialById.get(r.id) ??
            (r.drill_name ?? r.title
              ? officialByName.get((r.drill_name ?? r.title ?? "").trim().toLowerCase())
              : undefined);
          const fallbackDesc =
            official?.description?.trim() ??
            DESCRIPTION_BY_DRILL_ID[r.id] ??
            DESCRIPTION_BY_DRILL_ID[(r as { drill_id?: string }).drill_id ?? ""];
          if (fallbackDesc) return { ...r, description: fallbackDesc };
          return r;
        });
        const fromDbById = new Map(enriched.map((r) => [r.id, r]));
        const fromDbByName = new Map(
          enriched.map((r) => [(r.drill_name ?? r.title ?? "").trim().toLowerCase(), r])
        );
        const combined: DrillRecord[] = [...enriched];
        OFFICIAL_DRILLS.forEach((d) => {
          const oid = (d as { drill_id?: string }).drill_id;
          const byId =
            fromDbById.has(d.id) ||
            (!!oid &&
              enriched.some(
                (row) => String(row.drill_id ?? "").toLowerCase() === String(oid).toLowerCase()
              ));
          const byName = (d.drill_name ?? d.title)
            ? fromDbByName.has((d.drill_name ?? d.title ?? "").trim().toLowerCase())
            : false;
          if (!byId && !byName) {
            const desc = (d.description || "").trim() || DESCRIPTION_BY_DRILL_ID[(d as any).drill_id];
            combined.push(desc ? { ...d, description: desc } : d);
          }
        });
        setDrills(combined);
      } else {
        const withDescriptions = OFFICIAL_DRILLS.map((d) => {
          const desc = (d.description || "").trim() || DESCRIPTION_BY_DRILL_ID[(d as any).drill_id];
          return desc ? { ...d, description: desc } : d;
        });
        setDrills(withDescriptions);
      }
    } catch (e) {
      console.warn("DrillLibrary: Could not load drills from database", e);
      const withDescriptions = OFFICIAL_DRILLS.map((d) => {
        const desc = (d.description || "").trim() || DESCRIPTION_BY_DRILL_ID[(d as any).drill_id];
        return desc ? { ...d, description: desc } : d;
      });
      setDrills(withDescriptions);
    }
  }, []);

  useEffect(() => {
    void loadDrillsFromDb();
  }, [loadDrillsFromDb]);

  useEffect(() => {
    const onRefresh = () => void loadDrillsFromDb();
    window.addEventListener("drillLibraryRefresh", onRefresh);
    return () => window.removeEventListener("drillLibraryRefresh", onRefresh);
  }, [loadDrillsFromDb]);

  function getDrillsForCategory(category: string): DrillRecord[] {
    const matched = drills.filter((d) => drillBelongsInLibraryCategory(d, category));

    if (category !== "9-Hole Round" && category !== "18-Hole Round") {
      return matched;
    }

    const seen = new Set<string>();
    const out: DrillRecord[] = [];

    for (const d of matched) {
      const k = roundDrillDedupeKey(d);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ ...d, category });
    }

    for (const o of OFFICIAL_DRILLS) {
      if (o.category !== category) continue;
      const k = roundOfficialDedupeKey(o);
      if (seen.has(k)) continue;
      seen.add(k);
      const oid = (o as { drill_id?: string }).drill_id;
      out.push({
        ...o,
        drill_id: oid && String(oid).trim() ? String(oid).trim() : o.id,
        drill_name: o.drill_name ?? o.title,
        title: o.title ?? o.drill_name ?? "Untitled",
        category,
        description:
          (o.description && o.description.trim()) ||
          DESCRIPTION_BY_DRILL_ID[oid ?? ""] ||
          "",
        focus: o.focus ?? "",
        goal: o.goal ?? "",
        estimatedMinutes: o.estimatedMinutes ?? 10,
        xpValue: o.xpValue ?? 10,
        contentType: o.contentType ?? "text",
      });
    }

    return out;
  }

  const handleAssignToDay = (drill: DrillRecord, dayIndex: number) => {
    onAssignToDay?.(drill, dayIndex);
    closeDrill();
  };

  const collections = useDrillCollections();
  const hasCollections = collections.userId != null && collections.status === "ready";
  const [query, setQuery] = useState("");
  const [creatingList, setCreatingList] = useState(false);
  const q = query.trim().toLowerCase();

  const uniqueDrills = useMemo(() => {
    const seen = new Set<string>();
    return drills.filter((d) => {
      const k = roundDrillDedupeKey(d);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [drills]);

  const searchResults = useMemo(() => {
    if (!q) return [];
    const words = q.split(/\s+/);
    return uniqueDrills
      .filter((d) => {
        const text = [d.drill_name ?? d.title, d.category, d.focus].join(" ").toLowerCase();
        return words.every((w) => text.includes(w));
      })
      .sort((a, b) => String(a.drill_name ?? a.title).localeCompare(String(b.drill_name ?? b.title)));
  }, [q, uniqueDrills]);

  const favouriteDrills = uniqueDrills.filter((d) => drillInKeys(collections.favourites, d));

  return (
    <div className="mb-6">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        {showHeader && (
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Drill Library</h2>
            <p className="text-sm text-gray-500 mt-0.5">Search drills, save favourites and build your own lists</p>
          </div>
        )}
        <div className="border-b border-gray-200 p-3">
          <label className="flex items-center gap-2 rounded-xl bg-gray-100 px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search drills"
              aria-label="Search drills"
              className="min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} className="rounded-full p-0.5 text-gray-400 hover:text-gray-600" aria-label="Clear search">
                <X className="h-4 w-4" aria-hidden />
              </button>
            )}
          </label>
          {collections.error && (
            <p className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              {collections.error}
              <button type="button" onClick={dismissDrillCollectionsError} className="font-semibold underline">
                OK
              </button>
            </p>
          )}
        </div>

        {q ? (
          <div className="p-3">
            <p className="px-1 pb-2 text-xs font-semibold text-gray-500">
              {searchResults.length} drill{searchResults.length === 1 ? "" : "s"} found
            </p>
            {searchResults.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-400">No drills match &ldquo;{query.trim()}&rdquo;.</p>
            ) : (
              <ul className="space-y-1">
                {searchResults.map((drill) => (
                  <li key={roundDrillDedupeKey(drill)}>
                    <DrillRow drill={drill} sub={drill.category} onOpen={() => setSelectedDrill(drill)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {hasCollections && (
              <>
                <p className="bg-gray-50 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">My drills</p>
                <LibrarySection
                  title="Favourites"
                  icon={<Star className="h-4 w-4 text-[#FFA500]" fill="currentColor" aria-hidden />}
                  count={favouriteDrills.length}
                  expanded={expandedCategory === "fav"}
                  onToggle={() => setExpandedCategory((p) => (p === "fav" ? null : "fav"))}
                >
                  {favouriteDrills.length === 0 ? (
                    <p className="py-2 text-sm text-gray-400">
                      Tap the star on any drill to save it here. Favourites come up more often when we build your practice plans.
                    </p>
                  ) : (
                    <DrillRows drills={favouriteDrills} onOpen={setSelectedDrill} />
                  )}
                </LibrarySection>
                {collections.lists.map((list) => {
                  const listDrills = list.drillKeys
                    .map((k) => uniqueDrills.find((d) => drillInKeys([k], d)))
                    .filter((d): d is DrillRecord => d != null);
                  const key = `list:${list.id}`;
                  return (
                    <LibrarySection
                      key={list.id}
                      title={list.name}
                      icon={<ListChecks className="h-4 w-4 text-[#014421]" aria-hidden />}
                      count={listDrills.length}
                      expanded={expandedCategory === key}
                      onToggle={() => setExpandedCategory((p) => (p === key ? null : key))}
                    >
                      <ListToolbar listId={list.id} name={list.name} />
                      {listDrills.length === 0 ? (
                        <p className="py-2 text-sm text-gray-400">Open any drill and tap this list under &ldquo;Save to a list&rdquo; to add it.</p>
                      ) : (
                        <DrillRows drills={listDrills} onOpen={setSelectedDrill} />
                      )}
                    </LibrarySection>
                  );
                })}
                <div className="px-4 py-3">
                  {creatingList ? (
                    <NewListInput
                      autoFocus
                      onCreate={async (name) => {
                        const id = await createDrillList(name);
                        setCreatingList(false);
                        if (id) setExpandedCategory(`list:${id}`);
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCreatingList(true)}
                      className="flex items-center gap-1.5 text-sm font-semibold text-[#014421] hover:underline"
                    >
                      <Plus className="h-4 w-4" aria-hidden />
                      New list
                    </button>
                  )}
                </div>
                <p className="bg-gray-50 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">All drills</p>
              </>
            )}
            {LIBRARY_CATEGORIES.map((category) => {
              const categoryDrills = getDrillsForCategory(category);
              return (
                <LibrarySection
                  key={category}
                  title={category}
                  count={categoryDrills.length}
                  expanded={expandedCategory === category}
                  onToggle={() => setExpandedCategory((p) => (p === category ? null : category))}
                >
                  {categoryDrills.length === 0 ? (
                    <p className="py-2 text-sm text-gray-400">No drills in this category yet.</p>
                  ) : (
                    <DrillRows drills={categoryDrills} onOpen={setSelectedDrill} keyPrefix={category} />
                  )}
                </LibrarySection>
              );
            })}
          </div>
        )}
      </div>

      <DrillDetailModal
        drill={shownDrill}
        onClose={closeDrill}
        onAssignToDay={handleAssignToDay}
      />
    </div>
  );
}
