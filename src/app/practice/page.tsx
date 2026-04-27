"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useStats } from "@/contexts/StatsContext";
import { useAuth } from "@/contexts/AuthContext";
import { Sparkles, Calendar, Clock, Home, Target, Flag, FlagTriangleRight, Check, CheckCircle2, PlayCircle, FileText, BookOpen, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, ExternalLink, Download, X, RefreshCw, Pencil, File } from "lucide-react";
import { OFFICIAL_DRILLS, DESCRIPTION_BY_DRILL_ID, type DrillRecord } from "@/data/official_drills";
import DrillCard, { type FacilityType } from "@/components/DrillCard";
import { AIPlayerInsights } from "@/components/AIPlayerInsights";
import { DrillLibrary } from "@/components/DrillLibrary";
import { getBenchmarkGoals } from "@/app/stats/page";
import {
  fetchDrillsCatalogRows,
  fetchDrillRowById,
} from "@/lib/fetchDrillsCatalog";
import {
  COMBINE_CATEGORY_IDS,
  COMBINE_TEST_CARDS,
  type CombineCategoryId,
} from "@/lib/combineTestsCatalog";
import {
  buildAcademyCombinesLeaderboard,
  type CombineLeaderboardTestId,
} from "@/lib/academyCombinesLeaderboard";

type RoundType = '9-hole' | '18-hole' | null;

interface DayPlan {
  dayIndex: number;
  dayName: string;
  selected: boolean;
  availableTime: number; // in minutes
  selectedFacilities: FacilityType[]; // Multi-select
  roundType: RoundType;
  drills: Array<{
    id: string;
    title: string;
    category: string;
    estimatedMinutes: number;
    isSet?: boolean; // For recurring sets
    setCount?: number; // Number of times to repeat
    facility?: FacilityType; // Which facility this drill is for
    completed?: boolean; // Completion status
    xpEarned?: number; // XP earned for this drill
    isRound?: boolean; // Flag to identify round cards
    contentType?: 'video' | 'pdf' | 'text'; // Content type for display
    source?: string; // Source URL or content
    description?: string; // Description for text-based drills
    drill_id?: string; // Drill code for lookup (e.g. PUTT-GATE-001)
    pdf_url?: string; // PDF resource URL
    youtube_url?: string; // YouTube video URL
    video_url?: string; // Video URL (alias)
    levels?: Array<{ id: string; name: string; completed?: boolean }>; // Drill levels/checklist
    goal?: string; // Goal/Reps for this drill
    /** Set when this row was loaded from a `practice` table completion (one row per log). */
    practiceLogId?: string;
    isCombine?: boolean;
    combineHref?: string;
    combineLogType?: string;
  }>;
  date?: string; // Date this plan was generated
}

interface WeeklyPlan {
  [key: number]: DayPlan;
}

interface Drill {
  id: string;
  drill_id?: string;
  title: string;
  drill_name?: string; // Matches Supabase column drill_name
  category: string;
  sub_category?: string;
  focus?: string;
  estimatedMinutes: number;
  xpValue: number;
  contentType?: 'video' | 'pdf' | 'text';
  source?: string;
  description?: string; // Matches Supabase column description
  video_url?: string;
  pdf_url?: string;
  youtube_url?: string;
  drill_levels?: any;
  levels?: Array<{ id: string; name: string; completed?: boolean }>;
  goal?: string;
  isCombine?: boolean;
  combineHref?: string;
  combineLogType?: string;
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_ABBREVIATIONS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Catalog rows often omit duration; scheduling still needs a block length to fill slider time. */
const DEFAULT_DRILL_DURATION_MINUTES = 30;
const MIN_DRILL_SCHEDULE_BLOCK_MINUTES = 15;
const MAX_DRILLS_PER_FACILITY_SLOT = 48;

function durationMinutesForScheduling(drill: Drill): number {
  const n = Number((drill as { estimatedMinutes?: unknown }).estimatedMinutes);
  if (Number.isFinite(n) && n > 0) return Math.min(Math.round(n), 240);
  return DEFAULT_DRILL_DURATION_MINUTES;
}

/** Prefer drills not yet scheduled in this block; randomize among ties so we don't repeat one drill. */
function pickDrillForRemainingTime(
  pool: Drill[],
  usedIds: Set<string>,
  minutesLeft: number,
): { drill: Drill; est: number } | null {
  const fitting: { drill: Drill; est: number }[] = [];
  for (const drill of pool) {
    const est = durationMinutesForScheduling(drill);
    if (est > 0 && est <= minutesLeft) {
      fitting.push({ drill, est });
    }
  }
  if (fitting.length === 0) return null;
  const unused = fitting.filter((x) => !usedIds.has(x.drill.id));
  const pickFrom = unused.length > 0 ? unused : fitting;
  return pickFrom[Math.floor(Math.random() * pickFrom.length)] ?? null;
}

/** Calendar date in the user's local timezone (matches `selected_date` / planner `date`). */
function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Weekly planner slots are keyed 0–6 (Mon–Sun). localStorage kept slider state without a week id,
 * so "Tuesday" could show last week's 55m. Reset slots whose `date` is missing or not in this week.
 */
function sanitizeWeeklyPlanToCurrentWeek(plan: WeeklyPlan, weekMonday: Date): void {
  const weekStartStr = toLocalDateString(weekMonday);
  const sunday = new Date(weekMonday);
  sunday.setDate(weekMonday.getDate() + 6);
  const weekEndStr = toLocalDateString(sunday);

  for (let idx = 0; idx <= 6; idx++) {
    const day = plan[idx];
    if (!day) continue;

    const ds = day.date;
    const inWeek = !!(ds && ds >= weekStartStr && ds <= weekEndStr);
    if (inWeek) continue;

    const slotDate = new Date(weekMonday);
    slotDate.setDate(weekMonday.getDate() + idx);
    plan[idx] = {
      dayIndex: idx,
      dayName: DAY_NAMES[idx],
      selected: false,
      availableTime: 0,
      selectedFacilities: [],
      roundType: null,
      drills: [],
      date: toLocalDateString(slotDate),
    };
  }
}

// Map Stats categories to Drill categories
const categoryMapping: Record<string, string[]> = {
  'Putting': ['Putting'],
  'Driving': ['Driving', 'Tee'],
  'Short Game': ['Short Game', 'Wedge Play', 'Chipping', 'Bunkers'],
  'Approach': ['Irons', 'Skills', 'Full Swing'],
  'Sand Play': ['Short Game', 'Wedge Play', 'Bunkers'],
  'Chipping': ['Short Game', 'Wedge Play', 'Chipping'],
  'Irons': ['Irons', 'Skills', 'Full Swing'],
  'Wedges': ['Wedge Play', 'Skills'],
  'Bunkers': ['Short Game', 'Wedge Play', 'Bunkers'],
  'Mental/Strategy': ['Mental Game', 'Skills', 'Strategy'],
};

// Map facility types to compatible drill categories and sub-categories
interface CategoryFilter {
  category: string;
  sub_category?: string;
  focus?: string;
}

const facilityDrillMapping: Record<FacilityType, CategoryFilter[]> = {
  'Driving': [{ category: 'Driving' }, { category: 'Tee' }],
  'Irons': [{ category: 'Irons' }], // Only map to Irons
  'Wedges': [{ category: 'Wedges' }, { category: 'Wedge Play' }],
  'Chipping': [{ category: 'Chipping' }, { category: 'Short Game' }],
  'Bunkers': [{ category: 'Bunkers' }, { category: 'Short Game' }],
  'Putting': [{ category: 'Putting' }],
  'Mental/Strategy': [{ category: 'Mental Game' }, { category: 'Strategy' }],
  'On-Course': [{ category: 'On Course' }, { category: 'On-Course' }],
};

// XP Tiering based on Pillar
const pillarXPTiering: Record<string, number> = {
  'Skills': 50,
  'Wedge Play': 75,
  'Putting': 50,
  'Driving': 75,
  'Tee': 75,
  'Irons': 60,
  'Full Swing': 60,
  'Short Game': 60,
  'Chipping': 60,
  'Bunkers': 60,
  'On-Course': 500, // High XP for on-course practice
  'Mental Game': 100, // Higher XP for mental game
  'Strategy': 100,
};

// Facility display info
const facilityInfo: Record<FacilityType, { label: string; icon: any }> = {
  'Driving': { label: 'Driving', icon: Target },
  'Irons': { label: 'Irons', icon: Target },
  'Wedges': { label: 'Wedges', icon: Flag },
  'Chipping': { label: 'Chipping', icon: Flag },
  'Bunkers': { label: 'Bunkers', icon: FlagTriangleRight },
  'Putting': { label: 'Putting', icon: Flag },
  'Mental/Strategy': { label: 'Mental/Strategy', icon: BookOpen },
  'On-Course': { label: 'On-Course', icon: FlagTriangleRight },
};

// All facility types (excluding On-Course, handled separately in UI)
const ALL_FACILITIES: FacilityType[] = ['Driving', 'Irons', 'Wedges', 'Chipping', 'Bunkers', 'Putting', 'Mental/Strategy'];

type PlannerCombineTask = {
  id: string;
  title: string;
  category: string;
  estimatedMinutes: number;
  href: string;
  logType?: string;
};

const COMBINE_CATEGORY_TO_PLANNER_CATEGORY: Record<CombineCategoryId, string> = {
  Putting: "Putting",
  Chipping: "Chipping",
  Wedges: "Wedges",
  Irons: "Irons",
  "Tee Shot": "Driving",
  Bunkers: "Bunkers",
};

const COMBINE_HREF_TO_LOG_TYPE: Record<string, string> = {
  "/practice/gauntlet-precision-protocol": "gauntlet_protocol_session",
  "/practice/strike-and-speed-control-test": "strike_speed_control",
  "/practice/start-line-and-speed-control-test": "start_line_speed_test",
  "/practice/flop-shot-combine": "flop_shot",
  "/practice/standard-chipping-combine": "chipping",
  "/practice/survival-20": "survival_20",
  "/practice/3-strikes-wedge-challenge": "three_strikes",
  "/practice/iron-precision-protocol": "iron_precision_protocol",
  "/practice/iron-face-control-protocol": "iron_face_control",
  "/practice/bunker-proximity-protocol": "bunker_protocol",
  "/combines/iron-skills": "iron_skills",
};

const COMBINE_HREF_TO_LEADERBOARD_TEST: Partial<Record<string, CombineLeaderboardTestId>> = {
  "/practice/gauntlet-precision-protocol": "gauntlet",
  "/practice/iron-precision-protocol": "ironPrecisionProtocol",
  "/practice/6ft-aimpoint-combine": "aimpoint_6ft_combine",
  "/practice/8-20ft-aimpoint-combine": "slope_mid_20ft",
  "/practice/aimpoint-long-range-2040": "aimpoint_long_40ft",
  "/practice/chipping-combine-9": "chipping_combine_9",
  "/practice/wedge-lateral-9": "wedge_lateral_9",
  "/practice/putting-test": "puttingCombine",
  "/practice/putting-test-9": "puttingTest9Holes",
  "/practice/putting-test-3-6ft": "puttingTest3To6ft",
  "/practice/putting-test-8-20ft": "puttingTest8To20",
  "/practice/putting-test-20-40ft": "puttingTest20To40",
  "/practice/flop-shot-combine": "flop_shot",
  "/practice/standard-chipping-combine": "chipping",
  "/practice/survival-20": "survival_20",
  "/practice/iron-face-control-protocol": "iron_face_control",
  "/practice/3-strikes-wedge-challenge": "three_strikes",
  "/practice/bunker-proximity-protocol": "bunker_protocol",
};

const COMBINE_HREF_TO_EST_MINUTES: Record<string, number> = {
  "/practice/gauntlet-precision-protocol": 20,
  "/practice/putting-test": 30,
  "/practice/putting-test-9": 20,
  "/practice/putting-test-3-6ft": 20,
  "/practice/putting-test-8-20ft": 20,
  "/practice/putting-test-20-40ft": 20,
  "/practice/6ft-aimpoint-combine": 15,
  "/practice/8-20ft-aimpoint-combine": 20,
  "/practice/aimpoint-long-range-2040": 20,
  "/practice/strike-and-speed-control-test": 15,
  "/practice/start-line-and-speed-control-test": 15,
  "/practice/chipping-combine-9": 20,
  "/practice/flop-shot-combine": 15,
  "/practice/standard-chipping-combine": 15,
  "/practice/low-chip-combine": 15,
  "/practice/wedge-lateral-9": 20,
  "/practice/survival-20": 20,
  "/practice/3-strikes-wedge-challenge": 15,
  "/practice/iron-precision-protocol": 20,
  "/practice/iron-face-control-protocol": 20,
  "/practice/bunker-proximity-protocol": 15,
  "/combines/iron-skills": 20,
  "/practice/tee-shot-dispersion-combine": 20,
  "/practice/bunker-9-hole-challenge": 20,
};

const PLANNER_COMBINE_TASKS: PlannerCombineTask[] = COMBINE_TEST_CARDS.map((card) => ({
  id: `combine:${card.id}`,
  title: card.label,
  category: COMBINE_CATEGORY_TO_PLANNER_CATEGORY[card.category],
  estimatedMinutes: COMBINE_HREF_TO_EST_MINUTES[card.href] ?? 20,
  href: card.href,
  logType: COMBINE_HREF_TO_LOG_TYPE[card.href],
}));

function toPlannerCombineDrill(task: PlannerCombineTask): Drill {
  return {
    id: task.id,
    drill_id: task.id,
    title: task.title,
    category: task.category,
    estimatedMinutes: task.estimatedMinutes,
    xpValue: task.estimatedMinutes * 10,
    isCombine: true,
    combineHref: task.href,
    combineLogType: task.logType,
    description: "Complete and submit this combine to auto-complete the planner task.",
  };
}

function plannerCombineFromDrillId(drillId: string | null | undefined): PlannerCombineTask | null {
  if (!drillId) return null;
  return PLANNER_COMBINE_TASKS.find((c) => c.id === drillId) ?? null;
}

import { logActivity } from "@/lib/activity";
import { addProfileXp } from "@/lib/addProfileXp";

async function updateUserXP(userId: string, points: number): Promise<void> {
  await addProfileXp(userId, points);
}

export default function PracticePage() {
  const router = useRouter();
  const { rounds, refreshPracticeSessions, refreshDrills, practiceLogs, practiceSessions } = useStats();
  const { user, refreshUser } = useAuth();
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlan>({});
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [drills, setDrills] = useState<Drill[]>([]);
  const [mostNeededCategory, setMostNeededCategory] = useState<string>('Putting');
  const [generatedPlan, setGeneratedPlan] = useState<WeeklyPlan | null>(null);
  const [xpNotification, setXpNotification] = useState<{ show: boolean; amount: number }>({ show: false, amount: 0 });
  const [expandedDrill, setExpandedDrill] = useState<string | null>(null); // Track which drill is expanded
  const [durationModal, setDurationModal] = useState<{ open: boolean; facility: FacilityType | null }>({ open: false, facility: null });
  const [coachInsightsExpanded, setCoachInsightsExpanded] = useState<boolean>(false);
  const [freestyleExpanded, setFreestyleExpanded] = useState<boolean>(false);
  const [drillLibraryExpanded, setDrillLibraryExpanded] = useState<boolean>(false);
  const [combineTestsExpanded, setCombineTestsExpanded] = useState<boolean>(false);
  const [onCourseConfirm, setOnCourseConfirm] = useState<{ open: boolean; duration: number; label: string }>({
    open: false,
    duration: 0,
    label: '',
  });
  const [clearDrillConfirm, setClearDrillConfirm] = useState<{
    open: boolean;
    dayIndex: number | null;
    drillIndex: number | null;
    drillTitle: string;
  }>({
    open: false,
    dayIndex: null,
    drillIndex: null,
    drillTitle: '',
  });
  const [totalPracticeMinutes, setTotalPracticeMinutes] = useState<number>(0);
  const [scheduleExpanded, setScheduleExpanded] = useState<boolean>(false); // Weekly schedule expanded state
  // SINGLE DAY VIEW: Initialize to today's day index
  const getTodayDayIndex = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    return dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Convert Sunday=0 to Monday=0
  };
  const [currentDayView, setCurrentDayView] = useState<number>(getTodayDayIndex()); // Current day index for single-day view (0-6, Monday-Sunday)
  const [viewMode, setViewMode] = useState<'day' | 'weekly'>('day'); // Toggle between Day View and Weekly Summary
  const [swappingDrill, setSwappingDrill] = useState<{ dayIndex: number; drillIndex: number } | null>(null); // Track which drill is being swapped
  const [swapSuccess, setSwapSuccess] = useState<{ dayIndex: number; drillIndex: number } | null>(null); // Track successful swap for feedback
  const [expandedScheduleDrill, setExpandedScheduleDrill] = useState<{ dayIndex: number; drillIndex: number } | null>(null); // Track expanded drill in schedule
  const [expandedWeeklyDrill, setExpandedWeeklyDrill] = useState<{ dayIndex: number; drillIndex: number } | null>(null); // Track expanded drill in weekly view
  const [youtubeModal, setYoutubeModal] = useState<{ open: boolean; url: string }>({ open: false, url: '' }); // YouTube modal state
  const [combineCategoryTab, setCombineCategoryTab] = useState<CombineCategoryId>("Putting");
  const combineCardsForTab = useMemo(
    () => COMBINE_TEST_CARDS.filter((c) => c.category === combineCategoryTab),
    [combineCategoryTab]
  );

