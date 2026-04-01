"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronDown, ChevronUp, X, UserPlus, FileText, Youtube } from "lucide-react";
import { OFFICIAL_DRILLS, DESCRIPTION_BY_DRILL_ID, type DrillRecord } from "@/data/official_drills";
import { fetchDrillsCatalogRows } from "@/lib/fetchDrillsCatalog";

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
  const videoUrl = ((db as any).video_url ?? (db as any).youtube_url ?? "").toString().trim() || undefined;
  const humanCode = (db as { drill_id?: string }).drill_id;
  return {
    id: String(db.id),
    drill_id: humanCode != null && String(humanCode).trim() ? String(humanCode).trim() : String(db.id),
    drill_name: name && String(name).trim() ? name : undefined,
    title: name && String(name).trim() ? name : "Untitled",
    category: normalizeLibraryCategory(db.category),
    focus: String(db.focus || ""),
    description: (typeof desc === "string" && desc.trim()) ? desc : "",
    goal: String(db.goal || ""),
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

function DrillDetailModal({ drill, onClose, onAssignToDay }: DrillDetailModalProps) {
  const [showDayPicker, setShowDayPicker] = useState(false);

  useEffect(() => {
    if (drill) setShowDayPicker(false);
  }, [drill]);

  if (!drill) return null;

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
        className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{drill.drill_name ?? drill.title ?? "Untitled"}</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          <div className="text-sm text-gray-700 whitespace-pre-wrap">
            {(drill.description && String(drill.description).trim()) ||
              (() => {
                const parts: string[] = [];
                if (drill.focus?.trim()) parts.push(`Focus: ${drill.focus.trim()}`);
                if (drill.goal?.trim()) parts.push(`Goal: ${drill.goal.trim()}`);
                return parts.length
                  ? parts.join(" · ")
                  : "No description available.";
              })()}
          </div>
          {drill.goal && drill.description?.trim() && (
            <p className="mt-3 text-sm text-gray-600">
              <span className="font-medium">Goal:</span> {drill.goal}
            </p>
          )}
          <p className="mt-1 text-sm text-gray-500">
            ~{drill.estimatedMinutes} min · {drill.category}
          </p>

          {((drill.pdf_url || drill.video_url || (drill as any).youtube_url)) && (
            <div className="mt-4 flex flex-wrap gap-3">
              {drill.pdf_url && (
                <a
                  href={drill.pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-medium text-[#054d2b] hover:underline"
                >
                  <FileText className="w-4 h-4" />
                  View PDF
                </a>
              )}
              {(drill.video_url || (drill as any).youtube_url) && (
                <a
                  href={drill.video_url || (drill as any).youtube_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-medium text-[#054d2b] hover:underline"
                >
                  <Youtube className="w-4 h-4" />
                  Watch Video
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
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-white transition-colors"
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

interface DrillLibraryProps {
  onAssignToDay?: (drill: DrillRecord, dayIndex: number) => void;
}

export function DrillLibrary({ onAssignToDay }: DrillLibraryProps) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [selectedDrill, setSelectedDrill] = useState<DrillRecord | null>(null);
  const [drills, setDrills] = useState<DrillRecord[]>(OFFICIAL_DRILLS);

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
          if (officialMatch?.category) {
            r = { ...r, category: officialMatch.category };
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

    const seen = new Set(matched.map(roundDrillDedupeKey));
    const out: DrillRecord[] = matched.map((d) => ({ ...d, category }));

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
    setSelectedDrill(null);
  };

  return (
    <div className="mb-6">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Drill Library</h2>
          <p className="text-sm text-gray-500 mt-0.5">Browse and assign drills by category</p>
        </div>
        <div className="divide-y divide-gray-100">
          {LIBRARY_CATEGORIES.map((category) => {
            const categoryDrills = getDrillsForCategory(category);
            const isExpanded = expandedCategory === category;

            return (
              <div key={category}>
                <button
                  type="button"
                  onClick={() =>
                    setExpandedCategory((prev) => (prev === category ? null : category))
                  }
                  className="w-full flex items-center justify-between gap-4 p-4 text-left hover:bg-gray-50 transition-colors"
                >
                  <span
                    className="font-semibold shrink-0"
                    style={{ color: "#014421" }}
                  >
                    {category}
                  </span>
                  <span className="flex items-center gap-2 shrink-0 text-sm text-gray-500">
                    <span className="flex items-center justify-end gap-1 tabular-nums">
                      <span className="min-w-[2ch] text-right">{categoryDrills.length}</span>
                      <span>drill{categoryDrills.length !== 1 ? "s" : ""}</span>
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-gray-500 shrink-0" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-500 shrink-0" />
                    )}
                  </span>
                </button>
                {isExpanded && (
                  <div className="px-4 pb-4">
                    <ul className="space-y-1">
                      {categoryDrills.length === 0 ? (
                        <li className="text-sm text-gray-400 py-2">No drills in this category yet.</li>
                      ) : (
                        categoryDrills.map((drill) => (
                          <li key={`${category}-${roundDrillDedupeKey(drill)}`}>
                            <button
                              type="button"
                              onClick={() => setSelectedDrill(drill)}
                              className="w-full text-left text-sm py-2 px-3 rounded-lg hover:bg-gray-100 text-gray-700 transition-colors"
                            >
                              {drill.drill_name ?? drill.title ?? "Untitled"}
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <DrillDetailModal
        drill={selectedDrill}
        onClose={() => setSelectedDrill(null)}
        onAssignToDay={handleAssignToDay}
      />
    </div>
  );
}
