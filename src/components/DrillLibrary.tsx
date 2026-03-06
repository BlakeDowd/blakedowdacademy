"use client";

import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, X, UserPlus } from "lucide-react";
import { OFFICIAL_DRILLS, type DrillRecord } from "@/data/official_drills";
import { createClient } from "@/lib/supabase/client";

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

/** Map DB drill to DrillRecord shape - handle various column names */
function dbToDrillRecord(db: Record<string, unknown>): DrillRecord {
  const desc = (
    db.description ??
    (db as any).drill_description ??
    (db as any).content ??
    (db as any).instructions ??
    ""
  ) as string;
  return {
    id: String(db.id),
    drill_id: String(db.id),
    title: String(db.title || "Untitled"),
    category: String(db.category || "Practice"),
    focus: String(db.focus || ""),
    description: (typeof desc === "string" && desc.trim()) ? desc : undefined,
    goal: String(db.goal || ""),
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
          <h3 className="text-lg font-semibold text-gray-900">{drill.title}</h3>
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
            {drill.description || "No description available."}
          </div>
          {drill.goal && (
            <p className="mt-3 text-sm text-gray-600">
              <span className="font-medium">Goal:</span> {drill.goal}
            </p>
          )}
          <p className="mt-1 text-sm text-gray-500">
            ~{drill.estimatedMinutes} min · {drill.category}
          </p>

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

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient();
        const { data: dbDrills } = await supabase
          .from("drills")
          .select("id, title, category, description, focus, goal, estimated_minutes, estimatedMinutes, pdf_url, video_url");
        if (dbDrills && dbDrills.length > 0) {
          const dbById = new Map<string, DrillRecord>();
          const dbByTitle = new Map<string, DrillRecord>();
          dbDrills.forEach((d) => {
            const rec = dbToDrillRecord(d);
            dbById.set(d.id, rec);
            if (d.title) dbByTitle.set(d.title.trim().toLowerCase(), rec);
          });
          const merged: DrillRecord[] = OFFICIAL_DRILLS.map((d) => {
            const db = dbById.get(d.id)
              ?? dbById.get((d as any).drill_id)
              ?? (d.title ? dbByTitle.get(d.title.trim().toLowerCase()) : undefined);
            if (db) {
              const desc = db.description && String(db.description).trim() ? db.description : d.description;
              return { ...d, ...db, id: d.id, drill_id: (d as any).drill_id || db.id, description: (desc && String(desc).trim()) ? desc : undefined } as DrillRecord;
            }
            return d;
          });
          const dbOnly = dbDrills
            .filter((d) => !OFFICIAL_DRILLS.some((o) =>
              o.id === d.id || (o as any).drill_id === d.id || (o.title?.trim().toLowerCase() === d.title?.trim().toLowerCase())
            ))
            .map((d) => dbToDrillRecord(d));
          setDrills([...merged, ...dbOnly]);
        }
      } catch (e) {
        console.warn("DrillLibrary: Could not load drills from database", e);
      }
    };
    load();
  }, []);

  function getDrillsForCategory(category: string): DrillRecord[] {
    return drills.filter((d) => {
      const mapped = DRILL_TO_LIBRARY[d.category];
      return mapped?.includes(category) ?? false;
    });
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
            const drills = getDrillsForCategory(category);
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
                      <span className="min-w-[2ch] text-right">{drills.length}</span>
                      <span>drill{drills.length !== 1 ? "s" : ""}</span>
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
                      {drills.length === 0 ? (
                        <li className="text-sm text-gray-400 py-2">No drills in this category yet.</li>
                      ) : (
                        drills.map((drill) => (
                          <li key={drill.id}>
                            <button
                              type="button"
                              onClick={() => setSelectedDrill(drill)}
                              className="w-full text-left text-sm py-2 px-3 rounded-lg hover:bg-gray-100 text-gray-700 transition-colors"
                            >
                              {drill.title}
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