  const combineBestByPlannerDrillId = useMemo(() => {
    const out = new Map<string, string>();
    if (!user?.id) return out;

    const profileMap = new Map<string, { full_name?: string; preferred_icon_id?: string; xp?: number }>();
    profileMap.set(user.id, { full_name: "You" });

    for (const task of PLANNER_COMBINE_TASKS) {
      const leaderboardTest = COMBINE_HREF_TO_LEADERBOARD_TEST[task.href];
      if (leaderboardTest) {
        const rows = buildAcademyCombinesLeaderboard(
          leaderboardTest,
          practiceSessions,
          practiceLogs,
          profileMap,
          "allTime",
          user.id,
        );
        const mine = rows.find((r) => r.userId === user.id);
        if (mine?.scoreDisplay) out.set(task.id, mine.scoreDisplay);
        continue;
      }

      if (task.logType) {
        const best = (practiceLogs || [])
          .filter(
            (r: any) =>
              r?.user_id === user.id &&
              String(r?.log_type ?? "").trim().toLowerCase() === task.logType?.toLowerCase(),
          )
          .map((r: any) => Number(r?.score ?? r?.total_points))
          .filter((n: number) => Number.isFinite(n))
          .sort((a: number, b: number) => b - a)[0];
        if (Number.isFinite(best)) out.set(task.id, `${Math.round(best)} pts`);
      }
    }

    return out;
  }, [practiceLogs, practiceSessions, user?.id]);

  // Name editing state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  
  // Force full_name: Fetch from profiles.full_name ONLY
  // Use state + useEffect to avoid hydration mismatch (user loads client-side only)
  const [userName, setUserName] = useState('');
  useEffect(() => {
    if (user?.fullName) {
      setUserName(user.fullName);
    } else if (user?.email) {
      setUserName(user.email);
    } else {
      setUserName('');
    }
  }, [user?.fullName, user?.email]);
  
  // Handle name editing
  const handleEditName = () => {
    setEditedName(userName);
    setIsEditingName(true);
  };
  
  const handleSaveName = async () => {
    if (!user?.id || !editedName.trim()) {
      setIsEditingName(false);
      return;
    }

    const newName = editedName.trim();
    setIsSavingName(true);
    
    try {
      // Update in Supabase using full_name (snake_case) to match database schema
      // Force: ONLY use full_name column
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      
      // Update the specific user's profile using their auth.uid() as the id
      const { data, error } = await supabase
        .from('profiles')
        .update({ full_name: newName })
        .eq('id', user.id)
        .select();

      if (error && (error.code === 'PGRST116' || error.message?.includes('No rows'))) {
        // Create profile if it doesn't exist
        const { error: createError } = await supabase
          .from('profiles')
          .insert({
            id: user.id,
            full_name: newName,
            created_at: new Date().toISOString(),
          })
          .select();
        
        if (createError) {
          console.error('Error creating profile:', createError);
          alert('Failed to create profile. Please try again.');
          setIsSavingName(false);
          return;
        }
      } else if (error) {
        console.error('Error updating full_name:', error);
        alert(`Failed to update name: ${error.message || 'Unknown error'}`);
        setIsSavingName(false);
        return;
      }

      // Refresh user context to sync across app
      if (refreshUser) {
        await refreshUser();
      }
      
      setIsEditingName(false);
      window.location.reload(); // Force refresh to update name everywhere
    } catch (error) {
      console.error('Error saving name:', error);
      alert('Failed to update name. Please try again.');
    } finally {
      setIsSavingName(false);
    }
  };
  
  const handleCancelEdit = () => {
    setIsEditingName(false);
    setEditedName('');
  };
  
  /** Freestyle practice: max logged minutes per calendar day (XP matches academy: 10 XP per 10 min). */
  const FREESTYLE_DAILY_CAP_MINUTES = 10 * 60;

  const freestyleDurationOptions: number[] = [15, 30, 45, 60, 90, 120];

  const freestyleXpForMinutes = (minutes: number) => Math.floor(minutes / 10) * 10;

  // Initialize weekly plan and load from database (DATA JOIN: practice table + drills table)
  useEffect(() => {
    const loadWeeklySchedule = async () => {
      if (typeof window === 'undefined' || !user?.id) {
        // Initialize to empty - no days selected by default
        setWeeklyPlan({});
        return;
      }

      try {
        // SIMPLIFY THE FETCH: Fetch from practice table first using .select('*')
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        
        // Get current week's date range
        const today = new Date();
        const currentDay = today.getDay();
        const monday = new Date(today);
        monday.setDate(today.getDate() - (currentDay === 0 ? 6 : currentDay - 1));
        monday.setHours(0, 0, 0, 0);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);

        // SIMPLIFY THE FETCH: Fetch practice schedule from practice table (completed drills)
        const { data: practiceData, error } = await supabase
          .from('practice')
          .select('*')
          .eq('user_id', user.id)
          .gte('completed_at', monday.toISOString())
          .lte('completed_at', sunday.toISOString())
          .order('completed_at', { ascending: true });

        // FETCH PLANNED DRILLS from user_drills
        const weekStartLocal = toLocalDateString(monday);
        const weekEndLocal = toLocalDateString(sunday);

        const { data: userDrillsData } = await supabase
          .from('user_drills')
          .select('*')
          .eq('user_id', user.id)
          .gte('selected_date', weekStartLocal)
          .lte('selected_date', weekEndLocal);

        // FIX LINE 338: Handle error gracefully without crashing
        if (error) {
          console.warn('Practice schedule fetch warning:', error.message || 'Unknown error');
          // Continue with empty schedule instead of crashing
        }

        // Initialize plan structure from localStorage
        const loadedPlan: WeeklyPlan = {};
        if (typeof window !== 'undefined') {
          const savedPlans = localStorage.getItem('weeklyPracticePlans');
          if (savedPlans) {
            try {
              const parsedPlans = JSON.parse(savedPlans);
              if (Object.keys(parsedPlans).length > 0) {
                Object.assign(loadedPlan, parsedPlans);
              }
            } catch (e) {
              console.error('Error parsing localStorage plans:', e);
            }
          }
        }

        sanitizeWeeklyPlanToCurrentWeek(loadedPlan, monday);

        // Do NOT pre-populate all days - only load what's in the database or stay empty

        // CROSS-REFERENCE: Fetch drill details from drills table and match by title
        if ((practiceData && practiceData.length > 0) || (userDrillsData && userDrillsData.length > 0)) {
          const allDrillsData = await fetchDrillsCatalogRows();

          const drillDetailsMap: Record<string, any> = {};
          
          if (typeof OFFICIAL_DRILLS !== 'undefined') {
            OFFICIAL_DRILLS.forEach((drill: any) => {
              if (drill.id) drillDetailsMap[drill.id] = drill;
              const name = drill.drill_name ?? drill.title;
              if (name) drillDetailsMap[name.toLowerCase().trim()] = drill;
            });
          }

          if (allDrillsData && allDrillsData.length > 0) {
            (allDrillsData as any[]).forEach((drill: any) => {
              if (drill.id) {
                drillDetailsMap[drill.id] = drillDetailsMap[drill.id] 
                  ? { ...drillDetailsMap[drill.id], ...drill } 
                  : drill;
              }
              const name = drill.drill_name ?? drill.title;
              if (name) {
                const key = String(name).toLowerCase().trim();
                drillDetailsMap[key] = drillDetailsMap[key]
                  ? { ...drillDetailsMap[key], ...drill }
                  : drill;
              }
            });
          }

          // Add planned drills from user_drills to loadedPlan
          if (userDrillsData && userDrillsData.length > 0) {
            userDrillsData.forEach((plannedDrill: any) => {
              const targetDate = new Date(plannedDrill.selected_date + 'T12:00:00');
              const dayOfWeek = targetDate.getDay();
              const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
              
              // Create day only when we have DB data for it (no pre-population)
              if (!loadedPlan[dayIndex]) {
                loadedPlan[dayIndex] = {
                  dayIndex,
                  dayName: DAY_NAMES[dayIndex],
                  selected: false,
                  availableTime: 0,
                  selectedFacilities: [],
                  roundType: null,
                  drills: [],
                  date: plannedDrill.selected_date,
                };
              }
              const dayPlan = loadedPlan[dayIndex];
              if (plannedDrill.selected_date) {
                dayPlan.date = plannedDrill.selected_date;
              }

              const combineTask = plannerCombineFromDrillId(plannedDrill.drill_id);
              if (combineTask) {
                const dayDrills = dayPlan.drills ?? [];
                const existingIndex = dayDrills.findIndex((d: any) => d?.id === combineTask.id);
                if (existingIndex === -1) {
                  dayPlan.selected = true;
                  dayPlan.drills = dayDrills;
                  dayPlan.drills.push({
                    ...toPlannerCombineDrill(combineTask),
                    completed: false,
                  });
                }
                return;
              }

              const drillDetails = drillDetailsMap[plannedDrill.drill_id];
              
              if (drillDetails) {
                let levels = null;
                if (drillDetails.drill_levels) {
                  try {
                    levels = typeof drillDetails.drill_levels === 'string' 
                      ? JSON.parse(drillDetails.drill_levels)
                      : drillDetails.drill_levels;
                    if (Array.isArray(levels)) {
                      levels = levels.map((level: any, idx: number) => ({
                        id: level.id || `level-${idx}`,
                        name: level.name || level,
                        completed: false
                      }));
                    }
                  } catch (e) {
                    console.warn('Error parsing drill_levels:', e);
                  }
                }

                const dayDrills = dayPlan.drills ?? [];
                const existingIndex = dayDrills.findIndex((d: any) => d?.id === plannedDrill.drill_id);
                if (existingIndex === -1) {
                  dayPlan.selected = true;
                  dayPlan.drills = dayDrills;
                  const desc = (drillDetails.description && String(drillDetails.description).trim()) || DESCRIPTION_BY_DRILL_ID[plannedDrill.drill_id] || undefined;
                  dayPlan.drills.push({
                    id: plannedDrill.drill_id,
                    drill_id: plannedDrill.drill_id,
                    title: drillDetails.drill_name ?? drillDetails.title ?? "Untitled",
                    category: drillDetails.category,
                    estimatedMinutes: drillDetails.estimatedMinutes || 30,
                    completed: false,
                    pdf_url: drillDetails.pdf_url,
                    youtube_url: drillDetails.video_url ?? drillDetails.youtube_url,
                    video_url: drillDetails.video_url ?? drillDetails.youtube_url,
                    description: desc,
                    levels: levels || undefined,
                  });
                }
              }
            });
          }

          // MAP THE DATA: Map practice data to weekly plan with cross-referenced drill data
          if (practiceData) {
            practiceData.forEach((practice: any) => {
            const practiceDate = new Date(practice.completed_at);
            const dayOfWeek = practiceDate.getDay();
            const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Convert Sunday=0 to Monday=0
            const completedDateStr = toLocalDateString(practiceDate);

            // Create day only when we have DB data for it (no pre-population)
            if (!loadedPlan[dayIndex]) {
              loadedPlan[dayIndex] = {
                dayIndex,
                dayName: DAY_NAMES[dayIndex],
                selected: false,
                availableTime: 0,
                selectedFacilities: [],
                roundType: null,
                drills: [],
                date: completedDateStr,
              };
            } else if (!loadedPlan[dayIndex].date || loadedPlan[dayIndex].date !== completedDateStr) {
              loadedPlan[dayIndex].date = completedDateStr;
            }

            // CROSS-REFERENCE: Prefer drill_id for matching (stable; spelling changes don't break old logs)
            let drillDetails: any = null;
            const matchId = practice.drill_id || practice.type;
            if (matchId) {
              drillDetails = drillDetailsMap[matchId] ?? drillDetailsMap[(matchId as string).toLowerCase().trim()];
            }
            if (!drillDetails) {
              const matchTitle = (practice.type || practice.drill_name || practice.title || '').toString().toLowerCase().trim();
              if (matchTitle) drillDetails = drillDetailsMap[matchTitle];
            }

            // MAP THE DATA: Parse drill_levels if it's a JSON string
            let levels = null;
            if (drillDetails?.drill_levels) {
              try {
                levels = typeof drillDetails.drill_levels === 'string' 
                  ? JSON.parse(drillDetails.drill_levels)
                  : drillDetails.drill_levels;
                if (Array.isArray(levels)) {
                  levels = levels.map((level: any, idx: number) => ({
                    id: level.id || `level-${idx}`,
                    name: level.name || level,
                    completed: level.completed || false
                  }));
                }
              } catch (e) {
                console.warn('Error parsing drill_levels:', e);
              }
            }

            // MAP THE DATA: Attach video_url, pdf_url, and drill_levels to drill object
            const generatedDrillId = drillDetails?.id || practice.drill_id || `practice-${practice.id}`;
            const drillTitle = drillDetails?.drill_name ?? drillDetails?.title ?? practice.drill_name ?? practice.type ?? practice.title ?? 'Practice Session';
            const isCompleted = practice.completed || false;
            const dayPlanRef = loadedPlan?.[dayIndex];
            const logId =
              practice.id !== undefined && practice.id !== null
                ? String(practice.id)
                : undefined;

            if (!dayPlanRef?.drills) return;

            // One UI row per `practice` row: update by log id, or merge into an unclaimed planned slot, or push.
            let existingDrillIndex = logId
              ? dayPlanRef.drills.findIndex((d) => d?.practiceLogId === logId)
              : -1;

            const applyRowFields = (idx: number) => {
              const row = dayPlanRef.drills[idx];
              row.completed = isCompleted;
              if (logId) row.practiceLogId = logId;
              row.drill_id = generatedDrillId;
              if (levels) row.levels = levels;
              if (drillDetails?.pdf_url || practice.pdf_url) {
                row.pdf_url = drillDetails?.pdf_url || practice.pdf_url;
              }
              if (drillDetails?.video_url || practice.youtube_url || practice.video_url) {
                row.youtube_url = drillDetails?.video_url || practice.youtube_url || practice.video_url;
              }
              if (drillDetails?.description != null) {
                row.description = drillDetails.description;
              }
            };

            if (existingDrillIndex >= 0) {
              applyRowFields(existingDrillIndex);
            } else {
              existingDrillIndex = dayPlanRef.drills.findIndex(
                (d) =>
                  !d?.practiceLogId &&
                  (d?.drill_id === generatedDrillId || d?.id === generatedDrillId)
              );
              if (existingDrillIndex >= 0) {
                applyRowFields(existingDrillIndex);
              } else {
                dayPlanRef.drills.push({
                  id: logId ? `p-${logId}` : generatedDrillId,
                  drill_id: generatedDrillId,
                  practiceLogId: logId,
                  title: drillTitle,
                  category: drillDetails?.category || practice.category || 'Practice',
                  estimatedMinutes:
                    drillDetails?.estimatedMinutes || practice.estimatedMinutes || 30,
                  completed: isCompleted,
                  pdf_url: drillDetails?.pdf_url || practice.pdf_url || undefined,
                  youtube_url:
                    drillDetails?.video_url || practice.youtube_url || practice.video_url || undefined,
                  description: drillDetails?.description || practice.description || undefined,
                  levels: levels || undefined,
                });
              }
            }
          });
        }
        }

        if (typeof window !== 'undefined') {
          localStorage.setItem('weeklyPracticePlans', JSON.stringify(loadedPlan));
        }

        setWeeklyPlan(loadedPlan);
      } catch (error) {
        console.error('Error loading weekly schedule:', error);
        // Fallback to localStorage
        const savedPlans = localStorage.getItem('weeklyPracticePlans');
        if (savedPlans) {
          try {
            const parsedPlans = JSON.parse(savedPlans) as WeeklyPlan;
            const today = new Date();
            const currentDay = today.getDay();
            const mondayFb = new Date(today);
            mondayFb.setDate(today.getDate() - (currentDay === 0 ? 6 : currentDay - 1));
            mondayFb.setHours(0, 0, 0, 0);
            sanitizeWeeklyPlanToCurrentWeek(parsedPlans, mondayFb);
            if (typeof window !== 'undefined') {
              localStorage.setItem('weeklyPracticePlans', JSON.stringify(parsedPlans));
            }
            setWeeklyPlan(parsedPlans);
          } catch (e) {
            console.error('Error loading saved plans:', e);
          }
        }
      }
    };

    loadWeeklySchedule();
  }, [user?.id]);

  // Fetch drills from DB + merge with OFFICIAL_DRILLS (prefers server catalog so RLS cannot hide rows)
  useEffect(() => {
    let cancelled = false;

    const loadDrills = async () => {
      if (typeof window === 'undefined') return;
      try {
        const dbDrills = await fetchDrillsCatalogRows();

        if (cancelled) return;

        const dbById = new Map<string, any>();
        const dbByName = new Map<string, any>();
        if (dbDrills?.length) {
          dbDrills.forEach((d: any) => {
            dbById.set(d.id, d);
            const name = d.drill_name ?? d.title;
            if (name && String(name).trim()) dbByName.set(String(name).trim().toLowerCase(), d);
          });
        }

        const merged: Drill[] = OFFICIAL_DRILLS.map((d: any) => {
          const db = dbById.get(d.id) ?? dbById.get(d.drill_id) ?? ((d.title || d.drill_name) ? dbByName.get((d.drill_name ?? d.title ?? '').trim().toLowerCase()) : undefined);
          const desc = (db?.description && String(db.description).trim()) || (d.description && String(d.description).trim()) || '';
          const displayName = db?.drill_name ?? db?.title ?? d.drill_name ?? d.title;
          return {
            id: d.id,
            title: displayName,
            drill_name: displayName,
            category: d.category,
            sub_category: '',
            focus: d.focus,
            estimatedMinutes: db?.estimated_minutes ?? db?.estimatedMinutes ?? d.estimatedMinutes,
            xpValue: d.xpValue,
            contentType: d.contentType,
            source: db?.video_url || db?.pdf_url || d.video_url || d.youtube_url || d.pdf_url || desc || '',
            description: desc,
            pdf_url: db?.pdf_url ?? d.pdf_url,
            youtube_url: db?.video_url ?? d.youtube_url ?? d.video_url,
            goal: db?.goal ?? d.goal,
          };
        });

        const dbOnly = dbDrills?.filter((d: any) =>
          !OFFICIAL_DRILLS.some((o: any) => {
            const oName = (o.drill_name ?? o.title ?? '').trim().toLowerCase();
            const dName = (d.drill_name ?? d.title ?? '').trim().toLowerCase();
            return o.id === d.id || (o as any).drill_id === d.id || (oName && oName === dName);
          })
        ) ?? [];
        const dbOnlyMapped: Drill[] = dbOnly.map((d: any) => ({
          id: d.id,
          title: d.drill_name ?? d.title,
          drill_name: d.drill_name ?? d.title,
          category: d.category,
          sub_category: '',
          focus: d.focus || '',
          estimatedMinutes: d.estimated_minutes ?? d.estimatedMinutes ?? 10,
          xpValue: 10,
          contentType: 'text' as const,
          source: d.video_url || d.pdf_url || (d.description || ''),
          description: (d.description && String(d.description).trim()) || '',
          pdf_url: d.pdf_url,
          youtube_url: d.video_url,
          goal: d.goal || '',
        }));

        const fetchedDrills = [...merged, ...dbOnlyMapped];
        setDrills(fetchedDrills);
        localStorage.setItem('drillsData', JSON.stringify(fetchedDrills));
      } catch (err) {
        if (cancelled) return;
        console.error('Error loading drills:', err);
        const fallback = OFFICIAL_DRILLS.map((d: any) => ({
          id: d.id,
          title: d.title,
          category: d.category,
          sub_category: '',
          focus: d.focus,
          estimatedMinutes: d.estimatedMinutes,
          xpValue: d.xpValue,
          contentType: d.contentType,
          source: d.video_url || d.youtube_url || d.pdf_url || d.description || '',
          description: d.description || '',
          pdf_url: d.pdf_url,
          youtube_url: d.youtube_url || d.video_url,
          goal: d.goal,
        }));
        setDrills(fallback);
      }
    };

    void loadDrills();
    const onLibraryRefresh = () => void loadDrills();
    window.addEventListener('drillLibraryRefresh', onLibraryRefresh);
    return () => {
      cancelled = true;
      window.removeEventListener('drillLibraryRefresh', onLibraryRefresh);
    };
  }, []);

  // Calculate most needed improvement (similar to Stats page)
  useEffect(() => {
    if (rounds.length === 0) {
      setMostNeededCategory('Putting');
      return;
    }

    // Calculate averages
    let totalGIR = 0;
    let totalHoles = 0;
    let totalFIR = 0;
    let totalFIRShots = 0;
    let totalUpAndDown = 0;
    let totalUpAndDownOpps = 0;
    let totalPutts = 0;

    rounds.forEach(round => {
      const firShots = round.firLeft + round.firHit + round.firRight;
      if (firShots > 0) {
        totalFIR += (round.firHit / firShots) * 100;
        totalFIRShots++;
      }
      totalGIR += round.totalGir;
      totalHoles += round.holes || 18;
      totalUpAndDown += round.upAndDownConversions;
      totalUpAndDownOpps += round.upAndDownConversions + round.missed;
      totalPutts += round.totalPutts;
    });

    const averages = {
      gir: totalHoles > 0 ? (totalGIR / totalHoles) * 100 : 0,
      fir: totalFIRShots > 0 ? totalFIR / totalFIRShots : 0,
      upAndDown: totalUpAndDownOpps > 0 ? (totalUpAndDown / totalUpAndDownOpps) * 100 : 0,
      putts: rounds.length > 0 ? totalPutts / rounds.length : 0,
    };

    const goals = {
      gir: 50,
      fir: 55,
      upAndDown: 45,
      putts: 32,
    };

    // Check for priority: Missed < 6ft
    const lastRound = rounds[rounds.length - 1];
    if (lastRound && (lastRound.puttsUnder6ftAttempts - lastRound.made6ftAndIn) > 2) {
      setMostNeededCategory('Putting');
      return;
    }

    // Find biggest gap
    const gaps = [
      { category: 'Irons', gap: goals.gir - averages.gir },
      { category: 'Driving', gap: goals.fir - averages.fir },
      { category: 'Chipping', gap: goals.upAndDown - averages.upAndDown },
      { category: 'Putting', gap: averages.putts - goals.putts },
    ];

    const biggestGap = gaps.reduce((max, current) => 
      current.gap > max.gap ? current : max
    );

    setMostNeededCategory(biggestGap.category);
  }, [rounds]);

  const toggleDay = (dayIndex: number) => {
    setSelectedDay(dayIndex);
    setWeeklyPlan(prev => {
      const existing = prev?.[dayIndex];
      const base = existing && typeof existing.dayIndex === 'number'
        ? existing
        : { dayIndex, dayName: DAY_NAMES[dayIndex], selected: false, availableTime: 0, selectedFacilities: [] as FacilityType[], roundType: null as RoundType, drills: [] };
      // Pure toggle: if selected, turn off; if not, turn on
      return {
        ...prev,
        [dayIndex]: { ...base, selected: !(prev?.[dayIndex]?.selected ?? false) },
      };
    });
  };

  const updateTime = (dayIndex: number, minutes: number) => {
    const cleanMinutes = Math.max(0, parseInt(minutes.toString(), 10) || 0);
    setWeeklyPlan(prev => {
      const existing = prev[dayIndex];
      const base = existing && typeof existing.dayIndex === 'number'
        ? existing
        : { dayIndex, dayName: DAY_NAMES[dayIndex], selected: !!existing?.selected, availableTime: 0, selectedFacilities: (existing?.selectedFacilities ?? []) as FacilityType[], roundType: (existing?.roundType ?? null) as RoundType, drills: existing?.drills ?? [] };
      return { ...prev, [dayIndex]: { ...base, availableTime: cleanMinutes } };
    });
  };

  const toggleFacility = (dayIndex: number, facilityType: FacilityType) => {
    setWeeklyPlan(prev => {
      const dayData = prev[dayIndex];
      if (!dayData) return prev;
      const currentFacilities = dayData.selectedFacilities || [];
      const isSelected = currentFacilities.includes(facilityType);
      const newFacilities = isSelected
        ? currentFacilities.filter(f => f !== facilityType)
        : [...currentFacilities, facilityType];
      const currentTime = dayData.availableTime || 0;
      const newTime = !isSelected && currentTime === 0 ? 30 : currentTime;

      return {
        ...prev,
        [dayIndex]: {
          ...dayData,
          selectedFacilities: newFacilities,
          availableTime: newTime,
        },
      };
    });
  };

  // Map drill category to FacilityType for schedule display
  const categoryToFacility = (category: string): FacilityType | undefined => {
    const map: Record<string, FacilityType> = {
      Driving: "Driving",
      Irons: "Irons",
      Wedges: "Wedges",
      Chipping: "Chipping",
      Bunkers: "Bunkers",
      Putting: "Putting",
      "Mental/Strategy": "Mental/Strategy",
      "9-Hole Round": "On-Course",
      "18-Hole Round": "On-Course",
    };
    return map[category];
  };

  const addDrillToDay = async (drill: DrillRecord, dayIndex: number) => {
    const today = new Date();
    const currentDay = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (currentDay === 0 ? 6 : currentDay - 1));
    const dayDate = new Date(monday);
    dayDate.setDate(monday.getDate() + dayIndex);
    const formattedDate = dayDate.toISOString().split("T")[0];

    const facility = categoryToFacility(drill.category);

    const desc = (drill.description && String(drill.description).trim()) || DESCRIPTION_BY_DRILL_ID[(drill as any).drill_id ?? drill.id] || undefined;
    const drillToAdd = {
      id: drill.id,
      drill_id: (drill as any).drill_id ?? drill.id,
      title: drill.drill_name ?? drill.title ?? "Untitled",
      category: drill.category,
      estimatedMinutes: drill.estimatedMinutes,
      completed: false,
      xpEarned: 0,
      isRound: drill.category === "9-Hole Round" || drill.category === "18-Hole Round",
      contentType: drill.contentType,
      description: desc ?? drill.description,
      pdf_url: drill.pdf_url,
      youtube_url: drill.youtube_url || drill.video_url,
      video_url: drill.video_url || drill.youtube_url,
      goal: drill.goal,
      facility,
    };

    setWeeklyPlan(prev => {
      const existing = prev?.[dayIndex] ?? {
        dayIndex,
        dayName: DAY_NAMES[dayIndex],
        selected: false,
        availableTime: 0,
        selectedFacilities: [],
        roundType: null,
        drills: [],
      };
      const updated = {
        ...prev,
        [dayIndex]: {
          ...existing,
          selected: true,
          date: formattedDate,
          drills: [...(existing.drills || []), drillToAdd],
        },
      };
      if (typeof window !== "undefined") {
        localStorage.setItem("weeklyPracticePlans", JSON.stringify(updated));
      }
      return updated;
    });

    if (user?.id) {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { error } = await supabase.from("user_drills").insert({
          user_id: user.id,
          drill_id: drill.id,
          selected_date: formattedDate,
        });
        if (error) {
          console.error("Error saving drill to day:", error);
          alert("Drill added to schedule, but failed to save to cloud. Check your connection.");
        }
      } catch (err) {
        console.error("Database error:", err);
      }
    }

    setScheduleExpanded(true);
    setCurrentDayView(dayIndex);
  };

  // Log freestyle practice session
  const logFreestylePractice = async (facility: FacilityType, duration: number) => {
    if (typeof window === 'undefined') return;

    // Safety Check: Ensure user_id is being pulled from the auth user so it knows it's me logging the session
    if (!user?.id) {
      alert('Please log in to log practice sessions.');
      setDurationModal({ open: false, facility: null });
      return;
    }

    // Daily cap: 10 hours of freestyle practice per calendar day (same XP as leaderboard: 10 XP / 10 min)
    const today = new Date().toISOString().split('T')[0];
    const dailyMinutesKey = `freestyleMinutes_${today}`;
    const currentDailyMinutes = parseInt(localStorage.getItem(dailyMinutesKey) || '0', 10) || 0;
    const remainingDailyMinutes = Math.max(0, FREESTYLE_DAILY_CAP_MINUTES - currentDailyMinutes);

    if (duration > remainingDailyMinutes) {
      if (remainingDailyMinutes <= 0) {
        alert(
          'Daily freestyle practice limit reached (10 hours/day). Complete your Roadmap drills for more XP!',
        );
      } else {
        alert(
          `You can log up to ${remainingDailyMinutes} more minutes of freestyle practice today (10 hours/day limit).`,
        );
      }
      setDurationModal({ open: false, facility: null });
      return;
    }

    const xpEarned = freestyleXpForMinutes(duration);

    // Update the Target Table: Ensure the handleSubmit function is pointing to the practice table
    // Check the Fields: Make sure the data being sent matches the table we just made: user_id, type, duration_minutes, and notes
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();

      const facilityLabel = facilityInfo[facility].label;
      const timestamp = new Date().toISOString();
      const practiceDate = timestamp.split('T')[0];

      // Target Table: In the handleSubmit or savePractice function, change the table name to practice
      // Match Columns: Ensure it is sending exactly these fields: user_id, type, duration_minutes, and notes
      const { data, error } = await supabase
        .from('practice')
        .insert({
          user_id: user.id, // Safety Check: user_id from auth user
          type: facility, // Match Columns: type field (e.g., 'home', 'range-mat', 'putting-green')
          duration_minutes: duration, // Match Columns: duration_minutes field
          notes: `${facilityLabel} Practice - ${duration} minutes`, // Match Columns: notes field
        })
        .select();

      if (error) {
        console.error('Error saving practice session:', error);
        alert('Failed to save practice session. Please try again.');
        setDurationModal({ open: false, facility: null });
        return;
      }

      // Success Log: Add console.log('Practice saved successfully') so I can see if the button is actually finishing the job
      // Remove the Alert: Delete the alert('Logged!') line - replaced with subtle XP notification toast
      console.log('Practice saved successfully:', data);

      // Log activity to database
      const hours = (duration / 60).toFixed(1).replace('.0', '');
      await logActivity(user.id, 'practice', `Practiced for ${hours} hours`);

      if (xpEarned > 0) {
        await updateUserXP(user.id, xpEarned);
        console.log(`Practice: Added ${xpEarned} XP for ${duration} minutes of practice`);
      }

      localStorage.setItem(dailyMinutesKey, String(currentDailyMinutes + duration));

      // Update total practice minutes
      const newTotalMinutes = totalPracticeMinutes + duration;
      setTotalPracticeMinutes(newTotalMinutes);
      localStorage.setItem('totalPracticeMinutes', newTotalMinutes.toString());

      // Update userProgress
      const savedProgress = localStorage.getItem('userProgress');
      const userProgress = savedProgress ? JSON.parse(savedProgress) : { 
        completedDrills: [], 
        totalXP: 0, 
        totalMinutes: 0,
        drillCompletions: {}
      };
      
      // Removed: userProgress.totalXP = (userProgress.totalXP || 0) + xpEarned;
      userProgress.totalMinutes = (userProgress.totalMinutes || 0) + duration;
      
      localStorage.setItem('userProgress', JSON.stringify(userProgress));

      // Log to activity history (for backward compatibility)
      const activityHistory = JSON.parse(localStorage.getItem('practiceActivityHistory') || '[]');
      activityHistory.push({
        id: `freestyle-${facility}-${Date.now()}-${Math.random()}`,
        type: 'practice',
        title: `${facilityLabel} Practice`,
        date: practiceDate,
        timestamp: timestamp,
        xp: xpEarned,
        duration: duration,
        facility: facility,
      });
      const recentHistory = activityHistory.slice(-100);
      localStorage.setItem('practiceActivityHistory', JSON.stringify(recentHistory));

      // Dispatch events
      window.dispatchEvent(new Event('userProgressUpdated'));
      window.dispatchEvent(new Event('practiceActivityUpdated'));

      // Live Sync: Make sure that when I (Blake) log a practice session through the app, it triggers a global refresh so everyone's updated stats appear on the leaderboard immediately
      // Force Refresh: After the supabase.from('practice').insert(...) call, add await loadStats() or await refreshStats() to make the new session appear on the leaderboard immediately
      await refreshPracticeSessions();
      
      // Also dispatch the practiceSessionsUpdated event to trigger refresh in StatsContext
      // Live Sync: This ensures all users see the updated leaderboard immediately
      window.dispatchEvent(new Event('practiceSessionsUpdated'));
      
      console.log('Practice session logged - triggering global refresh for all users');

      // Show XP notification
      setXpNotification({ show: true, amount: xpEarned });
      setTimeout(() => {
        setXpNotification({ show: false, amount: 0 });
      }, 3000);

      // Close modal
      setDurationModal({ open: false, facility: null });
    } catch (error) {
      console.error('Error in logFreestylePractice:', error);
      alert('Failed to save practice session. Please try again.');
      setDurationModal({ open: false, facility: null });
    }
  };

  const setRoundType = (dayIndex: number, roundType: RoundType) => {
    const timeInMinutes = roundType === '9-hole' ? 120 : roundType === '18-hole' ? 240 : 0;
    setWeeklyPlan(prev => {
      const existing = prev?.[dayIndex];
      const base = existing && typeof existing.dayIndex === 'number'
        ? existing
        : { dayIndex, dayName: DAY_NAMES[dayIndex], selected: !!(existing?.selected ?? false), availableTime: 0, selectedFacilities: (existing?.selectedFacilities ?? []) as FacilityType[], roundType: null as RoundType, drills: existing?.drills ?? [] };
      return {
        ...prev,
        [dayIndex]: {
          ...base,
          roundType: (base?.roundType ?? null) === roundType ? null : roundType,
          availableTime: (base?.roundType ?? null) === roundType ? (base?.availableTime ?? 0) : timeInMinutes,
        },
      };
    });
  };

  // Can generate plan: at least one selected day has time > 0 or a round.
  // Safety: use optional chaining to prevent undefined crash (e.g. e[a].selected).
  const canGeneratePlan = useMemo(() => {
    const selectedDays = Object.values(weeklyPlan).filter(day => (day?.selected ?? false));
    const totalTime = selectedDays.reduce((sum, day) => sum + (Number(day?.availableTime) || 0), 0);
    const hasSelectedRound = selectedDays.some(day => day?.roundType != null);
    const hasValidDay = totalTime > 0 || hasSelectedRound;
    const activeDayHasValidContent = selectedDay != null && (
      (weeklyPlan[selectedDay]?.availableTime ?? 0) > 0 ||
      weeklyPlan[selectedDay]?.roundType != null
    );
    return selectedDay != null && (hasValidDay || (selectedDays.length === 0 && activeDayHasValidContent));
  }, [weeklyPlan, selectedDay]);

  // Format minutes to hours and minutes
  const formatTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) {
      return `${mins}m`;
    } else if (mins === 0) {
      return `${hours}h`;
    } else {
      return `${hours}h ${mins}m`;
    }
  };

  const generatePlan = async () => {
    const newPlan: WeeklyPlan = { ...weeklyPlan };
    
    // Get all selected days; if none selected but active day has time/round, include it
    let selectedDays = Object.values(weeklyPlan).filter(day => (day?.selected ?? false));
    if (selectedDays.length === 0 && selectedDay !== null) {
      const activeDay = weeklyPlan[selectedDay];
      if (activeDay && ((activeDay.availableTime || 0) > 0 || activeDay.roundType !== null)) {
        selectedDays = [{
          ...activeDay,
          selected: true,
          dayIndex: activeDay.dayIndex ?? selectedDay,
          dayName: activeDay.dayName ?? DAY_NAMES[selectedDay],
        }];
      }
    }

    if (selectedDays.length === 0) {
      alert('Please select at least one day');
      return;
    }

    // Debug: Log current practice state before validation
    selectedDays.forEach((day) => {
      const total = day.availableTime || 0;
      const hours = Math.floor(total / 60);
      const minutes = total % 60;
      console.log('Current Practice State:', { hours, minutes, total, selectedRound: day.roundType !== null, dayName: day.dayName });
    });

    // Validation: check total time from actual input state (Object.values + Number avoids stale state)
    const practiceData: Record<number, number> = {};
    selectedDays.forEach((d, i) => { practiceData[i] = Number(d?.availableTime ?? 0); });
    const selectedRound = selectedDays.some(day => day?.roundType != null);
    if (Object.values(practiceData).every(v => Number(v) === 0) && !selectedRound) {
      alert('Please set practice time > 0 or select a round for at least one selected day');
      return;
    }
    const validDays = selectedDays.filter(day => (Number(day?.availableTime) || 0) > 0 || day?.roundType != null);
    if (validDays.length === 0) {
      alert('Please set practice time > 0 or select a round for at least one selected day');
      return;
    }

    // Only generate plans for valid days (with time > 0 or round selected)
    const daysToGenerate = validDays;

    const availablePlannerDrills: Drill[] = [
      ...drills,
      ...PLANNER_COMBINE_TASKS.map(toPlannerCombineDrill),
    ];

    // Get relevant drill categories
    const relevantCategories = categoryMapping[mostNeededCategory] || ['Putting'];
    
    // Filter drills by category
    let relevantDrills = availablePlannerDrills.filter(drill => 
      relevantCategories.some(cat => 
        (drill.category && drill.category.toLowerCase().includes(cat.toLowerCase())) ||
        (drill.category && cat.toLowerCase().includes(drill.category.toLowerCase()))
      )
    );

    // Apply XP tiering based on pillar
    relevantDrills = relevantDrills.map(drill => {
      const pillar = Object.keys(pillarXPTiering).find(p => 
        (drill.category && drill.category.toLowerCase().includes(p.toLowerCase())) ||
        (drill.category && p.toLowerCase().includes(drill.category.toLowerCase()))
      );
      const xpValue = pillar ? pillarXPTiering[pillar] : drill.xpValue;
      return { ...drill, xpValue };
    });

    // Try to find on-course challenge drills from the library first
    const libraryOnCourseChallenges: Drill[] = drills.filter(drill => 
      (drill.title && drill.title.toLowerCase().includes('ladies tee')) ||
      (drill.title && drill.title.toLowerCase().includes('alternate club')) ||
      (drill.title && drill.title.toLowerCase().includes('scrambling only')) ||
      (drill.title && drill.title.toLowerCase().includes('challenge')) ||
      (drill.title && drill.title.toLowerCase().includes('target')) ||
      (drill.title && drill.title.toLowerCase().includes('3-club')) ||
      (drill.category && drill.category.toLowerCase().includes('on-course')) ||
      (drill.category && drill.category.toLowerCase().includes('course challenge'))
    );

    // On-Course Challenge options (fallback if not found in library)
    const defaultOnCourseChallenges: Drill[] = [
      {
        id: 'challenge-ladies-tee',
        title: 'Ladies Tee Challenge',
        category: 'On-Course Challenge',
        estimatedMinutes: 0, // Will be set based on round type
        xpValue: 500,
      },
      {
        id: 'challenge-alternate-club',
        title: 'Alternate Club Round',
        category: 'On-Course Challenge',
        estimatedMinutes: 0, // Will be set based on round type
        xpValue: 500,
      },
      {
        id: 'challenge-scrambling-only',
        title: 'Scrambling Only',
        category: 'On-Course Challenge',
        estimatedMinutes: 0, // Will be set based on round type
        xpValue: 500,
      },
      {
        id: 'challenge-50-scrambling',
        title: 'Target: 50% Scrambling',
        category: 'On-Course Challenge',
        estimatedMinutes: 0, // Will be set based on round type
        xpValue: 500,
      },
      {
        id: 'challenge-3-club',
        title: 'The 3-Club Challenge',
        category: 'On-Course Challenge',
        estimatedMinutes: 0, // Will be set based on round type
        xpValue: 500,
      },
    ];

    // Use library challenges if available, otherwise use defaults
    const onCourseChallenges = libraryOnCourseChallenges.length > 0 
      ? libraryOnCourseChallenges.map(d => ({ ...d, xpValue: 500 })) // Ensure 500 XP
      : defaultOnCourseChallenges;

    // Generate plan for each valid day
    daysToGenerate.forEach(day => {
      const availableTime = day.availableTime || 0;
      const selectedFacilities = day?.selectedFacilities ?? [];
      const roundType = day.roundType;
      /** Extra block (mental) after the round — subtract from facility budgets so totals match the slider. */
      let mentalMinutesAllocated = 0;
      const allSelectedDrills: Array<Drill & { isSet?: boolean; setCount?: number; facility?: FacilityType; isRound?: boolean }> = [];

      const roundMinutes = roundType === "9-hole" ? 120 : roundType === "18-hole" ? 240 : 0;

      // If round is selected, add On-Course Challenge FIRST (regardless of availableTime)
      if (roundType) {
        const roundTime = roundMinutes;
        
        // Prefer "Alternate Club Round" for 18-hole
        let selectedChallenge;
        if (roundType === '18-hole') {
          // For 18-hole, prefer "Alternate Club Round"
          const alternateClub = onCourseChallenges.find(c => 
            c.title.toLowerCase().includes('alternate club')
          );
          selectedChallenge = alternateClub || onCourseChallenges[0];
        } else {
          // For 9-hole, prefer "Ladies Tee" or any preferred challenge
          const preferredChallenges = onCourseChallenges.filter(c => 
            c.title.toLowerCase().includes('ladies tee') ||
            c.title.toLowerCase().includes('alternate club')
          );
          selectedChallenge = preferredChallenges.length > 0
            ? preferredChallenges[Math.floor(Math.random() * preferredChallenges.length)]
            : onCourseChallenges[Math.floor(Math.random() * onCourseChallenges.length)];
        }
        
        // Ensure we have a challenge
        if (!selectedChallenge && onCourseChallenges.length > 0) {
          selectedChallenge = onCourseChallenges[0];
        }
        
        // Add the On-Course Challenge as a special drill entry with +500 XP
        if (selectedChallenge) {
          allSelectedDrills.push({
            id: `round-${day.dayIndex}-${roundType}-${selectedChallenge.id}-${Date.now()}`,
            title: `${roundType === '9-hole' ? '9-Hole' : '18-Hole'} ${selectedChallenge.title}`,
            category: 'On-Course',
            estimatedMinutes: roundTime,
            xpValue: pillarXPTiering['On-Course'] || 500, // Use XP tiering
            isRound: true, // Flag to identify this as a round
          });
        }

        // Smart Allocation: Also prioritize Mental Game drills when round is selected
        const mentalGameDrills = availablePlannerDrills.filter(drill => 
          (drill.category && drill.category.toLowerCase().includes('mental game')) ||
          (drill.category && drill.category.toLowerCase().includes('mental'))
        );
        
        if (mentalGameDrills.length > 0 && availableTime > roundTime) {
          const remainingAfterRound = availableTime - roundTime;
          const mentalGameTime = Math.min(remainingAfterRound, 30); // Add up to 30 min of mental game
          if (mentalGameTime >= 15) {
            const selectedMentalDrill = mentalGameDrills[Math.floor(Math.random() * mentalGameDrills.length)];
            if (selectedMentalDrill) {
              const drillCap =
                typeof selectedMentalDrill.estimatedMinutes === "number" &&
                Number.isFinite(selectedMentalDrill.estimatedMinutes)
                  ? selectedMentalDrill.estimatedMinutes
                  : mentalGameTime;
              const allocated = Math.min(mentalGameTime, drillCap);
              mentalMinutesAllocated = allocated;
              allSelectedDrills.push({
                ...selectedMentalDrill,
                id: `mental-${day.dayIndex}-${selectedMentalDrill.id}-${Date.now()}`,
                xpValue: pillarXPTiering['Mental Game'] || selectedMentalDrill.xpValue,
                estimatedMinutes: allocated,
              });
            }
          }
        }
      }

      // Minutes left for facility buckets after round + mental (matches slider total)
      const remainingForFacilities = Math.max(
        0,
        availableTime - roundMinutes - mentalMinutesAllocated,
      );

      // If facilities are selected, divide time equally among them (only if time > 0)
      if (selectedFacilities.length > 0 && availableTime > 0) {
        const nFac = selectedFacilities.length;
        const base = remainingForFacilities > 0 ? Math.floor(remainingForFacilities / nFac) : 0;
        const remainder = remainingForFacilities > 0 ? remainingForFacilities % nFac : 0;

        selectedFacilities.forEach((facility: FacilityType, fi: number) => {
          const timePerFacility = base + (fi < remainder ? 1 : 0);
          const compatibleCategories = facilityDrillMapping[facility] || [];
          
          // Smart Allocation: If Range (Grass) is selected, prioritize Skills and Wedge Play
          let facilityDrills;
          facilityDrills = availablePlannerDrills.filter(drill => 
            compatibleCategories.some(filter => {
              if (!drill.category || !filter.category) return false;
              const matchesCategory = drill.category.toLowerCase() === filter.category.toLowerCase();
              
              if (filter.sub_category && drill.sub_category) {
                const matchesSubCategory = drill.sub_category.toLowerCase() === filter.sub_category.toLowerCase();
                return matchesCategory && matchesSubCategory;
              } else if (filter.sub_category && !drill.sub_category) {
                 return matchesCategory; 
              }
              return matchesCategory;
            })
          );
          
          // Apply XP tiering to facility drills
          facilityDrills = facilityDrills.map(drill => {
            const pillar = Object.keys(pillarXPTiering).find(p => 
              (drill.category && drill.category.toLowerCase().includes(p.toLowerCase())) ||
              (drill.category && p.toLowerCase().includes(drill.category.toLowerCase()))
            );
            const xpValue = pillar ? pillarXPTiering[pillar] : drill.xpValue;
            return { ...drill, xpValue };
          });

          // If no compatible drills, use any drills that could work at this facility
          if (facilityDrills.length === 0) {
            facilityDrills = availablePlannerDrills.filter(drill => {
              return compatibleCategories.some(filter => {
                const categoryMatch = drill.category && filter.category && drill.category.toLowerCase() === filter.category.toLowerCase();
                const titleMatch = drill.title && filter.category && drill.title.toLowerCase().includes(filter.category.toLowerCase());
                const matchesCategory = categoryMatch || titleMatch;
                
                if (filter.sub_category && drill.sub_category) {
                  return matchesCategory && ((drill.sub_category.toLowerCase() === filter.sub_category.toLowerCase()) ||
                                            (drill.title && drill.title.toLowerCase().includes(filter.sub_category.toLowerCase())));
                }
                return matchesCategory;
              });
            });
          }

          // Select drills for this facility
          const shuffled = [...facilityDrills].sort((a, b) => {
            // Prioritize by focus if specified in the mapping
            const aHasFocus = compatibleCategories.some(f => f.focus && a.focus && a.focus.toLowerCase().includes(f.focus.toLowerCase()));
            const bHasFocus = compatibleCategories.some(f => f.focus && b.focus && b.focus.toLowerCase().includes(f.focus.toLowerCase()));
            
            if (aHasFocus && !bHasFocus) return -1;
            if (!aHasFocus && bHasFocus) return 1;
            
            // Random sort for the rest
            return Math.random() - 0.5;
          });
          const usedDrillIds = new Set<string>();
          let facilityTime = timePerFacility;
          const facilitySelectedDrills: Drill[] = [];

          while (
            facilityTime >= MIN_DRILL_SCHEDULE_BLOCK_MINUTES &&
            facilitySelectedDrills.length < MAX_DRILLS_PER_FACILITY_SLOT
          ) {
            const next = pickDrillForRemainingTime(shuffled, usedDrillIds, facilityTime);
            if (!next) break;
            usedDrillIds.add(next.drill.id);
            facilitySelectedDrills.push({
              ...next.drill,
              estimatedMinutes: next.est,
            });
            facilityTime -= next.est;
            if (
              facilitySelectedDrills.length >= 2 &&
              facilityTime < MIN_DRILL_SCHEDULE_BLOCK_MINUTES
            ) {
              break;
            }
          }
          
          // Add drills with facility assignment
          facilitySelectedDrills.forEach(drill => {
            allSelectedDrills.push({
              ...drill,
              facility: facility,
            });
          });
        });
      } else if (!roundType && availableTime > 0) {
        // No facilities selected and no round - use pillar-relevant drills; fill budget like facility path
        const shuffled = [...relevantDrills].sort(() => Math.random() - 0.5);
        const usedDrillIds = new Set<string>();
        let remainingTime = availableTime;

        while (
          remainingTime >= MIN_DRILL_SCHEDULE_BLOCK_MINUTES &&
          allSelectedDrills.length < MAX_DRILLS_PER_FACILITY_SLOT
        ) {
          const next = pickDrillForRemainingTime(shuffled, usedDrillIds, remainingTime);
          if (!next) break;
          usedDrillIds.add(next.drill.id);
          allSelectedDrills.push({
            ...next.drill,
            estimatedMinutes: next.est,
          });
          remainingTime -= next.est;
          if (allSelectedDrills.length >= 2 && remainingTime < MIN_DRILL_SCHEDULE_BLOCK_MINUTES) {
            break;
          }
        }
      }
      
      // Only update the plan if there are drills or if it's a round (rounds are always added)
      if (allSelectedDrills.length > 0 || roundType) {
        // Calculate the actual date for this dayIndex
        const today = new Date();
        const currentDay = today.getDay();
        const monday = new Date(today);
        monday.setDate(today.getDate() - (currentDay === 0 ? 6 : currentDay - 1));
        const targetDate = new Date(monday);
        targetDate.setDate(monday.getDate() + day.dayIndex);
        targetDate.setHours(12, 0, 0, 0); // Avoid timezone boundary issues
        const formattedDate = targetDate.toISOString().split('T')[0];

        // Reset all completion states when generating a new plan (session-based)
        newPlan[day.dayIndex] = {
          ...day,
          date: formattedDate,
          drills: allSelectedDrills.map(d => ({
            id: d.id,
            drill_id: (d as any).drill_id || d.id, // Stable ID for practice references; spelling fixes won't break logs
            title: d.title,
            category: d.category,
            estimatedMinutes: d.isSet ? (d.estimatedMinutes * (d.setCount || 1)) : d.estimatedMinutes,
            isSet: d.isSet,
            setCount: d.setCount,
            facility: d.facility,
            completed: false,
            xpEarned: 0,
            isRound: d.isRound || false,
            contentType: d.contentType,
            source: d.source,
            description: d.description,
            pdf_url: d.pdf_url,
            youtube_url: d.youtube_url,
            video_url: d.video_url,
            levels: d.levels,
            goal: d.goal,
            isCombine: d.isCombine,
            combineHref: d.combineHref,
            combineLogType: d.combineLogType,
          })),
        };
      }
    });

    // Full-week planner nudge: guarantee at least two combine challenge tasks.
    const isFullWeekPlan = daysToGenerate.length === 7;
    if (isFullWeekPlan) {
      let combineCount = 0;
      Object.values(newPlan).forEach((day) => {
        (day?.drills ?? []).forEach((d: DayPlan["drills"][0]) => {
          if (d?.isCombine) combineCount += 1;
        });
      });

      const needed = Math.max(0, 2 - combineCount);
      if (needed > 0) {
        const randomCombinePool = [...PLANNER_COMBINE_TASKS];
        for (let i = randomCombinePool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [randomCombinePool[i], randomCombinePool[j]] = [randomCombinePool[j], randomCombinePool[i]];
        }

        const candidateDays = daysToGenerate
          .map((d) => d.dayIndex)
          .filter((dayIndex) => {
            const rows = newPlan[dayIndex]?.drills ?? [];
            return rows.some((r) => !r.isRound);
          });

        for (let i = 0; i < needed; i++) {
          const dayIndex = candidateDays[i % candidateDays.length];
          if (dayIndex == null) break;
          const task = randomCombinePool[i % randomCombinePool.length];
          const dayRows = newPlan[dayIndex]?.drills ?? [];
          const replaceIdx = dayRows.findIndex((r) => !r.isRound && !r.isCombine);
          if (replaceIdx === -1) continue;
          dayRows[replaceIdx] = {
            ...toPlannerCombineDrill(task),
            completed: false,
            xpEarned: 0,
          };
        }
      }
    }

    // Save to user_drills table in database (non-blocking - show plan even if DB fails)
    if (user?.id) {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();

        const datesToUpdate = Object.values(newPlan)
          .filter(day => (day?.selected ?? false) && day?.date)
          .map(day => day.date!)
          .filter(Boolean);

        if (datesToUpdate.length > 0) {
          await supabase
            .from('user_drills')
            .delete()
            .eq('user_id', user.id)
            .in('selected_date', datesToUpdate);

          const drillsToInsert: any[] = [];
          Object.values(newPlan).forEach(day => {
            if ((day?.selected ?? false) && day?.date && day?.drills?.length) {
              day.drills.forEach((drill: any) => {
                drillsToInsert.push({
                  user_id: user.id,
                  drill_id: (drill as any).drill_id || drill.id,
                  selected_date: day.date,
                });
              });
            }
          });

          if (drillsToInsert.length > 0) {
            const { error } = await supabase.from('user_drills').insert(drillsToInsert);
            if (error) {
              console.error('Error inserting to user_drills:', error);
              alert('Plan generated, but failed to sync to cloud. Your plan is saved locally.');
            }
          }
        }
      } catch (error) {
        console.error('Database connection error:', error);
        alert('Plan generated, but failed to sync to cloud. Your plan is saved locally.');
      }
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem('weeklyPracticePlans', JSON.stringify(newPlan));
    }

    setGeneratedPlan(newPlan);
    setWeeklyPlan(newPlan);
  };

  // Calculate XP for a drill (10 XP per minute + bonuses)
  const calculateDrillXP = (drill: DayPlan['drills'][0], day: DayPlan): number => {
    // Combine tasks are completed by submitting the actual combine page, which already awards XP.
    if (drill.isCombine) return 0;
    // On-course challenges (rounds) always give 500 XP
    if (drill.isRound || drill.category === 'On-Course Challenge') {
      return 500;
    }
    
    // Regular drills: 10 XP per minute
    return drill.estimatedMinutes * 10;
  };

  useEffect(() => {
    if (!user?.id) return;
    if (!practiceLogs || practiceLogs.length === 0) return;

    const todayStr = toLocalDateString(new Date());
    const myTodayLogTypes = new Set(
      practiceLogs
        .filter((row: any) => {
          if (!row?.created_at || row?.user_id !== user.id) return false;
          return toLocalDateString(new Date(row.created_at)) === todayStr;
        })
        .map((row: any) => String(row?.log_type ?? "").trim().toLowerCase())
        .filter(Boolean),
    );
    if (myTodayLogTypes.size === 0) return;

    let changed = false;
    const updatedPlan: WeeklyPlan = { ...weeklyPlan };
    Object.entries(updatedPlan).forEach(([k, day]) => {
      const dayIndex = Number(k);
      if (!day || day.date !== todayStr) return;
      const nextDrills = (day.drills ?? []).map((drill: DayPlan["drills"][0]) => {
        if (!drill?.isCombine || drill.completed) return drill;
        const want = String(drill.combineLogType ?? "").trim().toLowerCase();
        if (!want || !myTodayLogTypes.has(want)) return drill;
        changed = true;
        return { ...drill, completed: true };
      });
      updatedPlan[dayIndex] = { ...day, drills: nextDrills };
    });

    if (!changed) return;
    setWeeklyPlan(updatedPlan);
    setGeneratedPlan(updatedPlan);
    if (typeof window !== "undefined") {
      localStorage.setItem("weeklyPracticePlans", JSON.stringify(updatedPlan));
    }
  }, [practiceLogs, user?.id, weeklyPlan]);

  // Mark drill as complete (session-based, repeatable)
  // Check the Submit Function: Ensure that when a drill is logged, it uses supabase.from('drill_scores').insert(...) instead of just marking it as a practice session
  const markDrillComplete = async (dayIndex: number, drillIndex: number) => {
    const day = weeklyPlan[dayIndex];
    if (!day || !day.drills[drillIndex]) return;

    const drill = day.drills[drillIndex];
    const isCurrentlyCompleted = drill.completed || false;

    // Safety Check: Ensure user_id is being pulled from the auth user
    if (!user?.id) {
      console.error('Practice: Cannot log drill - user not authenticated');
      return;
    }

    // Planner combine cards are tracking-only; XP comes from the combine submission flow itself.
    const isCombineTrackingOnly = !!drill.isCombine;

    // Calculate XP (regular drills only)
    const xpEarned = calculateDrillXP(drill, day);

    // Update plan - PERSISTENT PLANNING: Keep drills visible, just mark as completed
    const updatedPlan = { ...weeklyPlan };
    
    if (!isCurrentlyCompleted) {
      // Mark as completed but keep in the list
      updatedPlan[dayIndex] = {
        ...day,
        drills: day.drills.map((d, idx) => 
          idx === drillIndex
            ? { ...d, completed: true, xpEarned: xpEarned }
            : d
        ),
      };
    } else {
      // If unmarking (toggle off)
      updatedPlan[dayIndex] = {
        ...day,
        drills: day.drills.map((d, idx) => 
          idx === drillIndex
            ? { ...d, completed: false, xpEarned: 0 }
            : d
        ),
      };
    }

    // Check the Submit Function: Save drill completion to database
    // Match the Fields: Ensure it sends drill_name, score, and user_id
    if (!isCurrentlyCompleted && !isCombineTrackingOnly) {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();

        // One insert per completion (multiple same drill / same day allowed). XP stacks via updateUserXP.
        const stableDrillId = (drill as any).drill_id || drill.id;
        const typeForRow = String(stableDrillId ?? drill.id ?? "drill").trim() || "drill";
        const durationMinutes = Math.max(
          0,
          Math.min(24 * 60, Math.round(Number(drill.estimatedMinutes ?? 0)) || 0),
        );
        const completedAt = new Date().toISOString();
        // Omit `.select()`: some setups fail RETURNING (empty-looking PostgrestError) even when the row inserts.
        const { error: practiceError } = await supabase.from("practice").insert({
          user_id: user.id,
          type: typeForRow,
          duration_minutes: durationMinutes,
          notes: `Completed Drill: ${drill.category ?? "General"}`,
          completed_at: completedAt,
        });

        if (practiceError) {
          const pe = practiceError as {
            message?: string;
            code?: string;
            details?: string;
            hint?: string;
          };
          console.error("Practice: Error saving to practice table:", {
            message: pe?.message,
            code: pe?.code,
            details: pe?.details,
            hint: pe?.hint,
          });
        } else {
          console.log("Practice: Drill saved to practice table (user_id + type + completed_at).");

          await updateUserXP(user.id, xpEarned);
          console.log(`Practice: Added ${xpEarned} XP for drill completion`);

          await refreshDrills();
          await refreshPracticeSessions();
          window.dispatchEvent(new Event('drillsUpdated'));
          window.dispatchEvent(new Event('practiceSessionsUpdated'));

          await logActivity(user.id, 'drill', `Completed ${drill.title} (+${xpEarned} XP)`);
        }
      } catch (error) {
        console.error('Practice: Error in markDrillComplete database save:', error);
      }
    }

    // Update activity history (but DO NOT locally add XP to prevent ghosting)
    if (typeof window !== 'undefined' && !isCurrentlyCompleted && !isCombineTrackingOnly) {
      const savedProgress = localStorage.getItem('userProgress');
      const userProgress = savedProgress ? JSON.parse(savedProgress) : { 
        completedDrills: [], 
        totalXP: 0, 
        totalMinutes: 0,
        drillCompletions: {} // Track total completions per drill
      };
      
      // Removed: userProgress.totalXP = (userProgress.totalXP || 0) + xpEarned;
      userProgress.totalMinutes = (userProgress.totalMinutes || 0) + drill.estimatedMinutes;
      
      // Track total completions per drill
      if (!userProgress.drillCompletions) {
        userProgress.drillCompletions = {};
      }
      userProgress.drillCompletions[drill.id] = (userProgress.drillCompletions[drill.id] || 0) + 1;
      
      localStorage.setItem('userProgress', JSON.stringify(userProgress));
      
      // Log to activity history with unique timestamp
      const activityHistory = JSON.parse(localStorage.getItem('practiceActivityHistory') || '[]');
      const timestamp = new Date().toISOString();
      activityHistory.push({
        id: `practice-${drill.id}-${Date.now()}-${Math.random()}`,
        type: 'practice',
        title: drill.title,
        date: timestamp.split('T')[0],
        timestamp: timestamp, // Store full timestamp for uniqueness
        xp: xpEarned,
        drillTitle: drill.title,
        category: drill.category,
        dayName: day.dayName,
      });
      // Keep only last 100 entries
      const recentHistory = activityHistory.slice(-100);
      localStorage.setItem('practiceActivityHistory', JSON.stringify(recentHistory));
      
      // Dispatch events to update other components
      window.dispatchEvent(new Event('userProgressUpdated'));
      window.dispatchEvent(new Event('practiceActivityUpdated'));
      
      // Show XP notification
      setXpNotification({ show: true, amount: xpEarned });
      setTimeout(() => {
        setXpNotification({ show: false, amount: 0 });
      }, 3000);
    } else if (isCurrentlyCompleted) {
      // When unmarking, don't remove XP (session-based completion)
      // Just update the local plan state
    }

    // Save updated plan
    if (typeof window !== 'undefined') {
      localStorage.setItem('weeklyPracticePlans', JSON.stringify(updatedPlan));
    }

    setWeeklyPlan(updatedPlan);
    setGeneratedPlan(updatedPlan);
  };

  // Update level completion and save to database
  const updateLevelCompletion = async (dayIndex: number, drillIndex: number, levelId: string, completed: boolean) => {
    const day = weeklyPlan[dayIndex];
    if (!day || !day.drills[drillIndex]) return;

    const drill = day.drills[drillIndex];
    if (!drill.levels) return;

    // Update level in local state
    const updatedLevels = drill.levels.map(level =>
      level.id === levelId ? { ...level, completed } : level
    );

    const updatedPlan = { ...weeklyPlan };
    updatedPlan[dayIndex] = {
      ...day,
      drills: day.drills.map((d, idx) =>
        idx === drillIndex
          ? { ...d, levels: updatedLevels }
          : d
      ),
    };

    setWeeklyPlan(updatedPlan);
    setGeneratedPlan(updatedPlan);

    // Save to database - TABLE SYNC: Save completed_levels to practice table
    if (user?.id) {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();

        // Get completed level IDs
        const completedLevelIds = updatedLevels
          .filter(level => level.completed)
          .map(level => level.id);

        // Update completed_levels in practice table
        const { error } = await supabase
          .from('practice')
          .update({
            completed_levels: JSON.stringify(completedLevelIds),
          })
          .eq('user_id', user.id)
          .eq('drill_id', drill.id);

        if (error) {
          console.error('Error updating completed levels:', error);
        }
      } catch (error) {
        console.error('Error in updateLevelCompletion:', error);
      }
    }
  };

  // Check if all drills for a day are complete
  const isDayComplete = (day: DayPlan): boolean => {
    if (!(day?.drills?.length ?? 0)) return false;
    return (day.drills ?? []).every(drill => drill?.completed ?? false);
  };

  // Swap a drill with a random drill from the same category
  const swapDrill = async (dayIndex: number, drillIndex: number) => {
    const day = weeklyPlan[dayIndex];
    if (!day || !day.drills[drillIndex]) return;

    const currentDrill = day.drills[drillIndex];
    const currentCategory = currentDrill.category;

    // Set loading state
    setSwappingDrill({ dayIndex, drillIndex });

    // Find drills from the same category
    const categoryDrills = drills.filter(drill => {
      // Match category (case-insensitive, partial match)
      const drillCategory = drill.category.toLowerCase();
      const targetCategory = currentCategory.toLowerCase();
      
      return drillCategory.includes(targetCategory) || 
             targetCategory.includes(drillCategory) ||
             // Also check category mapping for pillar compatibility
             Object.entries(categoryMapping).some(([key, categories]) => 
               categories.some(cat => 
                 cat.toLowerCase().includes(drillCategory) || 
                 drillCategory.includes(cat.toLowerCase())
               ) && categories.some(cat =>
                 cat.toLowerCase().includes(targetCategory) ||
                 targetCategory.includes(cat.toLowerCase())
               )
             );
    });

    // Filter out the current drill to avoid swapping with itself
    const availableDrills = categoryDrills.filter(d => d.id !== currentDrill.id);

    if (availableDrills.length === 0) {
      // If no other drills in category, try to find any drill with similar estimated time
      const similarTimeDrills = drills.filter(d => 
        d.id !== currentDrill.id &&
        Math.abs(d.estimatedMinutes - currentDrill.estimatedMinutes) <= 15
      );
      
      if (similarTimeDrills.length > 0) {
        const randomDrill = similarTimeDrills[Math.floor(Math.random() * similarTimeDrills.length)];
        await replaceDrill(dayIndex, drillIndex, randomDrill);
      } else {
        // No suitable replacement found
        alert('No suitable replacement drill found.');
        setSwappingDrill(null);
      }
      return;
    }

    // Select a random drill from the same category
    const randomDrill = availableDrills[Math.floor(Math.random() * availableDrills.length)];
    
    // Small delay to show loading state
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // DATA SYNC: Replace drill and fetch fresh data from database
    await replaceDrill(dayIndex, drillIndex, randomDrill);
    
    // FORCE EXPAND: Automatically expand the card after swap
    setExpandedScheduleDrill({ dayIndex, drillIndex });
    
    // Show success feedback
    setSwapSuccess({ dayIndex, drillIndex });
    setTimeout(() => {
      setSwapSuccess(null);
    }, 2000);
  };

  const clearDrillFromDay = async (dayIndex: number, drillIndex: number) => {
    const day = weeklyPlan[dayIndex];
    if (!day?.drills || drillIndex < 0 || drillIndex >= day.drills.length) return;

    const drillToRemove = day.drills[drillIndex];

    const updatedPlan: WeeklyPlan = {
      ...weeklyPlan,
      [dayIndex]: {
        ...day,
        drills: day.drills.filter((_, idx) => idx !== drillIndex),
      },
    };

    setWeeklyPlan(updatedPlan);
    setGeneratedPlan(updatedPlan);
    if (typeof window !== 'undefined') {
      localStorage.setItem('weeklyPracticePlans', JSON.stringify(updatedPlan));
    }

    if (!user?.id) return;

    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();

      const today = new Date();
      const currentDay = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - (currentDay === 0 ? 6 : currentDay - 1));
      monday.setHours(12, 0, 0, 0);
      const targetDate = new Date(monday);
      targetDate.setDate(monday.getDate() + dayIndex);
      const fallbackDate = targetDate.toISOString().split('T')[0];

      const selectedDate = day.date || fallbackDate;
      const drillIdA = drillToRemove.drill_id || drillToRemove.id;
      const drillIdB = drillToRemove.id;

      let deleteQuery = supabase
        .from('user_drills')
        .delete()
        .eq('user_id', user.id)
        .eq('selected_date', selectedDate);

      if (drillIdA && drillIdB && drillIdA !== drillIdB) {
        deleteQuery = deleteQuery.or(`drill_id.eq.${drillIdA},drill_id.eq.${drillIdB}`);
      } else if (drillIdA) {
        deleteQuery = deleteQuery.eq('drill_id', drillIdA);
      }

      const { error } = await deleteQuery;
      if (error) {
        console.error('Error clearing drill from user_drills:', error);
      }
    } catch (error) {
      console.error('Error clearing drill from database:', error);
    }
  };

  const requestClearDrillFromDay = (dayIndex: number, drillIndex: number) => {
    const drillTitle = weeklyPlan[dayIndex]?.drills?.[drillIndex]?.title || 'this drill';
    setClearDrillConfirm({
      open: true,
      dayIndex,
      drillIndex,
      drillTitle,
    });
  };

  // Replace a drill in the plan
  const replaceDrill = async (dayIndex: number, drillIndex: number, newDrill: Drill) => {
    const day = weeklyPlan[dayIndex];
    if (!day || !day.drills[drillIndex]) return;

    const currentDrill = day.drills[drillIndex];
    
    // DATA SYNC: Fetch fresh drill data from database to get video_url and drill_levels
    let drillData = { ...newDrill };
    try {
      let dbDrill: Record<string, unknown> | null = await fetchDrillRowById(newDrill.id);
      if (!dbDrill) {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { data } = await supabase
          .from('drills')
          .select('drill_name, description, video_url, pdf_url, drill_levels, title, category, estimatedMinutes')
          .eq('id', newDrill.id)
          .single();
        dbDrill = data ?? null;
      }

      if (dbDrill) {
        const d = dbDrill as Record<string, any>;
        let levels = null;
        if (d.drill_levels) {
          try {
            levels = typeof d.drill_levels === 'string' 
              ? JSON.parse(d.drill_levels)
              : d.drill_levels;
            if (Array.isArray(levels)) {
              levels = levels.map((level: any, idx: number) => ({
                id: level.id || `level-${idx}`,
                name: level.name || level,
                completed: false
              }));
            }
          } catch (e) {
            console.warn('Error parsing drill_levels:', e);
          }
        }

        const desc = (d.description && String(d.description).trim()) || DESCRIPTION_BY_DRILL_ID[newDrill.id] || newDrill.description;
        drillData = {
          ...newDrill,
          title: String(d.drill_name ?? d.title ?? newDrill.title),
          pdf_url: d.pdf_url || newDrill.pdf_url,
          youtube_url: d.video_url || newDrill.youtube_url || newDrill.video_url,
          video_url: d.video_url || newDrill.video_url || newDrill.youtube_url,
          description: desc,
          levels: levels || newDrill.levels,
        };
      }
    } catch (error) {
      console.warn('Error fetching drill data after swap:', error);
      // Continue with existing drill data
    }
    
    // Apply XP tiering based on pillar
    const pillar = Object.keys(pillarXPTiering).find(p => 
      drillData.category.toLowerCase().includes(p.toLowerCase()) ||
      p.toLowerCase().includes(drillData.category.toLowerCase())
    );
    const xpValue = pillar ? pillarXPTiering[pillar] : drillData.xpValue;

    const updatedPlan = { ...weeklyPlan };
    updatedPlan[dayIndex] = {
      ...day,
      drills: day.drills.map((d, idx) => 
        idx === drillIndex
          ? {
              ...drillData,
              id: `swapped-${dayIndex}-${drillIndex}-${Date.now()}-${drillData.id}`,
              category: drillData.category,
              estimatedMinutes: drillData.estimatedMinutes,
              xpValue: xpValue,
              completed: false, // Reset completion status
              xpEarned: 0,
              facility: currentDrill.facility, // Preserve facility assignment
              isRound: currentDrill.isRound, // Preserve round flag
              contentType: drillData.contentType,
              source: drillData.source,
              description: drillData.description,
            }
          : d
      ),
    };

    // Save to user_drills table in database
    if (user?.id) {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        
        // Delete old swapped drill
        await supabase
          .from('user_drills')
          .delete()
          .eq('user_id', user.id)
          .eq('selected_date', day.date)
          .eq('drill_id', currentDrill.id);

        // Insert new swapped drill
        const { error } = await supabase
          .from('user_drills')
          .insert({
            user_id: user.id,
            drill_id: drillData.id,
            selected_date: day.date,
          });
          
        if (error) {
          console.error('Error saving swapped drill to user_drills:', error);
          alert('Failed to save swap to database.');
          setSwappingDrill(null);
          return; // Do not update state on error
        }
      } catch (error) {
        console.error('Database connection error:', error);
        alert('Failed to connect to database.');
        setSwappingDrill(null);
        return; // Do not update state on error
      }
    }

    // Save to localStorage (only after successful DB operation)
    if (typeof window !== 'undefined') {
      localStorage.setItem('weeklyPracticePlans', JSON.stringify(updatedPlan));
    }

    setWeeklyPlan(updatedPlan);
    setGeneratedPlan(updatedPlan);
    setSwappingDrill(null);
  };

  const getDaySummary = (day: DayPlan) => {
    if (!(day?.selected ?? false) || !(day?.drills?.length ?? 0)) return null;
    
    const totalTime = (day.drills ?? []).reduce((sum, d) => sum + (d?.estimatedMinutes ?? 0), 0);
    const categories = [...new Set((day?.drills ?? []).map(d => d?.category).filter(Boolean))];
    
    return {
      dayName: day.dayName,
      totalTime,
      categories: categories.join(' & '),
    };
  };

  // Filter to current user's rounds only — StatsContext fetches all users for leaderboard
  const myRounds = useMemo(() => {
    if (!user?.id || !rounds || rounds.length === 0) return [];
    return rounds.filter((r: any) => r.user_id === user.id);
  }, [rounds, user?.id]);

  const [goals, performanceMetrics] = useMemo(() => {
    const targetGoal = user?.initialHandicap ?? 54;
    const g = getBenchmarkGoals(targetGoal);
    const r1 = (v: number) => Math.round(v * 10) / 10;

    const empty = {
      firPercent: 0, girPercent: 0, gir8ft: 0, gir20ft: 0,
      upAndDownPercent: 0, bunkerSaves: 0, chipInside6ft: 0,
      avgPutts: 0, puttsUnder6ftMake: 0, avgThreePutts: 0,
      teePenalties: 0, approachPenalties: 0, totalPenalties: 0,
      _attempts: { fir: 0, gir: 0, girProximity: 0, upDown: 0, bunker: 0, putts6ft: 0, putts: 0 },
    };

    if (myRounds.length === 0) return [g, empty];

    const n = myRounds.length;

    // DRIVING: Fairways in Regulation
    const totalFir = myRounds.reduce((s, r) => s + (r.firHit || 0) + (r.firLeft || 0) + (r.firRight || 0), 0);
    const firHit = myRounds.reduce((s, r) => s + (r.firHit || 0), 0);
    const firPercent = totalFir > 0 ? (firHit / totalFir) * 100 : 0;

    // APPROACH: GIR + Proximity
    const totalGir = myRounds.reduce((s, r) => s + (r.totalGir || 0), 0);
    const totalHoles = myRounds.reduce((s, r) => s + (r.holes || 18), 0);
    const girPercent = totalHoles > 0 ? (totalGir / totalHoles) * 100 : 0;
    const totalGir8ft = myRounds.reduce((s, r) => s + (r.gir8ft || 0), 0);
    const totalGir20ft = myRounds.reduce((s, r) => s + (r.gir20ft || 0), 0);
    const gir8ft = totalHoles > 0 ? (totalGir8ft / totalHoles) * 100 : 0;
    const gir20ft = totalHoles > 0 ? (totalGir20ft / totalHoles) * 100 : 0;

    // SHORT GAME: Up & Down, Bunker Saves, Chips inside 6ft
    const totalUpDownAttempts = myRounds.reduce((s, r) => s + (r.upAndDownConversions || 0) + (r.missed || 0), 0);
    const upDownSuccess = myRounds.reduce((s, r) => s + (r.upAndDownConversions || 0), 0);
    const upAndDownPercent = totalUpDownAttempts > 0 ? (upDownSuccess / totalUpDownAttempts) * 100 : 0;
    const totalBunkerAttempts = myRounds.reduce((s, r) => s + (r.bunkerAttempts || 0) + (r.bunkerSaves || 0), 0);
    const bunkerSavesCount = myRounds.reduce((s, r) => s + (r.bunkerSaves || 0), 0);
    const bunkerSaves = totalBunkerAttempts > 0 ? (bunkerSavesCount / totalBunkerAttempts) * 100 : 0;
    const chipInside6ft = totalUpDownAttempts > 0 ? (myRounds.reduce((s, r) => s + (r.chipInside6ft || 0), 0) / totalUpDownAttempts) * 100 : 0;

    // PUTTING: Total Putts, < 6ft Make %, 3-Putts
    const totalPutts = myRounds.reduce((s, r) => s + (r.totalPutts || 0), 0);
    const avgPutts = n > 0 ? totalPutts / n : 0;
    const totalPuttsUnder6ft = myRounds.reduce((s, r) => s + (r.puttsUnder6ftAttempts || 0), 0);
    const puttsMadeUnder6ft = myRounds.reduce((s, r) => s + (r.made6ftAndIn || 0), 0);
    const puttsUnder6ftMake = totalPuttsUnder6ft > 0 ? Math.round((puttsMadeUnder6ft / totalPuttsUnder6ft) * 100) : 0;
    const totalThreePutts = myRounds.reduce((s, r) => s + (r.threePutts || 0), 0);
    const avgThreePutts = n > 0 ? totalThreePutts / n : 0;

    // PENALTIES
    const teePenalties = n > 0 ? myRounds.reduce((s, r) => s + (r.teePenalties || 0), 0) / n : 0;
    const approachPenalties = n > 0 ? myRounds.reduce((s, r) => s + (r.approachPenalties || 0), 0) / n : 0;
    const totalPenalties = n > 0 ? myRounds.reduce((s, r) => s + (r.totalPenalties || 0), 0) / n : 0;

    return [g, {
      firPercent: r1(firPercent), girPercent: r1(girPercent), gir8ft: r1(gir8ft), gir20ft: r1(gir20ft),
      upAndDownPercent: r1(upAndDownPercent), bunkerSaves: r1(bunkerSaves), chipInside6ft: r1(chipInside6ft),
      avgPutts: r1(avgPutts), puttsUnder6ftMake: r1(puttsUnder6ftMake), avgThreePutts: r1(avgThreePutts),
      teePenalties: r1(teePenalties), approachPenalties: r1(approachPenalties), totalPenalties: r1(totalPenalties),
      _attempts: {
        fir: totalFir, gir: totalHoles, girProximity: totalGir,
        upDown: totalUpDownAttempts, bunker: totalBunkerAttempts,
        putts6ft: totalPuttsUnder6ft, putts: totalPutts,
      },
    }];
  }, [myRounds, user?.initialHandicap]);

  return (
    <div className="flex-1 w-full flex flex-col bg-gray-50">
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 pt-4 pb-32">
        <div className="max-w-md mx-auto">
        {/* Header with Name Editing */}
        <div className="pt-6 pb-4">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-2xl font-bold text-gray-900">Weekly Planner</h1>
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="text-sm border-2 border-[#014421] rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#014421] w-32"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSaveName();
                    } else if (e.key === 'Escape') {
                      handleCancelEdit();
                    }
                  }}
                  disabled={isSavingName}
                />
                <button
                  onClick={handleSaveName}
                  disabled={isSavingName}
                  className="p-1 rounded hover:bg-gray-100 transition-colors disabled:opacity-50"
                >
                  {isSavingName ? (
                    <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Check className="w-4 h-4 text-green-600" />
                  )}
                </button>
                <button
                  onClick={handleCancelEdit}
                  disabled={isSavingName}
                  className="p-1 rounded hover:bg-gray-100 transition-colors disabled:opacity-50"
                >
                  <X className="w-4 h-4 text-gray-600" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">{userName}</span>
                <button
                  onClick={handleEditName}
                  className="p-1 rounded hover:bg-gray-100 transition-colors"
                  title="Edit name"
                >
                  <Pencil className="w-3 h-3 text-gray-600" />
                </button>
              </div>
            )}
          </div>
          <p className="text-gray-600 text-sm mt-1">Plan your practice for the week</p>
          {totalPracticeMinutes > 0 && (
            <div className="mt-2 text-sm font-medium" style={{ color: '#014421' }}>
              Total Time This Week: {Math.floor(totalPracticeMinutes / 60)}h {totalPracticeMinutes % 60}m
            </div>
          )}
        </div>

        {/* Weekly Calendar - Fully Responsive Grid */}
        <div className="mb-6">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
            {/* Responsive Grid: 2 cols on mobile, 4 cols on tablet, 7 cols on desktop */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {DAY_ABBREVIATIONS.map((abbr, idx) => {
                const index = idx;
                const day = weeklyPlan[index];
                const isSelected = day?.selected ?? false;
                return (
                  <button
                    key={index}
                    onClick={() => toggleDay(index)}
                    className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl transition-all min-h-[70px] ${
                      isSelected
                        ? 'bg-[#F57C00] border-2 border-[#E65100]' // Signature orange when selected
                        : 'bg-gray-50 border border-gray-200 hover:border-gray-300' // Light gray when not selected
                    }`}
                  >
                    <span className={`text-sm font-semibold ${
                      isSelected ? 'text-white' : 'text-gray-600'
                    }`}>
                      {abbr}
                    </span>
                    {(day?.availableTime ?? 0) > 0 ? (
                      <span className={`text-xs font-bold ${
                        isSelected ? 'text-white' : 'text-gray-700'
                      }`}>
                        {formatTime(day?.availableTime ?? 0)}
                      </span>
                    ) : (
                      <span className={`text-xs ${
                        isSelected ? 'text-white/80' : 'text-gray-400'
                      }`}>
                        —
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Time Assignment for Selected Day */}
        {selectedDay !== null && (
          <div className="mb-6">
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-5 h-5" style={{ color: '#014421' }} />
                <h3 className="font-semibold text-gray-900">
                  {DAY_NAMES[selectedDay]} - Available Practice Time
                </h3>
              </div>
              
              {/* Time Slider - Academy Hub Style with Thin Track (8 hours max) */}
              <div className="space-y-4">
                <div className="relative py-3">
                  {/* Thin Track Line (Background) - Forest Green */}
                  <div 
                    className="absolute top-1/2 left-0 right-0 rounded-full transform -translate-y-1/2"
                    style={{
                      height: '2px',
                      backgroundColor: '#014421',
                      opacity: 0.2,
                    }}
                  />
                  
                  {/* Snap Point Indicators (every 15 minutes) - Key time markers */}
                  <div className="absolute top-1/2 left-0 right-0 transform -translate-y-1/2 pointer-events-none">
                    {[0, 60, 90, 120, 180, 240, 300, 360, 420, 480].map((min) => (
                      <div
                        key={min}
                        className="absolute w-0.5 h-2 bg-gray-300 rounded-full transform -translate-x-1/2"
                        style={{
                          left: `${(min / 480) * 100}%`,
                        }}
                      />
                    ))}
                  </div>
                  
                  {/* Fill Line (Gold) */}
                  <div
                    className="absolute top-1/2 left-0 rounded-full transform -translate-y-1/2 transition-all"
                    style={{
                      height: '4px',
                      width: `${((weeklyPlan[selectedDay]?.availableTime || 0) / 480) * 100}%`,
                      backgroundColor: '#FFA500',
                    }}
                  />
                  
                  {/* Slider Input with 5-minute snap points */}
                  <input
                    type="range"
                    min="0"
                    max="480"
                    step="5"
                    value={weeklyPlan[selectedDay]?.availableTime || 0}
                    onChange={(e) => updateTime(selectedDay, parseInt(e.target.value))}
                    className="relative w-full h-4 bg-transparent appearance-none cursor-pointer z-10"
                    style={{
                      WebkitAppearance: 'none',
                      background: 'transparent',
                    }}
                  />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">0m</span>
                  <span className="font-bold text-lg" style={{ color: '#FFA500' }}>
                    {formatTime(weeklyPlan[selectedDay]?.availableTime || 0)}
                  </span>
                  <span className="text-gray-600">8h</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Multi-Select Facility Selector - Above Generate Button */}
        {selectedDay !== null && (
          <div className="mb-6">
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-4">Where are you practicing?</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {ALL_FACILITIES.map((facilityType) => {
                  const info = facilityInfo[facilityType];
                  const Icon = info.icon;
                  const isSelected = weeklyPlan[selectedDay]?.selectedFacilities?.includes(facilityType) || false;
                  
                  return (
                    <button
                      key={facilityType}
                      type="button"
                      onClick={() => toggleFacility(selectedDay, facilityType)}
                      className={`flex flex-col items-center gap-2 p-3 rounded-xl transition-all border-2 ${
                        isSelected
                          ? 'bg-[#014421] border-[#FFA500]'
                          : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <Icon 
                        className={`w-5 h-5 ${
                          isSelected
                            ? 'text-[#FFA500]'
                            : 'text-gray-600'
                        }`}
                      />
                      <span className={`text-xs font-medium text-center ${
                        isSelected
                          ? 'text-white'
                          : 'text-gray-700'
                      }`}>
                        {info.label}
                      </span>
                    </button>
                  );
                })}
                {/* Custom Round Buttons */}
                <button
                  type="button"
                  onClick={() => setRoundType(selectedDay, '9-hole')}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl transition-all border-2 ${
                    weeklyPlan[selectedDay]?.roundType === '9-hole'
                      ? 'bg-[#014421] border-[#FFA500]'
                      : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <FlagTriangleRight 
                    className={`w-5 h-5 ${
                      weeklyPlan[selectedDay]?.roundType === '9-hole'
                        ? 'text-[#FFA500]'
                        : 'text-gray-600'
                    }`}
                  />
                  <span className={`text-xs font-medium text-center ${
                    weeklyPlan[selectedDay]?.roundType === '9-hole'
                      ? 'text-white'
                      : 'text-gray-700'
                  }`}>
                    9-Hole Round
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setRoundType(selectedDay, '18-hole')}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl transition-all border-2 ${
                    weeklyPlan[selectedDay]?.roundType === '18-hole'
                      ? 'bg-[#014421] border-[#FFA500]'
                      : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <FlagTriangleRight 
                    className={`w-5 h-5 ${
                      weeklyPlan[selectedDay]?.roundType === '18-hole'
                        ? 'text-[#FFA500]'
                        : 'text-gray-600'
                    }`}
                  />
                  <span className={`text-xs font-medium text-center ${
                    weeklyPlan[selectedDay]?.roundType === '18-hole'
                      ? 'text-white'
                      : 'text-gray-700'
                  }`}>
                    18-Hole Round
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Generate Plan Button */}
        <div className="mb-6">
          <button
            onClick={generatePlan}
            disabled={!canGeneratePlan}
            className={`w-full py-4 rounded-xl font-semibold text-white shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 ${
              !canGeneratePlan ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            style={{ backgroundColor: '#014421' }}
          >
            <Sparkles className="w-5 h-5" />
            Practice Roadmap
          </button>
        </div>

        {/* Summary Cards */}
        {generatedPlan && Object.values(generatedPlan).some(day => (day?.selected ?? false) && (day?.drills?.length ?? 0) > 0) && (
          <div className="space-y-3 mb-6">
            {Object.values(generatedPlan)
              .filter(day => (day?.selected ?? false) && (day?.drills?.length ?? 0) > 0)
              .map((day) => {
                const summary = getDaySummary(day);
                if (!summary) return null;
                
                const dayComplete = isDayComplete(day);
                const completedCount = (day?.drills ?? []).filter((d: DayPlan['drills'][0]) => d?.completed).length;
                const totalDrills = (day?.drills ?? []).length;
                
                return (
                  <div
                    key={day.dayIndex}
                    className={`rounded-2xl p-4 shadow-sm border-2 ${
                      dayComplete 
                        ? 'border-[#FFA500]' 
                        : 'border-gray-200 bg-white'
                    }`}
                    style={dayComplete ? { 
                      background: 'linear-gradient(to bottom right, #ffffff, rgba(255, 165, 0, 0.05))' 
                    } : {}}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-5 h-5" style={{ color: '#014421' }} />
                        <h3 className="font-semibold text-gray-900">
                          {dayComplete ? (
                            <span className="flex items-center gap-2">
                              <CheckCircle2 className="w-5 h-5" style={{ color: '#FFA500' }} />
                              <span style={{ color: '#FFA500' }}>Session Complete</span>
                            </span>
                          ) : (
                            `${summary.dayName} Plan`
                          )}
                        </h3>
                      </div>
                      {dayComplete && (
                        <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ 
                          backgroundColor: '#FFA500', 
                          color: '#014421' 
                        }}>
                          ✓
                        </span>
                      )}
                    </div>
                    <p className="text-gray-700 text-sm mb-3">
                      {summary.totalTime} mins of drills scheduled
                      {(day.availableTime ?? 0) > 0 ? (
                        <span className="text-gray-600">
                          {" "}
                          · {formatTime(day.availableTime ?? 0)} on slider
                        </span>
                      ) : null}
                      . Focus: {summary.categories}
                      {completedCount > 0 && (
                        <span className="ml-2 font-semibold" style={{ color: '#FFA500' }}>
                          ({completedCount}/{totalDrills} complete)
                        </span>
                      )}
                    </p>
                    <div className="space-y-2">
                      {(day?.drills ?? []).map((drill: DayPlan['drills'][0], idx: number) => {
                        const actualDrillIndex = (day?.drills ?? []).findIndex((d: any) => d?.id === drill?.id);
                        const isSwapping = swappingDrill?.dayIndex === day.dayIndex && swappingDrill?.drillIndex === actualDrillIndex;
                        const justSwapped = swapSuccess?.dayIndex === day.dayIndex && swapSuccess?.drillIndex === actualDrillIndex;
                        const isExpanded = expandedScheduleDrill?.dayIndex === day.dayIndex && expandedScheduleDrill?.drillIndex === actualDrillIndex;
                        
                        return (
                          <DrillCard
                            key={`${day.dayIndex}-${drill.id}-${idx}`}
                            drill={drill}
                            dayIndex={day.dayIndex}
                            drillIndex={idx}
                            actualDrillIndex={actualDrillIndex}
                            isSwapping={isSwapping}
                            justSwapped={justSwapped}
                            facilityInfo={facilityInfo}
                            onComplete={(dayIdx, drillIdx) => {
                              markDrillComplete(dayIdx, drillIdx);
                              setExpandedScheduleDrill(null);
                            }}
                            onSwap={swapDrill}
                            onClear={requestClearDrillFromDay}
                            onLevelToggle={updateLevelCompletion}
                            onYoutubeOpen={(url) => setYoutubeModal({ open: true, url })}
                            onExpandToggle={(dayIdx, drillIdx) => {
                              if (isExpanded) {
                                setExpandedScheduleDrill(null);
                              } else {
                                setExpandedScheduleDrill({ dayIndex: dayIdx, drillIndex: drillIdx });
                              }
                            }}
                            defaultExpanded={isExpanded}
                            userId={user?.id ?? null}
                            combineBestText={drill.isCombine ? (combineBestByPlannerDrillId.get(drill.id) ?? null) : null}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {/* XP Notification Toast */}
        {xpNotification.show && (
          <div className="fixed bottom-24 left-1/2 transform -translate-x-1/2 z-50 animate-bounce">
            <div className="bg-[#FFA500] text-[#014421] px-6 py-3 rounded-full shadow-lg font-bold flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              <span>+{xpNotification.amount} XP Earned!</span>
            </div>
          </div>
        )}

        {/* AI Player Insights */}
        <div className="mb-6">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5" style={{ color: '#014421' }} />
                  <h3 className="text-lg font-semibold text-gray-900">Coach&apos;s Insights</h3>
                </div>
                <p className="text-xs text-gray-600 mt-1">Full-game performance analysis</p>
              </div>
              <button
                type="button"
                onClick={() => setCoachInsightsExpanded((prev) => !prev)}
                className="flex items-center justify-center rounded-lg border border-stone-200 bg-white/90 px-2.5 py-2 text-[11px] font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50/90"
                aria-expanded={coachInsightsExpanded}
                aria-controls="coach-insights-content"
                aria-label={coachInsightsExpanded ? "Collapse coach insights" : "Expand coach insights"}
                title={coachInsightsExpanded ? "Collapse coach insights" : "Expand coach insights"}
              >
                {coachInsightsExpanded ? (
                  <ChevronUp className="h-3.5 w-3.5 text-stone-500" aria-hidden />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-stone-500" aria-hidden />
                )}
              </button>
            </div>
            {coachInsightsExpanded && (
              <div id="coach-insights-content">
                <AIPlayerInsights
                  drills={drills}
                  performanceMetrics={performanceMetrics}
                  goals={goals}
                  roundCount={myRounds.length}
                  showHeader={false}
                />
              </div>
            )}
          </div>
        </div>

        {/* Log Freestyle Practice Section */}
        <div className="mb-6">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5" style={{ color: '#014421' }} />
                  <h3 className="text-lg font-semibold text-gray-900">Log Freestyle Practice</h3>
                </div>
                <p className="text-xs text-gray-600 mt-1">Tap a category to log freestyle practice</p>
              </div>
              <button
                type="button"
                onClick={() => setFreestyleExpanded((prev) => !prev)}
                className="flex items-center justify-center rounded-lg border border-stone-200 bg-white/90 px-2.5 py-2 text-[11px] font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50/90"
                aria-expanded={freestyleExpanded}
                aria-controls="freestyle-practice-content"
                aria-label={freestyleExpanded ? "Collapse freestyle practice" : "Expand freestyle practice"}
                title={freestyleExpanded ? "Collapse freestyle practice" : "Expand freestyle practice"}
              >
                {freestyleExpanded ? (
                  <ChevronUp className="h-3.5 w-3.5 text-stone-500" aria-hidden />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-stone-500" aria-hidden />
                )}
              </button>
            </div>

            {freestyleExpanded && (
              <div id="freestyle-practice-content" className="grid grid-cols-3 gap-3">
                {/* Top Row: Driving, Irons, Wedges */}
                {(['Driving', 'Irons', 'Wedges'] as FacilityType[]).map((facilityType) => {
                  const info = facilityInfo[facilityType];
                  const Icon = info.icon;
                  return (
                    <button
                      key={`freestyle-${facilityType}`}
                      type="button"
                      onClick={() => setDurationModal({ open: true, facility: facilityType })}
                      className="flex flex-col items-center gap-2 p-3 rounded-xl transition-all border-2 bg-gray-50 border-gray-200 hover:border-[#FFA500] hover:bg-gray-100"
                    >
                      <Icon className="w-5 h-5 text-gray-600" />
                      <span className="text-xs font-medium text-center text-gray-700">{info.label}</span>
                    </button>
                  );
                })}
                {/* Middle Row: Chipping, Bunkers, Putting */}
                {(['Chipping', 'Bunkers', 'Putting'] as FacilityType[]).map((facilityType) => {
                  const info = facilityInfo[facilityType];
                  const Icon = info.icon;
                  return (
                    <button
                      key={`freestyle-${facilityType}`}
                      type="button"
                      onClick={() => setDurationModal({ open: true, facility: facilityType })}
                      className="flex flex-col items-center gap-2 p-3 rounded-xl transition-all border-2 bg-gray-50 border-gray-200 hover:border-[#FFA500] hover:bg-gray-100"
                    >
                      <Icon className="w-5 h-5 text-gray-600" />
                      <span className="text-xs font-medium text-center text-gray-700">{info.label}</span>
                    </button>
                  );
                })}
                {/* Bottom Row: Mental/Strategy, 9-Hole Round, 18-Hole Round */}
                <button
                  type="button"
                  onClick={() => setDurationModal({ open: true, facility: 'Mental/Strategy' })}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl transition-all border-2 bg-gray-50 border-gray-200 hover:border-[#FFA500] hover:bg-gray-100"
                >
                  <BookOpen className="w-5 h-5 text-gray-600" />
                  <span className="text-xs font-medium text-center text-gray-700">Mental/Strategy</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOnCourseConfirm({ open: true, duration: 135, label: '9-Hole Round' })}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl transition-all border-2 bg-gray-50 border-gray-200 hover:border-[#FFA500] hover:bg-gray-100"
                >
                  <FlagTriangleRight className="w-5 h-5 text-gray-600" />
                  <span className="text-xs font-medium text-center text-gray-700">9-Hole Round</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOnCourseConfirm({ open: true, duration: 270, label: '18-Hole Round' })}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl transition-all border-2 bg-gray-50 border-gray-200 hover:border-[#FFA500] hover:bg-gray-100"
                >
                  <FlagTriangleRight className="w-5 h-5 text-gray-600" />
                  <span className="text-xs font-medium text-center text-gray-700">18-Hole Round</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Duration Selection Modal */}
        {durationModal.open && durationModal.facility && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {facilityInfo[durationModal.facility].label}
              </h3>
              <p className="text-sm text-gray-600 mb-4">Select practice duration</p>
              
              <div className="grid grid-cols-2 gap-3 mb-4">
                {freestyleDurationOptions.map((minutes) => {
                  const xp = freestyleXpForMinutes(minutes);
                  
                  return (
                    <button
                      key={minutes}
                      onClick={() => logFreestylePractice(durationModal.facility!, minutes)}
                      className="p-4 rounded-xl border-2 border-gray-200 hover:border-[#FFA500] hover:bg-gray-50 transition-all"
                    >
                      <div className="text-lg font-bold text-gray-900">{minutes}m</div>
                      <div className="text-xs text-gray-600">+{xp} XP</div>
                    </button>
                  );
                })}
              </div>
              
              <button
                onClick={() => setDurationModal({ open: false, facility: null })}
                className="w-full py-2 px-4 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* On-Course Round Confirmation Modal */}
        {onCourseConfirm.open && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Confirm Round Log
              </h3>
              <p className="text-sm text-gray-600 mb-5">
                Log {onCourseConfirm.label} as {onCourseConfirm.duration} minutes of practice time?
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setOnCourseConfirm({ open: false, duration: 0, label: '' })}
                  className="py-2 px-4 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const { duration } = onCourseConfirm;
                    setOnCourseConfirm({ open: false, duration: 0, label: '' });
                    logFreestylePractice('On-Course', duration);
                  }}
                  className="py-2 px-4 rounded-lg bg-[#014421] text-white font-medium hover:opacity-90 transition-opacity"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Clear Drill Confirmation Modal */}
        {clearDrillConfirm.open && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Remove Drill
              </h3>
              <p className="text-sm text-gray-600 mb-5">
                Remove "{clearDrillConfirm.drillTitle}" from this day?
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setClearDrillConfirm({ open: false, dayIndex: null, drillIndex: null, drillTitle: '' })}
                  className="py-2 px-4 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const { dayIndex, drillIndex } = clearDrillConfirm;
                    setClearDrillConfirm({ open: false, dayIndex: null, drillIndex: null, drillTitle: '' });
                    if (dayIndex != null && drillIndex != null) {
                      clearDrillFromDay(dayIndex, drillIndex);
                    }
                  }}
                  className="py-2 px-4 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        )}

        {/* XP Notification Animation */}
        {xpNotification.show && (
          <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 animate-bounce">
            <div className="bg-[#FFA500] text-white px-6 py-3 rounded-full shadow-lg font-bold text-lg">
              +{xpNotification.amount} XP
            </div>
          </div>
        )}

        {/* Weekly Training Schedule - Horizontal 7-Day Row (Moved to Bottom) */}
        <div className="mb-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Header with Collapse Toggle */}
            <div 
              className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => setScheduleExpanded(!scheduleExpanded)}
            >
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5" style={{ color: '#014421' }} />
                <h2 className="text-lg font-semibold text-gray-900">Weekly Training Schedule</h2>
              </div>
              {scheduleExpanded ? (
                <ChevronUp className="w-5 h-5 text-gray-500" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-500" />
              )}
            </div>

            {/* Schedule Content - Collapsible - Single Day View */}
            {scheduleExpanded && (
              <div className="px-4 pb-4 w-full overflow-hidden" style={{ maxWidth: '100%' }}>
                {/* View Mode Toggle */}
                <div className="flex items-center justify-center gap-2 mb-4">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewMode('day');
                    }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      viewMode === 'day'
                        ? 'bg-[#014421] text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Day View
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewMode('weekly');
                    }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      viewMode === 'weekly'
                        ? 'bg-[#014421] text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Weekly Summary
                  </button>
                </div>

                {/* Day View - Single Day Focus */}
                {viewMode === 'day' && (
                  <>
                    {/* Navigation Header */}
                    <div className="flex items-center justify-between mb-6 w-full">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentDayView((prev) => (prev > 0 ? prev - 1 : 6));
                    }}
                    className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                    aria-label="Previous day"
                  >
                    <ChevronLeft className="w-6 h-6 text-gray-700" />
                  </button>
                  
                  <div className="flex-1 text-center">
                    <h3 className="text-xl font-bold text-gray-900">{DAY_NAMES[currentDayView]}</h3>
                    {/* Get current week's date for this day */}
                    {(() => {
                      const today = new Date();
                      const currentDay = today.getDay();
                      const monday = new Date(today);
                      monday.setDate(today.getDate() - (currentDay === 0 ? 6 : currentDay - 1));
                      const dayDate = new Date(monday);
                      dayDate.setDate(monday.getDate() + currentDayView);
                      return (
                        <p className="text-sm text-gray-600 mt-1">
                          {dayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </p>
                      );
                    })()}
                  </div>
                  
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentDayView((prev) => (prev < 6 ? prev + 1 : 0));
                    }}
                    className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                    aria-label="Next day"
                  >
                    <ChevronRight className="w-6 h-6 text-gray-700" />
                  </button>
                </div>

                {/* Single Day Drill List - Vertical */}
                {(() => {
                  const day = weeklyPlan[currentDayView];
                  const dayDrills = day?.drills || [];
                  const completedCount = dayDrills.filter(d => d.completed).length;
                  const totalCount = dayDrills.length;
                  
                  if (dayDrills.length === 0) {
                    return (
                      <div className="text-center py-12 w-full">
                        <p className="text-gray-500 text-lg">No drills scheduled for today</p>
                      </div>
                    );
                  }
                  
                  return (
                    <div className="space-y-4 w-full">
                      {/* Completion Status */}
                      {totalCount > 0 && (
                        <div className="text-center mb-4">
                          <span className={`text-base font-semibold ${
                            completedCount === totalCount ? 'text-green-600' : 'text-gray-600'
                          }`}>
                            {completedCount}/{totalCount} drills completed
                          </span>
                        </div>
                      )}
                      
                      {/* Drill Cards - Full List, Vertical */}
                      {dayDrills.map((drill, drillIdx) => {
                        const actualDrillIndex = dayDrills.findIndex((d: any) => d?.id === drill?.id);
                        const isSwapping = swappingDrill?.dayIndex === currentDayView && swappingDrill?.drillIndex === actualDrillIndex;
                        const justSwapped = swapSuccess?.dayIndex === currentDayView && swapSuccess?.drillIndex === actualDrillIndex;
                        // FORCE EXPAND: Keep expanded after swap or if explicitly set
                        const isExpanded = expandedScheduleDrill?.dayIndex === currentDayView && expandedScheduleDrill?.drillIndex === actualDrillIndex;
                        
                        return (
                          <DrillCard
                            key={`${currentDayView}-${drill.id}-${drillIdx}`}
                            drill={drill}
                            dayIndex={currentDayView}
                            drillIndex={drillIdx}
                            actualDrillIndex={actualDrillIndex}
                            isSwapping={isSwapping}
                            justSwapped={justSwapped}
                            facilityInfo={facilityInfo}
                            onComplete={(dayIdx, drillIdx) => {
                              markDrillComplete(dayIdx, drillIdx);
                              setExpandedScheduleDrill(null);
                            }}
                            onSwap={swapDrill}
                            onClear={requestClearDrillFromDay}
                            onLevelToggle={updateLevelCompletion}
                            onYoutubeOpen={(url) => setYoutubeModal({ open: true, url })}
                            onExpandToggle={(dayIdx, drillIdx) => {
                              if (isExpanded) {
                                setExpandedScheduleDrill(null);
                              } else {
                                setExpandedScheduleDrill({ dayIndex: dayIdx, drillIndex: drillIdx });
                              }
                            }}
                            defaultExpanded={isExpanded}
                            userId={user?.id ?? null}
                            combineBestText={drill.isCombine ? (combineBestByPlannerDrillId.get(drill.id) ?? null) : null}
                          />
                        );
                      })}
                    </div>
                  );
                })()}
                  </>
                )}

                {/* Weekly Summary View */}
                {viewMode === 'weekly' && (
                  <div className="space-y-2 w-full">
                    {DAY_NAMES.map((dayName, dayIndex) => {
                      const day = weeklyPlan[dayIndex];
                      const dayDrills = day?.drills || [];
                      const completedCount = dayDrills.filter(d => d?.completed).length;
                      const totalCount = dayDrills.length;
                      
                      if (dayDrills.length === 0) return null;
                      
                      return (
                        <div key={dayIndex} className="border border-gray-200 rounded-lg p-2.5">
                          <div className="flex items-center justify-between mb-1.5">
                            <h3 className="text-base font-semibold text-gray-900">{dayName}</h3>
                            {totalCount > 0 && (
                              <span className={`text-sm font-medium ${
                                completedCount === totalCount ? 'text-green-600' : 'text-gray-600'
                              }`}>
                                {completedCount}/{totalCount}
                              </span>
                            )}
                          </div>
                          <div className="space-y-1.5">
                            {dayDrills.map((drill, idx) => {
                              const actualDrillIndex = dayDrills.findIndex((d: any) => d?.id === drill?.id);
                              const isSwapping = swappingDrill?.dayIndex === dayIndex && swappingDrill?.drillIndex === actualDrillIndex;
                              const justSwapped = swapSuccess?.dayIndex === dayIndex && swapSuccess?.drillIndex === actualDrillIndex;
                              const isExpanded = expandedWeeklyDrill?.dayIndex === dayIndex && expandedWeeklyDrill?.drillIndex === idx;
                              return (
                                <DrillCard
                                  key={`weekly-${dayIndex}-${drill.id}-${idx}`}
                                  drill={drill}
                                  dayIndex={dayIndex}
                                  drillIndex={idx}
                                  actualDrillIndex={actualDrillIndex}
                                  isSwapping={isSwapping}
                                  justSwapped={justSwapped}
                                  facilityInfo={facilityInfo}
                                  onComplete={(dayIdx, drillIdx) => {
                                    markDrillComplete(dayIdx, drillIdx);
                                    setExpandedWeeklyDrill(null);
                                  }}
                                  onSwap={swapDrill}
                                  onClear={requestClearDrillFromDay}
                                  onLevelToggle={updateLevelCompletion}
                                  onYoutubeOpen={(url) => setYoutubeModal({ open: true, url })}
                                  onExpandToggle={(dayIdx, drillIdx) => {
                                    if (isExpanded) {
                                      setExpandedWeeklyDrill(null);
                                    } else {
                                      setExpandedWeeklyDrill({ dayIndex: dayIdx, drillIndex: drillIdx });
                                    }
                                  }}
                                  defaultExpanded={isExpanded}
                                  userId={user?.id ?? null}
                                  combineBestText={drill.isCombine ? (combineBestByPlannerDrillId.get(drill.id) ?? null) : null}
                                  compact
                                />
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Drill Library */}
        <div className="mb-6">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5" style={{ color: '#014421' }} />
                <h3 className="text-lg font-semibold text-gray-900">Drill Library</h3>
              </div>
              <button
                type="button"
                onClick={() => setDrillLibraryExpanded((prev) => !prev)}
                className="flex items-center justify-center rounded-lg border border-stone-200 bg-white/90 px-2.5 py-2 text-[11px] font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50/90"
                aria-expanded={drillLibraryExpanded}
                aria-controls="drill-library-content"
                aria-label={drillLibraryExpanded ? "Collapse drill library" : "Expand drill library"}
                title={drillLibraryExpanded ? "Collapse drill library" : "Expand drill library"}
              >
                {drillLibraryExpanded ? (
                  <ChevronUp className="h-3.5 w-3.5 text-stone-500" aria-hidden />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-stone-500" aria-hidden />
                )}
              </button>
            </div>
            {drillLibraryExpanded && (
              <div id="drill-library-content">
                <DrillLibrary onAssignToDay={addDrillToDay} showHeader={false} />
              </div>
            )}
          </div>
        </div>

        {/* Combine Tests */}
        <div className="mb-6">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Target className="w-5 h-5" style={{ color: '#014421' }} />
                  <h3 className="text-lg font-semibold text-gray-900">Combine Tests</h3>
                </div>
                <p className="text-xs text-gray-600 mt-1">Tap a test to start a session</p>
              </div>
              <button
                type="button"
                onClick={() => setCombineTestsExpanded((prev) => !prev)}
                className="flex items-center justify-center rounded-lg border border-stone-200 bg-white/90 px-2.5 py-2 text-[11px] font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50/90"
                aria-expanded={combineTestsExpanded}
                aria-controls="combine-tests-content"
                aria-label={combineTestsExpanded ? "Collapse combine tests" : "Expand combine tests"}
                title={combineTestsExpanded ? "Collapse combine tests" : "Expand combine tests"}
              >
                {combineTestsExpanded ? (
                  <ChevronUp className="h-3.5 w-3.5 text-stone-500" aria-hidden />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-stone-500" aria-hidden />
                )}
              </button>
            </div>

            {combineTestsExpanded && (
              <div id="combine-tests-content">
                <div
                  className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-1 px-1 scroll-smooth [scrollbar-width:thin]"
                  role="tablist"
                  aria-label="Combine test categories"
                >
                  {COMBINE_CATEGORY_IDS.map((cat) => {
                    const active = combineCategoryTab === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setCombineCategoryTab(cat)}
                        className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-colors sm:text-sm border-2 ${
                          active
                            ? "border-gray-900 bg-gray-900 text-white shadow-sm"
                            : "border-transparent bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }`}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {combineCardsForTab.length === 0 ? (
                    <p className="col-span-2 sm:col-span-3 text-center text-sm text-gray-500 py-10 px-2">
                      Coming Soon To Online Academy.
                    </p>
                  ) : (
                    combineCardsForTab.map((card) => {
                      const isGauntlet = card.visualVariant === "gauntlet";
                      return (
                        <button
                          key={card.id}
                          type="button"
                          onClick={() => router.push(card.href)}
                          className={`flex min-h-[5.25rem] flex-col items-center justify-center gap-1 px-2 py-3 rounded-xl transition-all border-2 ${
                            isGauntlet
                              ? "border-gray-900 bg-gray-900 text-white ring-2 ring-gray-900/20 ring-offset-2 ring-offset-white hover:border-[#FFA500] hover:bg-gray-800"
                              : "bg-gray-50 border-gray-200 hover:border-[#FFA500] hover:bg-gray-100"
                          }`}
                        >
                          <Target
                            className={`w-5 h-5 shrink-0 ${isGauntlet ? "text-white" : "text-gray-600"}`}
                          />
                          <span
                            className={`text-[11px] font-medium leading-tight text-center sm:text-xs max-w-full ${
                              isGauntlet ? "text-white" : "text-gray-700"
                            }`}
                          >
                            {card.label}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* YouTube Modal */}
        {youtubeModal.open && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
            onClick={() => setYoutubeModal({ open: false, url: '' })}
          >
            <div 
              className="bg-white rounded-2xl p-4 max-w-4xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Video</h3>
                <button
                  onClick={() => setYoutubeModal({ open: false, url: '' })}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>
              <div className="aspect-video w-full">
                {(() => {
                  // Convert YouTube URL to embed format
                  const embedUrl = youtubeModal.url.includes('youtube.com/watch?v=')
                    ? youtubeModal.url.replace('youtube.com/watch?v=', 'youtube.com/embed/')
                    : youtubeModal.url.includes('youtu.be/')
                    ? youtubeModal.url.replace('youtu.be/', 'youtube.com/embed/')
                    : youtubeModal.url;
                  
                  const cleanUrl = embedUrl.split('&')[0]; // Remove extra parameters
                  
                  return (
                    <iframe
                      src={cleanUrl}
                      className="w-full h-full rounded-lg"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      title="YouTube video player"
                    />
                  );
                })()}
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

