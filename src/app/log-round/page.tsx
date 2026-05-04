"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { addProfileXp, XP_AWARD_PER_LOGGED_ROUND } from "@/lib/addProfileXp";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CircleSlash,
  MoveDown,
  MoveDownLeft,
  MoveDownRight,
  MoveLeft,
  MoveRight,
  MoveUp,
  MoveUpLeft,
  MoveUpRight,
  Plus,
  Minus,
  RotateCcw,
  Save,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { logActivity } from "@/lib/activity";
import { InfoBubble } from "@/components/InfoBubble";

/** Hole results + Tee & Approach: one visual system (2-col grid, centered orphan row). */
const ROUND_COUNTER_GRID = "grid grid-cols-2 gap-3";
/** Single column width when spanning 2 (matches one grid cell with gap-3). */
const ROUND_COUNTER_GRID_SINGLE =
  "col-span-2 w-[calc((100%-0.75rem)/2)] max-w-full justify-self-center";
const ROUND_COUNTER_TILE =
  "flex min-h-[8rem] flex-col items-stretch justify-between gap-2 rounded-2xl border-2 bg-gradient-to-b from-white to-slate-50/90 px-3 py-3.5 shadow-sm transition-all";
const ROUND_COUNTER_LABEL = "text-center text-sm font-semibold leading-tight text-gray-700";
const ROUND_COUNTER_LABEL_TALL = `${ROUND_COUNTER_LABEL} flex min-h-[2.75rem] flex-col items-center justify-center gap-1 px-0.5`;
const ROUND_COUNTER_VALUE =
  "min-w-[2.5rem] text-center text-[1.75rem] font-bold tabular-nums leading-none tracking-tight text-gray-900 sm:text-3xl";
const ROUND_STEP_ROW = "flex items-center justify-center gap-2";
const ROUND_STEP_BTN =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 transition-colors active:scale-[0.98]";

/** Direction / GIR taps on the 3×3 matrix. */
type AdvancedApproachMatrixResult =
  | "top-left"
  | "top"
  | "top-right"
  | "left"
  | "gir"
  | "right"
  | "bottom-left"
  | "bottom"
  | "bottom-right";

/** Matrix results plus “no realistic GIR” situations (tee trouble or distance / lay-up). */
type AdvancedApproachResult =
  | AdvancedApproachMatrixResult
  | "tee-no-gir"
  | "distance-no-gir";

type DirectionalApproachShot = {
  id: string;
  hole: number;
  club: string;
  result: AdvancedApproachResult;
};

function newApproachShotId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `ap-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const APPROACH_CLUB_OPTIONS = [
  "Driver",
  "3W",
  "5W",
  "3H",
  "4H",
  "5H",
  "4i",
  "5i",
  "6i",
  "7i",
  "8i",
  "9i",
  "PW",
  "GW",
  "SW",
  "LW",
] as const;

const APPROACH_RESULT_ICONS: Record<AdvancedApproachMatrixResult, LucideIcon> = {
  "top-left": MoveUpLeft,
  top: MoveUp,
  "top-right": MoveUpRight,
  left: MoveLeft,
  gir: Check,
  right: MoveRight,
  "bottom-left": MoveDownLeft,
  bottom: MoveDown,
  "bottom-right": MoveDownRight,
};

const APPROACH_MATRIX_ROWS: AdvancedApproachMatrixResult[][] = [
  ["top-left", "top", "top-right"],
  ["left", "gir", "right"],
  ["bottom-left", "bottom", "bottom-right"],
];

function formatApproachResultLabel(result: AdvancedApproachResult): string {
  if (result === "tee-no-gir") return "Tee / recovery — no GIR line";
  if (result === "distance-no-gir") return "Too far / lay-up — no GIR line";
  if (result === "gir") return "GIR (green hit)";
  return result.replace(/-/g, " ");
}

interface RoundData {
  // Scoring Card
  date: string;
  course: string;
  handicap: number | null; // Supports decimals
  holes: number;
  score: number | null; // Supports decimals
  nett: number | null; // Calculated with one decimal place
  eagles: number;
  birdies: number;
  pars: number;
  bogeys: number;
  doubleBogeys: number;
  
  // Tee & Approach Card
  firLeft: number;
  firHit: number;
  firRight: number;
  totalGir: number;
  totalPenalties: number;
  teePenalties: number;
  approachPenalties: number;
  goingForGreen: number;
  gir8ft: number;
  gir20ft: number;
  
  // Short Game Card
  upAndDownConversions: number;
  missed: number;
  bunkerAttempts: number;
  bunkerSaves: number;
  chipInside6ft: number;
  doubleChips: number;
  
  // Putting Card
  /** Stored as a number (may be fractional); entry uses text state so decimals type cleanly. */
  totalPutts: number;
  threePutts: number;
  made6ftAndIn: number;
  puttsUnder6ftAttempts: number; // Total attempts from < 6ft
}

/** Parse a text field to a finite number, or null when empty / incomplete / invalid. */
function optionalNumberFromInput(value: string): number | null {
  const t = value.trim();
  if (t === "" || t === "." || t === "-") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export default function LogRoundPage() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const today = new Date().toISOString().split('T')[0];
  const [isSaving, setIsSaving] = useState(false);
  
  const [roundData, setRoundData] = useState<RoundData>({
    date: today,
    course: '',
    handicap: null,
    holes: 18,
    score: null,
    nett: null,
    eagles: 0,
    birdies: 0,
    pars: 0,
    bogeys: 0,
    doubleBogeys: 0,
    firLeft: 0,
    firHit: 0,
    firRight: 0,
    totalGir: 0,
    totalPenalties: 0,
    teePenalties: 0,
    approachPenalties: 0,
    goingForGreen: 0,
    gir8ft: 0,
    gir20ft: 0,
    upAndDownConversions: 0,
    missed: 0,
    bunkerAttempts: 0,
    bunkerSaves: 0,
    chipInside6ft: 0,
    doubleChips: 0,
    totalPutts: 0,
    threePutts: 0,
    made6ftAndIn: 0,
    puttsUnder6ftAttempts: 0,
  });

  /** Controlled strings so values like `83.` stay editable while still syncing numeric `roundData`. */
  const [scoreText, setScoreText] = useState("");
  const [handicapText, setHandicapText] = useState("");
  const [totalPuttsText, setTotalPuttsText] = useState("");

  const [showAdvancedApproachMatrix, setShowAdvancedApproachMatrix] = useState(false);
  const [selectedApproachHole, setSelectedApproachHole] = useState(1);
  const [selectedApproachClub, setSelectedApproachClub] = useState<string>("7i");
  const [directionalApproachShots, setDirectionalApproachShots] = useState<
    DirectionalApproachShot[]
  >([]);
  const [lastTappedApproachResult, setLastTappedApproachResult] =
    useState<AdvancedApproachResult | null>(null);

  useEffect(() => {
    setDirectionalApproachShots((prev) =>
      prev.filter((s) => s.hole >= 1 && s.hole <= roundData.holes),
    );
    setSelectedApproachHole((h) => Math.min(Math.max(1, h), roundData.holes));
  }, [roundData.holes]);

  const appendDirectionalApproachShot = (result: AdvancedApproachResult) => {
    const holeForShot = selectedApproachHole;
    const maxHole = roundData.holes;
    setDirectionalApproachShots((prev) => [
      ...prev,
      {
        id: newApproachShotId(),
        hole: holeForShot,
        club: selectedApproachClub,
        result,
      },
    ]);
    setLastTappedApproachResult(result);
    setSelectedApproachHole((h) => Math.min(maxHole, h + 1));
  };

  const removeDirectionalApproachShot = (id: string) => {
    setDirectionalApproachShots((prev) => prev.filter((s) => s.id !== id));
  };

  const shotsForSelectedApproachHole = directionalApproachShots.filter(
    (s) => s.hole === selectedApproachHole,
  );

  const updateField = (field: keyof RoundData, value: any) => {
    setRoundData(prev => {
      const updated = { ...prev, [field]: value };
      // Auto-calculate Nett if Score and Handicap are set
      if (field === 'score' || field === 'handicap') {
        if (updated.score !== null && updated.handicap !== null) {
          // Calculate Nett with one decimal place
          updated.nett = Math.round((updated.score - updated.handicap) * 10) / 10;
        } else {
          updated.nett = null;
        }
      }
      return updated;
    });
  };

  const incrementCounter = (field: keyof RoundData) => {
    setRoundData(prev => {
      const newValue = (prev[field] as number) + 1;
      
      // If we're incrementing Made < 6ft, ensure it doesn't exceed Attempts
      if (field === 'made6ftAndIn' && newValue > prev.puttsUnder6ftAttempts) {
        return prev;
      }
      
      return {
        ...prev,
        [field]: newValue
      };
    });
  };

  const decrementCounter = (field: keyof RoundData) => {
    setRoundData(prev => {
      const newValue = Math.max(0, (prev[field] as number) - 1);
      
      // If we're decrementing Attempts, ensure Made < 6ft doesn't exceed the new Attempts value
      if (field === 'puttsUnder6ftAttempts' && prev.made6ftAndIn > newValue) {
        return {
          ...prev,
          [field]: newValue,
          made6ftAndIn: newValue
        };
      }
      
      return {
        ...prev,
        [field]: newValue
      };
    });
  };

  const clearTeeApproach = () => {
    setRoundData(prev => ({
      ...prev,
      firLeft: 0,
      firHit: 0,
      firRight: 0,
      totalGir: 0,
      totalPenalties: 0,
      teePenalties: 0,
      approachPenalties: 0,
      goingForGreen: 0,
      gir8ft: 0,
      gir20ft: 0,
    }));
    setDirectionalApproachShots([]);
    setShowAdvancedApproachMatrix(false);
    setLastTappedApproachResult(null);
    setSelectedApproachHole(1);
  };

  const clearShortGame = () => {
    setRoundData(prev => ({
      ...prev,
      upAndDownConversions: 0,
      missed: 0,
      bunkerAttempts: 0,
      bunkerSaves: 0,
      chipInside6ft: 0,
      doubleChips: 0,
    }));
  };

  const clearPutting = () => {
    setTotalPuttsText("");
    setRoundData(prev => ({
      ...prev,
      totalPutts: 0,
      threePutts: 0,
      made6ftAndIn: 0,
      puttsUnder6ftAttempts: 0,
    }));
  };

  const saveRound = async () => {
    // Validate required fields
    if (!roundData.course || roundData.score === null || roundData.totalPutts === 0) {
      alert('Please fill in all required fields (Course, Score, Total Putts)');
      return;
    }

    if (!user?.id) {
      console.error('User not authenticated - user.id is missing:', user);
      alert('User not authenticated. Please log in and try again.');
      return;
    }

    // Explicitly validate and set user_id before saving
    const currentUserId = user.id;
    if (!currentUserId) {
      console.error('User ID is missing or invalid:', { user, userId: currentUserId });
      alert('User ID is missing. Please log out and log back in, then try again.');
      setIsSaving(false);
      return;
    }

    console.log('Saving round with explicit user_id:', currentUserId);
    setIsSaving(true);

    try {
      // Save to database only - no localStorage
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();

      // Prepare insert data with ALL fields - every UI input mapped to database
      // Complete mapping of all stats including Proximity, Short Game, and 3-Putt
      const insertData: Record<string, any> = {
        user_id: currentUserId, // Explicitly set to logged-in user's ID
        date: roundData.date || today,
        course_name: roundData.course, // Database expects course_name, not course
        handicap: roundData.handicap,
        holes: roundData.holes,
        score: roundData.score,
        nett: roundData.nett,
        // Scoring stats
        eagles: roundData.eagles,
        birdies: roundData.birdies,
        pars: roundData.pars,
        bogeys: roundData.bogeys,
        double_bogeys: roundData.doubleBogeys, // Maps '2+ Bogey' from UI to database column
        // Tee & Approach stats
        fir_left: roundData.firLeft,
        fir_hit: roundData.firHit,
        fir_right: roundData.firRight,
        total_gir: roundData.totalGir,
        going_for_green: roundData.goingForGreen,
        // Proximity stats (GIR Proximity)
        gir_8ft: roundData.gir8ft, // Proximity: Inside 8ft
        gir_20ft: roundData.gir20ft, // Proximity: Inside 20ft
        // Penalty stats
        total_penalties: roundData.totalPenalties,
        tee_penalties: roundData.teePenalties,
        approach_penalties: roundData.approachPenalties,
        // Short Game stats
        up_and_down_conversions: roundData.upAndDownConversions, // Conversions under Up & Down
        conversions: roundData.upAndDownConversions, // Also map to conversions column
        up_and_down_missed: roundData.missed, // Missed under Up & Down maps to up_and_down_missed
        missed: roundData.missed, // Also keep missed for backward compatibility
        bunker_attempts: roundData.bunkerAttempts,
        bunker_saves: roundData.bunkerSaves,
        chip_ins: roundData.doubleChips || 0, // Chip ins
        chip_inside_6ft: roundData.chipInside6ft, // Chips ending inside 6ft
        double_chips: roundData.doubleChips,
        // Putting stats
        total_putts: roundData.totalPutts,
        three_putts: roundData.threePutts, // 3-Putt stat
        made_under_6ft: roundData.made6ftAndIn,
        putts_under_6ft_attempts: roundData.puttsUnder6ftAttempts,
        approach_directional_shots: directionalApproachShots,
      };

      console.log('Attempting to save round with user_id:', currentUserId);
      console.log('Verified user_id before insert:', insertData.user_id);
      console.log('Complete round data being inserted (ALL FIELDS):', {
        user_id: insertData.user_id,
        date: insertData.date,
        course_name: insertData.course_name,
        score: insertData.score,
        // Scoring
        eagles: insertData.eagles,
        birdies: insertData.birdies,
        pars: insertData.pars,
        bogeys: insertData.bogeys,
        double_bogeys: insertData.double_bogeys,
        // Approach & Proximity
        total_gir: insertData.total_gir,
        gir_8ft: insertData.gir_8ft,
        gir_20ft: insertData.gir_20ft,
        going_for_green: insertData.going_for_green,
        // Penalties
        tee_penalties: insertData.tee_penalties,
        approach_penalties: insertData.approach_penalties,
        // Short Game
        up_and_down_conversions: insertData.up_and_down_conversions,
        conversions: insertData.conversions,
        up_and_down_missed: insertData.up_and_down_missed,
        missed: insertData.missed,
        bunker_attempts: insertData.bunker_attempts,
        bunker_saves: insertData.bunker_saves,
        chip_ins: insertData.chip_ins,
        chip_inside_6ft: insertData.chip_inside_6ft,
        // Putting (including 3-Putt)
        total_putts: insertData.total_putts,
        three_putts: insertData.three_putts,
        made_under_6ft: insertData.made_under_6ft, // Made < 6ft
        putts_under_6ft_attempts: insertData.putts_under_6ft_attempts,
      });

      const { data, error } = await supabase
        .from('rounds')
        .insert(insertData)
        .select();

      if (error) {
        console.error('Database error saving round:', error);
        console.error('Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        
        // Check for missing column errors (PGRST204)
        if (error.code === 'PGRST204' || error.message?.includes('column') || error.message?.includes('does not exist')) {
          console.warn('WARNING: Database column mismatch detected. The database schema may be missing some columns.');
          console.warn('Insert data attempted:', Object.keys(insertData));
          console.warn('This is a schema mismatch issue. Some columns may need to be added to the database.');
        }
        
        alert(`Failed to save round: ${error.message || 'Unknown error'}. Please check the console for details.`);
        setIsSaving(false);
        return;
      }

      console.log('Round saved successfully!', data);
      console.log('Round saved successfully');

      await addProfileXp(currentUserId, XP_AWARD_PER_LOGGED_ROUND);
      await refreshUser();

      // Log activity to database
      await logActivity(user.id, 'round', `Posted a round of ${roundData.score}`);

      // Update handicap history and profile if a handicap was provided
      if (roundData.handicap !== null && roundData.handicap !== undefined) {
        // 1. Insert into handicap_history
        const { error: historyError } = await supabase
          .from('handicap_history')
          .insert({
            user_id: currentUserId,
            score: roundData.score,
            new_handicap: roundData.handicap
          });
          
        if (historyError) {
          console.error('Error saving handicap history:', historyError);
        }
        
        // 2. Update profiles table with new handicap
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ handicap: roundData.handicap })
          .eq('id', currentUserId);
          
        if (profileError) {
          console.error('Error updating profile handicap:', profileError);
        }
      }

      // Dispatch event to refresh rounds from database
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('roundsUpdated'));
        // Force Academy Leaderboard refresh by dispatching a custom event
        window.dispatchEvent(new Event('academyLeaderboardRefresh'));
      }

      setIsSaving(false);
      // Navigate to academy page to see the updated leaderboard
      router.push('/academy');
    } catch (error) {
      console.error('Unexpected error saving round:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      alert(`Failed to save round: ${error instanceof Error ? error.message : 'Unknown error'}. Please check the console for details.`);
      setIsSaving(false);
    }
  };

  const isRequiredFilled = roundData.course && roundData.score !== null && roundData.totalPutts > 0;

  return (
    <div className="flex-1 w-full flex flex-col bg-[#014421]">
      {/* Header */}
      <div className="shrink-0 px-4 pt-6 pb-4 flex items-center gap-4 sticky top-0 z-10" style={{ backgroundColor: '#014421' }}>
        <button
          onClick={() => router.back()}
          className="p-2 rounded-lg text-white hover:bg-white/10 transition-colors"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white">Round Performance Entry</h1>
          <p className="text-white/80 text-sm">Enter your performance metrics</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 pt-4 pb-32">
        <div className="max-w-md mx-auto">
          <div className="space-y-4 pb-6">
          {/* Scoring Card */}
          <div className="bg-white rounded-2xl p-4 shadow-lg">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Scoring</h2>
            
            <div className="space-y-3">
              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  value={roundData.date}
                  onChange={(e) => updateField('date', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#FFA500] focus:outline-none text-gray-900"
                />
              </div>

              {/* Course */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Course *</label>
                <input
                  type="text"
                  value={roundData.course}
                  onChange={(e) => updateField('course', e.target.value)}
                  placeholder="Enter course name"
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#FFA500] focus:outline-none text-gray-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Handicap */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Handicap</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={handicapText}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setHandicapText(raw);
                      updateField("handicap", optionalNumberFromInput(raw));
                    }}
                    placeholder="0.0"
                    className="w-full px-4 py-3 rounded-xl border-2 focus:outline-none transition-colors"
                    style={{ 
                      color: roundData.handicap !== null ? '#FFA500' : '#6B7280',
                      borderColor: roundData.handicap !== null ? '#FFA500' : '#E5E7EB'
                    }}
                  />
                </div>

                {/* Holes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Holes</label>
                  <select
                    value={roundData.holes}
                    onChange={(e) => updateField('holes', parseInt(e.target.value))}
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#FFA500] focus:outline-none text-gray-900"
                  >
                    <option value={9}>9 Holes</option>
                    <option value={18}>18 Holes</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Score */}
                <div>
                  <div className="flex items-center gap-1 mb-1">
                    <label className="block text-sm font-medium text-gray-700">Score *</label>
                    <InfoBubble content="Total gross score for the round." />
                  </div>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={scoreText}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setScoreText(raw);
                      updateField("score", optionalNumberFromInput(raw));
                    }}
                    placeholder="0"
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#FFA500] focus:outline-none text-gray-900"
                  />
                </div>

                {/* Nett */}
                <div>
                  <div className="flex items-center gap-1 mb-1">
                    <label className="block text-sm font-medium text-gray-700">Nett</label>
                    <InfoBubble content="Gross score minus handicap." />
                  </div>
                  <input
                    type="number"
                    step="0.1"
                    value={roundData.nett !== null ? roundData.nett.toFixed(1) : ''}
                    readOnly
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-300 bg-gray-50"
                    style={{ color: roundData.nett !== null ? '#FFA500' : '#9CA3AF' }}
                  />
                </div>
              </div>

              {/* Hole Results — same tile chrome as Tee & Approach */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Hole Results</label>
                <div className={ROUND_COUNTER_GRID}>
                  {/* Eagle */}
                  <div className={`${ROUND_COUNTER_TILE} border-gray-200`}>
                    <span className={ROUND_COUNTER_LABEL}>Eagle</span>
                    <div className={ROUND_STEP_ROW}>
                      <button
                        type="button"
                        onClick={() => decrementCounter("eagles")}
                        className={`${ROUND_STEP_BTN} border-gray-200 bg-white text-gray-600 hover:bg-gray-50`}
                      >
                        <Minus className="h-5 w-5" />
                      </button>
                      <span className={ROUND_COUNTER_VALUE} style={{ color: roundData.eagles > 0 ? "#FFA500" : "#111827" }}>
                        {roundData.eagles}
                      </span>
                      <button
                        type="button"
                        onClick={() => incrementCounter("eagles")}
                        className={`${ROUND_STEP_BTN} border-gray-200 bg-white text-gray-600 hover:bg-gray-50`}
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  {/* Birdie */}
                  <div className={`${ROUND_COUNTER_TILE} border-gray-200`}>
                    <span className={ROUND_COUNTER_LABEL}>Birdie</span>
                    <div className={ROUND_STEP_ROW}>
                      <button
                        type="button"
                        onClick={() => decrementCounter("birdies")}
                        className={`${ROUND_STEP_BTN} border-gray-200 bg-white text-gray-600 hover:bg-gray-50`}
                      >
                        <Minus className="h-5 w-5" />
                      </button>
                      <span className={ROUND_COUNTER_VALUE} style={{ color: roundData.birdies > 0 ? "#FFA500" : "#111827" }}>
                        {roundData.birdies}
                      </span>
                      <button
                        type="button"
                        onClick={() => incrementCounter("birdies")}
                        className={`${ROUND_STEP_BTN} border-gray-200 bg-white text-gray-600 hover:bg-gray-50`}
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  {/* Par */}
                  <div className={`${ROUND_COUNTER_TILE} border-gray-200`}>
                    <span className={ROUND_COUNTER_LABEL}>Par</span>
                    <div className={ROUND_STEP_ROW}>
                      <button
                        type="button"
                        onClick={() => decrementCounter("pars")}
                        className={`${ROUND_STEP_BTN} border-gray-200 bg-white text-gray-600 hover:bg-gray-50`}
                      >
                        <Minus className="h-5 w-5" />
                      </button>
                      <span className={ROUND_COUNTER_VALUE} style={{ color: roundData.pars > 0 ? "#FFA500" : "#111827" }}>
                        {roundData.pars}
                      </span>
                      <button
                        type="button"
                        onClick={() => incrementCounter("pars")}
                        className={`${ROUND_STEP_BTN} border-gray-200 bg-white text-gray-600 hover:bg-gray-50`}
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  {/* Bogey */}
                  <div className={`${ROUND_COUNTER_TILE} border-gray-200`}>
                    <span className={ROUND_COUNTER_LABEL}>Bogey</span>
                    <div className={ROUND_STEP_ROW}>
                      <button
                        type="button"
                        onClick={() => decrementCounter("bogeys")}
                        className={`${ROUND_STEP_BTN} border-gray-200 bg-white text-gray-600 hover:bg-gray-50`}
                      >
                        <Minus className="h-5 w-5" />
                      </button>
                      <span className={ROUND_COUNTER_VALUE} style={{ color: roundData.bogeys > 0 ? "#FFA500" : "#111827" }}>
                        {roundData.bogeys}
                      </span>
                      <button
                        type="button"
                        onClick={() => incrementCounter("bogeys")}
                        className={`${ROUND_STEP_BTN} border-gray-200 bg-white text-gray-600 hover:bg-gray-50`}
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  {/* 2+ Bogey — centered under 2-col grid */}
                  <div className={`${ROUND_COUNTER_GRID_SINGLE} ${ROUND_COUNTER_TILE} border-gray-200`}>
                    <span className={ROUND_COUNTER_LABEL}>2+ Bogey</span>
                    <div className={ROUND_STEP_ROW}>
                      <button
                        type="button"
                        onClick={() => decrementCounter("doubleBogeys")}
                        className={`${ROUND_STEP_BTN} border-gray-200 bg-white text-gray-600 hover:bg-gray-50`}
                      >
                        <Minus className="h-5 w-5" />
                      </button>
                      <span className={ROUND_COUNTER_VALUE} style={{ color: roundData.doubleBogeys > 0 ? "#FFA500" : "#111827" }}>
                        {roundData.doubleBogeys}
                      </span>
                      <button
                        type="button"
                        onClick={() => incrementCounter("doubleBogeys")}
                        className={`${ROUND_STEP_BTN} border-gray-200 bg-white text-gray-600 hover:bg-gray-50`}
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Tee & Approach Card */}
          <div className="bg-white rounded-2xl p-4 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Tee & Approach</h2>
              <button
                onClick={clearTeeApproach}
                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                title="Clear all"
              >
                <RotateCcw className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            
            <div className="space-y-4">
              {/* FIR */}
              <div>
                <div className="flex items-center gap-1 mb-3">
                  <label className="block text-sm font-medium text-gray-700">Fairways in Regulation</label>
                  <InfoBubble content="The tee shot lands on the fairway on Par 4s and Par 5s." />
                </div>
                <div className={ROUND_COUNTER_GRID}>
                  {/* FIR Left */}
                  <div
                    className={`${ROUND_COUNTER_TILE} ${
                      roundData.firLeft > 0 ? "border-[#FFA500]" : "border-gray-200"
                    }`}
                    style={{
                      backgroundColor: roundData.firLeft > 0 ? "#FFF7ED" : "white",
                    }}
                  >
                    <div className="text-center text-sm font-semibold leading-tight" style={{ color: roundData.firLeft > 0 ? "#014421" : "#6B7280" }}>
                      Left
                    </div>
                    <div className={ROUND_STEP_ROW}>
                      <button
                        onClick={() => decrementCounter("firLeft")}
                        className={`${ROUND_STEP_BTN} border-gray-200 bg-white hover:bg-gray-50`}
                        style={{
                          borderColor: roundData.firLeft > 0 ? "#014421" : "#D1D5DB",
                          color: roundData.firLeft > 0 ? "#014421" : "#6B7280",
                        }}
                      >
                        <Minus className="h-5 w-5" />
                      </button>
                      <span className={ROUND_COUNTER_VALUE} style={{ color: roundData.firLeft > 0 ? "#014421" : "#111827" }}>
                        {roundData.firLeft}
                      </span>
                      <button
                        onClick={() => incrementCounter("firLeft")}
                        className={`${ROUND_STEP_BTN} border-gray-200 bg-white hover:bg-gray-50`}
                        style={{
                          borderColor: roundData.firLeft > 0 ? "#014421" : "#D1D5DB",
                          color: roundData.firLeft > 0 ? "#014421" : "#6B7280",
                        }}
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  {/* FIR Hit */}
                  <div
                    className={`${ROUND_COUNTER_TILE} ${roundData.firHit > 0 ? "border-[#FFA500]" : "border-gray-200"}`}
                    style={{
                      backgroundColor: roundData.firHit > 0 ? "#FFF7ED" : "white",
                    }}
                  >
                    <div className="text-center text-sm font-semibold leading-tight" style={{ color: roundData.firHit > 0 ? "#014421" : "#6B7280" }}>
                      Hit
                    </div>
                    <div className={ROUND_STEP_ROW}>
                      <button
                        onClick={() => decrementCounter("firHit")}
                        className={`${ROUND_STEP_BTN} border-gray-200 bg-white hover:bg-gray-50`}
                        style={{
                          borderColor: roundData.firHit > 0 ? "#014421" : "#D1D5DB",
                          color: roundData.firHit > 0 ? "#014421" : "#6B7280",
                        }}
                      >
                        <Minus className="h-5 w-5" />
                      </button>
                      <span className={ROUND_COUNTER_VALUE} style={{ color: roundData.firHit > 0 ? "#014421" : "#111827" }}>
                        {roundData.firHit}
                      </span>
                      <button
                        onClick={() => incrementCounter("firHit")}
                        className={`${ROUND_STEP_BTN} border-gray-200 bg-white hover:bg-gray-50`}
                        style={{
                          borderColor: roundData.firHit > 0 ? "#014421" : "#D1D5DB",
                          color: roundData.firHit > 0 ? "#014421" : "#6B7280",
                        }}
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  {/* FIR Right */}
                  <div
                    className={`${ROUND_COUNTER_GRID_SINGLE} ${ROUND_COUNTER_TILE} ${
                      roundData.firRight > 0 ? "border-[#FFA500]" : "border-gray-200"
                    }`}
                    style={{
                      backgroundColor: roundData.firRight > 0 ? "#FFF7ED" : "white",
                    }}
                  >
                    <div className="text-center text-sm font-semibold leading-tight" style={{ color: roundData.firRight > 0 ? "#014421" : "#6B7280" }}>
                      Right
                    </div>
                    <div className={ROUND_STEP_ROW}>
                      <button
                        onClick={() => decrementCounter("firRight")}
                        className={`${ROUND_STEP_BTN} border-gray-200 bg-white hover:bg-gray-50`}
                        style={{
                          borderColor: roundData.firRight > 0 ? "#014421" : "#D1D5DB",
                          color: roundData.firRight > 0 ? "#014421" : "#6B7280",
                        }}
                      >
                        <Minus className="h-5 w-5" />
                      </button>
                      <span className={ROUND_COUNTER_VALUE} style={{ color: roundData.firRight > 0 ? "#014421" : "#111827" }}>
                        {roundData.firRight}
                      </span>
                      <button
                        onClick={() => incrementCounter("firRight")}
                        className={`${ROUND_STEP_BTN} border-gray-200 bg-white hover:bg-gray-50`}
                        style={{
                          borderColor: roundData.firRight > 0 ? "#014421" : "#D1D5DB",
                          color: roundData.firRight > 0 ? "#014421" : "#6B7280",
                        }}
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Penalties */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Penalties</label>
                <div className={ROUND_COUNTER_GRID}>
                  {/* Total Penalties */}
                  <div
                    className={`${ROUND_COUNTER_TILE} ${
                      roundData.totalPenalties > 0 ? "border-[#FFA500]" : "border-gray-200"
                    }`}
                    style={{
                      backgroundColor: roundData.totalPenalties > 0 ? "#FFF7ED" : "white",
                    }}
                  >
                    <div className="text-center text-sm font-semibold leading-tight" style={{ color: roundData.totalPenalties > 0 ? "#014421" : "#6B7280" }}>
                      Total
                    </div>
                    <div className={ROUND_STEP_ROW}>
                      <button
                        onClick={() => decrementCounter("totalPenalties")}
                        className={`${ROUND_STEP_BTN} border-gray-200 bg-white hover:bg-gray-50`}
                        style={{
                          borderColor: roundData.totalPenalties > 0 ? "#014421" : "#D1D5DB",
                          color: roundData.totalPenalties > 0 ? "#014421" : "#6B7280",
                        }}
                      >
                        <Minus className="h-5 w-5" />
                      </button>
                      <span className={ROUND_COUNTER_VALUE} style={{ color: roundData.totalPenalties > 0 ? "#014421" : "#111827" }}>
                        {roundData.totalPenalties}
                      </span>
                      <button
                        onClick={() => incrementCounter("totalPenalties")}
                        className={`${ROUND_STEP_BTN} border-gray-200 bg-white hover:bg-gray-50`}
                        style={{
                          borderColor: roundData.totalPenalties > 0 ? "#014421" : "#D1D5DB",
                          color: roundData.totalPenalties > 0 ? "#014421" : "#6B7280",
                        }}
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  {/* Tee Penalties */}
                  <div
                    className={`${ROUND_COUNTER_TILE} ${roundData.teePenalties > 0 ? "border-[#FFA500]" : "border-gray-200"}`}
                    style={{
                      backgroundColor: roundData.teePenalties > 0 ? "#FFF7ED" : "white",
                    }}
                  >
                    <div className="text-center text-sm font-semibold leading-tight" style={{ color: roundData.teePenalties > 0 ? "#014421" : "#6B7280" }}>
                      Tee
                    </div>
                    <div className={ROUND_STEP_ROW}>
                      <button
                        onClick={() => decrementCounter("teePenalties")}
                        className={`${ROUND_STEP_BTN} border-gray-200 bg-white hover:bg-gray-50`}
                        style={{
                          borderColor: roundData.teePenalties > 0 ? "#014421" : "#D1D5DB",
                          color: roundData.teePenalties > 0 ? "#014421" : "#6B7280",
                        }}
                      >
                        <Minus className="h-5 w-5" />
                      </button>
                      <span className={ROUND_COUNTER_VALUE} style={{ color: roundData.teePenalties > 0 ? "#014421" : "#111827" }}>
                        {roundData.teePenalties}
                      </span>
                      <button
                        onClick={() => incrementCounter("teePenalties")}
                        className={`${ROUND_STEP_BTN} border-gray-200 bg-white hover:bg-gray-50`}
                        style={{
                          borderColor: roundData.teePenalties > 0 ? "#014421" : "#D1D5DB",
                          color: roundData.teePenalties > 0 ? "#014421" : "#6B7280",
                        }}
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  {/* Approach Penalties */}
                  <div
                    className={`${ROUND_COUNTER_GRID_SINGLE} ${ROUND_COUNTER_TILE} ${
                      roundData.approachPenalties > 0 ? "border-[#FFA500]" : "border-gray-200"
                    }`}
                    style={{
                      backgroundColor: roundData.approachPenalties > 0 ? "#FFF7ED" : "white",
                    }}
                  >
                    <div className="text-center text-sm font-semibold leading-tight" style={{ color: roundData.approachPenalties > 0 ? "#014421" : "#6B7280" }}>
                      Approach
                    </div>
                    <div className={ROUND_STEP_ROW}>
                      <button
                        onClick={() => decrementCounter("approachPenalties")}
                        className={`${ROUND_STEP_BTN} border-gray-200 bg-white hover:bg-gray-50`}
                        style={{
                          borderColor: roundData.approachPenalties > 0 ? "#014421" : "#D1D5DB",
                          color: roundData.approachPenalties > 0 ? "#014421" : "#6B7280",
                        }}
                      >
                        <Minus className="h-5 w-5" />
                      </button>
                      <span className={ROUND_COUNTER_VALUE} style={{ color: roundData.approachPenalties > 0 ? "#014421" : "#111827" }}>
                        {roundData.approachPenalties}
                      </span>
                      <button
                        onClick={() => incrementCounter("approachPenalties")}
                        className={`${ROUND_STEP_BTN} border-gray-200 bg-white hover:bg-gray-50`}
                        style={{
                          borderColor: roundData.approachPenalties > 0 ? "#014421" : "#D1D5DB",
                          color: roundData.approachPenalties > 0 ? "#014421" : "#6B7280",
                        }}
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Greens in Regulation */}
              <div>
                <div className="flex items-center gap-1 mb-2">
                  <label className="block text-sm font-medium text-gray-700">Greens in Regulation</label>
                  <InfoBubble
                    content={
                      <>
                        <span className="font-semibold">Tier 1 (Base):</span> Green hit → &quot;GIR&quot;
                        <br />
                        <span className="font-semibold">Tier 2 (Proximity):</span> Ball inside 20ft → &quot;GIR + 20ft GIR&quot;
                        <br />
                        <span className="font-semibold">Tier 3 (Elite):</span> Ball inside 8ft → &quot;GIR + 20ft GIR + 8ft GIR&quot;
                      </>
                    }
                    tooltipClassName="left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 max-w-[200px]"
                  />
                </div>
                <div className={ROUND_COUNTER_GRID}>
                  {/* Total GIR */}
                  <div
                    className={`${ROUND_COUNTER_TILE} ${roundData.totalGir > 0 ? "border-[#FFA500]" : "border-gray-200"}`}
                    style={{
                      backgroundColor: roundData.totalGir > 0 ? "#FFF7ED" : "white",
                    }}
                  >
                    <div
                      className={`${ROUND_COUNTER_LABEL} flex min-h-[2.75rem] items-center justify-center`}
                      style={{ color: roundData.totalGir > 0 ? "#014421" : "#6B7280" }}
                    >
                      Total GIR
                    </div>
                    <div className={ROUND_STEP_ROW}>
                      <button
                        onClick={() => decrementCounter("totalGir")}
                        className={`${ROUND_STEP_BTN} border-gray-200 bg-white hover:bg-gray-50`}
                        style={{
                          borderColor: roundData.totalGir > 0 ? "#014421" : "#D1D5DB",
                          color: roundData.totalGir > 0 ? "#014421" : "#6B7280",
                        }}
                      >
                        <Minus className="h-5 w-5" />
                      </button>
                      <span className={ROUND_COUNTER_VALUE} style={{ color: roundData.totalGir > 0 ? "#014421" : "#111827" }}>
                        {roundData.totalGir}
                      </span>
                      <button
                        onClick={() => incrementCounter("totalGir")}
                        className={`${ROUND_STEP_BTN} border-gray-200 bg-white hover:bg-gray-50`}
                        style={{
                          borderColor: roundData.totalGir > 0 ? "#014421" : "#D1D5DB",
                          color: roundData.totalGir > 0 ? "#014421" : "#6B7280",
                        }}
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  {/* Inside 8ft */}
                  <div
                    className={`${ROUND_COUNTER_TILE} ${roundData.gir8ft > 0 ? "border-[#FFA500]" : "border-gray-200"}`}
                    style={{
                      backgroundColor: roundData.gir8ft > 0 ? "#FFF7ED" : "white",
                    }}
                  >
                    <div className="flex min-h-[2.75rem] flex-col items-center justify-center gap-1 text-center">
                      <span className="text-sm font-semibold leading-tight" style={{ color: roundData.gir8ft > 0 ? "#014421" : "#6B7280" }}>
                        Inside 8ft
                      </span>
                      <InfoBubble
                        content="2.4m"
                        buttonClassName="flex h-3 w-3 shrink-0 items-center justify-center rounded-full border bg-white/50 text-[8px] font-bold cursor-help"
                        buttonStyle={{
                          borderColor: roundData.gir8ft > 0 ? "#014421" : "#E5E7EB",
                          color: roundData.gir8ft > 0 ? "#014421" : "#9CA3AF",
                        }}
                        tooltipClassName="left-1/2 bottom-full mb-2 w-24 -translate-x-1/2 p-1.5 text-center"
                      />
                    </div>
                    <div className={ROUND_STEP_ROW}>
                      <button
                        onClick={() => decrementCounter("gir8ft")}
                        className={`${ROUND_STEP_BTN} border-gray-200 bg-white hover:bg-gray-50`}
                        style={{
                          borderColor: roundData.gir8ft > 0 ? "#014421" : "#D1D5DB",
                          color: roundData.gir8ft > 0 ? "#014421" : "#6B7280",
                        }}
                      >
                        <Minus className="h-5 w-5" />
                      </button>
                      <span className={ROUND_COUNTER_VALUE} style={{ color: roundData.gir8ft > 0 ? "#014421" : "#111827" }}>
                        {roundData.gir8ft}
                      </span>
                      <button
                        onClick={() => incrementCounter("gir8ft")}
                        className={`${ROUND_STEP_BTN} border-gray-200 bg-white hover:bg-gray-50`}
                        style={{
                          borderColor: roundData.gir8ft > 0 ? "#014421" : "#D1D5DB",
                          color: roundData.gir8ft > 0 ? "#014421" : "#6B7280",
                        }}
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  {/* Inside 20ft */}
                  <div
                    className={`${ROUND_COUNTER_TILE} ${roundData.gir20ft > 0 ? "border-[#FFA500]" : "border-gray-200"}`}
                    style={{
                      backgroundColor: roundData.gir20ft > 0 ? "#FFF7ED" : "white",
                    }}
                  >
                    <div className="flex min-h-[2.75rem] flex-col items-center justify-center gap-1 px-0.5 text-center">
                      <span className="text-sm font-semibold leading-tight" style={{ color: roundData.gir20ft > 0 ? "#014421" : "#6B7280" }}>
                        Inside 20ft
                      </span>
                      <InfoBubble
                        content="6.1m. Note: Also includes shots inside 8ft."
                        buttonClassName="flex h-3 w-3 shrink-0 items-center justify-center rounded-full border bg-white/50 text-[8px] font-bold cursor-help"
                        buttonStyle={{
                          borderColor: roundData.gir20ft > 0 ? "#014421" : "#E5E7EB",
                          color: roundData.gir20ft > 0 ? "#014421" : "#9CA3AF",
                        }}
                        tooltipClassName="left-1/2 bottom-full mb-2 w-48 max-w-[min(100vw-2rem,12rem)] -translate-x-1/2 p-1.5 text-center"
                      />
                    </div>
                    <div className={ROUND_STEP_ROW}>
                      <button
                        onClick={() => decrementCounter("gir20ft")}
                        className={`${ROUND_STEP_BTN} border-gray-200 bg-white hover:bg-gray-50`}
                        style={{
                          borderColor: roundData.gir20ft > 0 ? "#014421" : "#D1D5DB",
                          color: roundData.gir20ft > 0 ? "#014421" : "#6B7280",
                        }}
                      >
                        <Minus className="h-5 w-5" />
                      </button>
                      <span className={ROUND_COUNTER_VALUE} style={{ color: roundData.gir20ft > 0 ? "#014421" : "#111827" }}>
                        {roundData.gir20ft}
                      </span>
                      <button
                        onClick={() => incrementCounter("gir20ft")}
                        className={`${ROUND_STEP_BTN} border-gray-200 bg-white hover:bg-gray-50`}
                        style={{
                          borderColor: roundData.gir20ft > 0 ? "#014421" : "#D1D5DB",
                          color: roundData.gir20ft > 0 ? "#014421" : "#6B7280",
                        }}
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  {/* Going for Green */}
                  <div
                    className={`${ROUND_COUNTER_TILE} ${roundData.goingForGreen > 0 ? "border-[#FFA500]" : "border-gray-200"}`}
                    style={{
                      backgroundColor: roundData.goingForGreen > 0 ? "#FFF7ED" : "white",
                    }}
                  >
                    <div className="flex min-h-[2.75rem] flex-col items-center justify-center gap-1 px-0.5 text-center">
                      <span className="text-sm font-semibold leading-tight" style={{ color: roundData.goingForGreen > 0 ? "#014421" : "#6B7280" }}>
                        Going for Green
                      </span>
                      <InfoBubble
                        content="Attempts to reach a Par 4 in 1 stroke or a Par 5 in 2 strokes."
                        buttonClassName="flex h-3 w-3 shrink-0 items-center justify-center rounded-full border bg-white/50 text-[8px] font-bold cursor-help"
                        buttonStyle={{
                          borderColor: roundData.goingForGreen > 0 ? "#014421" : "#E5E7EB",
                          color: roundData.goingForGreen > 0 ? "#014421" : "#9CA3AF",
                        }}
                        tooltipClassName="left-1/2 bottom-full mb-2 w-48 max-w-[min(100vw-2rem,12rem)] -translate-x-1/2 p-1.5 text-center"
                      />
                    </div>
                    <div className={ROUND_STEP_ROW}>
                      <button
                        onClick={() => decrementCounter("goingForGreen")}
                        className={`${ROUND_STEP_BTN} border-gray-200 bg-white hover:bg-gray-50`}
                        style={{
                          borderColor: roundData.goingForGreen > 0 ? "#014421" : "#D1D5DB",
                          color: roundData.goingForGreen > 0 ? "#014421" : "#6B7280",
                        }}
                      >
                        <Minus className="h-5 w-5" />
                      </button>
                      <span className={ROUND_COUNTER_VALUE} style={{ color: roundData.goingForGreen > 0 ? "#014421" : "#111827" }}>
                        {roundData.goingForGreen}
                      </span>
                      <button
                        onClick={() => incrementCounter("goingForGreen")}
                        className={`${ROUND_STEP_BTN} border-gray-200 bg-white hover:bg-gray-50`}
                        style={{
                          borderColor: roundData.goingForGreen > 0 ? "#014421" : "#D1D5DB",
                          color: roundData.goingForGreen > 0 ? "#014421" : "#6B7280",
                        }}
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Advanced Approach Stats (optional) */}
              <div className="border-t border-gray-100 pt-4">
                <h3 className="text-sm font-semibold text-gray-900">Advanced Approach Stats</h3>
                <p className="mt-1 text-xs text-gray-500">
                  Optional: log approach shots per hole (club + direction or GIR) for your full round. Saving works with or without entries.
                </p>
                {!showAdvancedApproachMatrix ? (
                  <button
                    type="button"
                    onClick={() => setShowAdvancedApproachMatrix(true)}
                    className="mt-3 w-full rounded-xl border border-slate-300 bg-white py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50"
                  >
                    Add Directional Misses
                  </button>
                ) : (
                  <div className="mt-4 space-y-4">
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-sm font-medium text-gray-800">Approach Shot</span>
                      <InfoBubble
                        content="Select the hole and club, then tap a miss direction or center for GIR. If GIR was not realistic (bad tee shot / recovery, or still too far / lay-up), use the two buttons below instead of the matrix. Each tap logs that hole and advances to the next hole (last hole stays selected until you pick another)."
                        buttonClassName="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-[9px] font-bold text-slate-500 cursor-help"
                        tooltipClassName="left-1/2 bottom-full mb-2 w-60 max-w-[min(100vw-2rem,15rem)] -translate-x-1/2 p-2 text-center"
                      />
                    </div>

                    <div>
                      <span className="mb-1.5 block text-xs font-medium text-slate-600">
                        Hole ({roundData.holes}-hole round)
                      </span>
                      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
                        {Array.from({ length: roundData.holes }, (_, i) => i + 1).map((h) => {
                          const count = directionalApproachShots.filter((s) => s.hole === h).length;
                          const active = h === selectedApproachHole;
                          return (
                            <button
                              key={h}
                              type="button"
                              onClick={() => setSelectedApproachHole(h)}
                              className={`relative shrink-0 min-w-[2.75rem] rounded-lg border-2 px-2 py-2 text-sm font-semibold tabular-nums transition-colors ${
                                active
                                  ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                              }`}
                            >
                              {h}
                              {count > 0 ? (
                                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-emerald-500 px-0.5 text-[10px] font-bold text-white">
                                  {count > 9 ? "9+" : count}
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="approach-club"
                        className="mb-1 block text-xs font-medium text-slate-600"
                      >
                        Club used
                      </label>
                      <select
                        id="approach-club"
                        value={selectedApproachClub}
                        onChange={(e) => setSelectedApproachClub(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        {APPROACH_CLUB_OPTIONS.map((club) => (
                          <option key={club} value={club}>
                            {club}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div
                      className="mx-auto grid w-full max-w-[220px] grid-cols-3 gap-3"
                      role="group"
                      aria-label="Approach shot direction"
                    >
                      {APPROACH_MATRIX_ROWS.flatMap((row) =>
                        row.map((result) => {
                          const Icon = APPROACH_RESULT_ICONS[result];
                          const isSelected = lastTappedApproachResult === result;
                          return (
                            <button
                              key={result}
                              type="button"
                              onClick={() => appendDirectionalApproachShot(result)}
                              title={
                                result === "gir"
                                  ? "Green in regulation"
                                  : result.replace(/-/g, " ")
                              }
                              className={`flex aspect-square w-full max-w-[4.25rem] shrink-0 items-center justify-center justify-self-center rounded-full border-2 bg-white transition-all active:scale-95 sm:max-w-[4.5rem] ${
                                isSelected
                                  ? "border-emerald-500 text-emerald-600 ring-2 ring-emerald-500/30"
                                  : "border-slate-300 text-slate-600 hover:border-slate-400"
                              }`}
                            >
                              <Icon className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.75} />
                            </button>
                          );
                        }),
                      )}
                    </div>

                    <div className="space-y-2">
                      <p className="text-center text-[11px] font-medium text-slate-600">
                        No GIR opportunity?
                      </p>
                      <p className="text-center text-[10px] leading-snug text-slate-500">
                        Use when a bad tee or recovery means you never had a real look, or when you were
                        still too far / laid up so going for the green was not on the table.
                      </p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => appendDirectionalApproachShot("tee-no-gir")}
                          className={`flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-2.5 text-left text-xs font-semibold transition-all active:scale-[0.99] ${
                            lastTappedApproachResult === "tee-no-gir"
                              ? "border-emerald-500 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-500/25"
                              : "border-slate-300 bg-white text-slate-800 hover:border-slate-400"
                          }`}
                        >
                          <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={2} />
                          <span>Tee / recovery — no GIR line</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => appendDirectionalApproachShot("distance-no-gir")}
                          className={`flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-2.5 text-left text-xs font-semibold transition-all active:scale-[0.99] ${
                            lastTappedApproachResult === "distance-no-gir"
                              ? "border-emerald-500 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-500/25"
                              : "border-slate-300 bg-white text-slate-800 hover:border-slate-400"
                          }`}
                        >
                          <CircleSlash className="h-4 w-4 shrink-0" strokeWidth={2} />
                          <span>Too far / lay-up — no GIR line</span>
                        </button>
                      </div>
                    </div>

                    {directionalApproachShots.length > 0 ? (
                      <p className="text-center text-[11px] text-slate-500">
                        {directionalApproachShots.length} shot
                        {directionalApproachShots.length !== 1 ? "s" : ""} across{" "}
                        {new Set(directionalApproachShots.map((s) => s.hole)).size} hole
                        {new Set(directionalApproachShots.map((s) => s.hole)).size !== 1
                          ? "s"
                          : ""}
                      </p>
                    ) : null}

                    {shotsForSelectedApproachHole.length > 0 ? (
                      <ul className="max-h-40 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/80 p-2">
                        {shotsForSelectedApproachHole.map((shot) => (
                          <li
                            key={shot.id}
                            className="flex items-center justify-between gap-2 rounded-lg bg-white px-2 py-1.5 text-xs text-slate-700 shadow-sm"
                          >
                            <span className="min-w-0 truncate">
                              <span className="font-medium text-slate-900">{shot.club}</span>
                              <span className="text-slate-500"> · </span>
                              <span className="text-slate-600">{formatApproachResultLabel(shot.result)}</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => removeDirectionalApproachShot(shot.id)}
                              className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                              aria-label="Remove entry"
                            >
                              <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 py-3 text-center text-xs text-slate-500">
                        No approach shots for hole {selectedApproachHole} yet.
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={() => setShowAdvancedApproachMatrix(false)}
                      className="w-full text-center text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
                    >
                      Hide matrix
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Short Game Card */}
          <div className="bg-white rounded-2xl p-4 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Short Game</h2>
              <button
                onClick={clearShortGame}
                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                title="Clear all"
              >
                <RotateCcw className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Up & Down Conversions */}
              <div>
                <div className="flex items-center gap-1 mb-3">
                  <label className="block text-sm font-medium text-gray-700">Up & Down Conversions</label>
                  <InfoBubble content="Missing the GIR but still making Par or better (The 'Up & Down' %)." tooltipClassName="left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 max-w-[200px]" />
                </div>
                <div className={ROUND_COUNTER_GRID}>
                  {/* Up & Down Attempts */}
                  <div
                    className={`${ROUND_COUNTER_TILE} ${roundData.missed > 0 ? "border-[#FFA500]" : "border-gray-200"}`}
                    style={{
                      backgroundColor: roundData.missed > 0 ? "#FFF7ED" : "white",
                    }}
                  >
                    <div
                      className="text-center text-sm font-semibold leading-tight"
                      style={{ color: roundData.missed > 0 ? "#014421" : "#6B7280" }}
                    >
                      Attempts
                    </div>
                    <div className={ROUND_STEP_ROW}>
                      <button
                        type="button"
                        onClick={() => decrementCounter("missed")}
                        className={`${ROUND_STEP_BTN} border-gray-200 bg-white hover:bg-gray-50`}
                        style={{
                          borderColor: roundData.missed > 0 ? "#014421" : "#D1D5DB",
                          color: roundData.missed > 0 ? "#014421" : "#6B7280",
                        }}
                      >
                        <Minus className="h-5 w-5" />
                      </button>
                      <span className={ROUND_COUNTER_VALUE} style={{ color: roundData.missed > 0 ? "#014421" : "#111827" }}>
                        {roundData.missed}
                      </span>
                      <button
                        type="button"
                        onClick={() => incrementCounter("missed")}
                        className={`${ROUND_STEP_BTN} border-gray-200 bg-white hover:bg-gray-50`}
                        style={{
                          borderColor: roundData.missed > 0 ? "#014421" : "#D1D5DB",
                          color: roundData.missed > 0 ? "#014421" : "#6B7280",
                        }}
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  {/* Up & Down Made */}
                  <div
                    className={`${ROUND_COUNTER_TILE} ${
                      roundData.upAndDownConversions > 0 ? "border-[#FFA500]" : "border-gray-200"
                    }`}
                    style={{
                      backgroundColor: roundData.upAndDownConversions > 0 ? "#FFF7ED" : "white",
                    }}
                  >
                    <div
                      className="text-center text-sm font-semibold leading-tight"
                      style={{ color: roundData.upAndDownConversions > 0 ? "#014421" : "#6B7280" }}
                    >
                      Made
                    </div>
                    <div className={ROUND_STEP_ROW}>
                      <button
                        type="button"
                        onClick={() => decrementCounter("upAndDownConversions")}
                        className={`${ROUND_STEP_BTN} border-gray-200 bg-white hover:bg-gray-50`}
                        style={{
                          borderColor: roundData.upAndDownConversions > 0 ? "#014421" : "#D1D5DB",
                          color: roundData.upAndDownConversions > 0 ? "#014421" : "#6B7280",
                        }}
                      >
                        <Minus className="h-5 w-5" />
                      </button>
                      <span
                        className={ROUND_COUNTER_VALUE}
                        style={{ color: roundData.upAndDownConversions > 0 ? "#014421" : "#111827" }}
                      >
                        {roundData.upAndDownConversions}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (roundData.upAndDownConversions < roundData.missed) {
                            incrementCounter("upAndDownConversions");
                          }
                        }}
                        className={`${ROUND_STEP_BTN} border-gray-200 bg-white hover:bg-gray-50 ${
                          roundData.upAndDownConversions >= roundData.missed ? "cursor-not-allowed opacity-50" : ""
                        }`}
                        style={{
                          borderColor: roundData.upAndDownConversions > 0 ? "#014421" : "#D1D5DB",
                          color: roundData.upAndDownConversions > 0 ? "#014421" : "#6B7280",
                        }}
                        disabled={roundData.upAndDownConversions >= roundData.missed}
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bunker Saves */}
              <div>
                <div className="flex items-center gap-1 mb-3">
                  <label className="block text-sm font-medium text-gray-700">Bunker Saves</label>
                  <InfoBubble content="Greenside only." tooltipClassName="left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 max-w-[200px]" />
                </div>
                <div className={ROUND_COUNTER_GRID}>
                  {/* Bunker Attempts */}
                  <div
                    className={`${ROUND_COUNTER_TILE} ${
                      roundData.bunkerAttempts > 0 ? "border-[#FFA500]" : "border-gray-200"
                    }`}
                    style={{
                      backgroundColor: roundData.bunkerAttempts > 0 ? "#FFF7ED" : "white",
                    }}
                  >
                    <div
                      className="text-center text-sm font-semibold leading-tight"
                      style={{ color: roundData.bunkerAttempts > 0 ? "#014421" : "#6B7280" }}
                    >
                      Attempts
                    </div>
                    <div className={ROUND_STEP_ROW}>
                      <button
                        type="button"
                        onClick={() => decrementCounter("bunkerAttempts")}
                        className={`${ROUND_STEP_BTN} border-gray-200 bg-white hover:bg-gray-50`}
                        style={{
                          borderColor: roundData.bunkerAttempts > 0 ? "#014421" : "#D1D5DB",
                          color: roundData.bunkerAttempts > 0 ? "#014421" : "#6B7280",
                        }}
                      >
                        <Minus className="h-5 w-5" />
                      </button>
                      <span
                        className={ROUND_COUNTER_VALUE}
                        style={{ color: roundData.bunkerAttempts > 0 ? "#014421" : "#111827" }}
                      >
                        {roundData.bunkerAttempts}
                      </span>
                      <button
                        type="button"
                        onClick={() => incrementCounter("bunkerAttempts")}
                        className={`${ROUND_STEP_BTN} border-gray-200 bg-white hover:bg-gray-50`}
                        style={{
                          borderColor: roundData.bunkerAttempts > 0 ? "#014421" : "#D1D5DB",
                          color: roundData.bunkerAttempts > 0 ? "#014421" : "#6B7280",
                        }}
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  {/* Bunker Saves */}
                  <div
                    className={`${ROUND_COUNTER_TILE} ${roundData.bunkerSaves > 0 ? "border-[#FFA500]" : "border-gray-200"}`}
                    style={{
                      backgroundColor: roundData.bunkerSaves > 0 ? "#FFF7ED" : "white",
                    }}
                  >
                    <div
                      className="text-center text-sm font-semibold leading-tight"
                      style={{ color: roundData.bunkerSaves > 0 ? "#014421" : "#6B7280" }}
                    >
                      Made
                    </div>
                    <div className={ROUND_STEP_ROW}>
                      <button
                        type="button"
                        onClick={() => decrementCounter("bunkerSaves")}
                        className={`${ROUND_STEP_BTN} border-gray-200 bg-white hover:bg-gray-50`}
                        style={{
                          borderColor: roundData.bunkerSaves > 0 ? "#014421" : "#D1D5DB",
                          color: roundData.bunkerSaves > 0 ? "#014421" : "#6B7280",
                        }}
                      >
                        <Minus className="h-5 w-5" />
                      </button>
                      <span className={ROUND_COUNTER_VALUE} style={{ color: roundData.bunkerSaves > 0 ? "#014421" : "#111827" }}>
                        {roundData.bunkerSaves}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (roundData.bunkerSaves < roundData.bunkerAttempts) {
                            incrementCounter("bunkerSaves");
                          }
                        }}
                        className={`${ROUND_STEP_BTN} border-gray-200 bg-white hover:bg-gray-50 ${
                          roundData.bunkerSaves >= roundData.bunkerAttempts ? "cursor-not-allowed opacity-50" : ""
                        }`}
                        style={{
                          borderColor: roundData.bunkerSaves > 0 ? "#014421" : "#D1D5DB",
                          color: roundData.bunkerSaves > 0 ? "#014421" : "#6B7280",
                        }}
                        disabled={roundData.bunkerSaves >= roundData.bunkerAttempts}
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Chip Inside 6ft and Double Chips */}
              <div>
                <div className={ROUND_COUNTER_GRID}>
                  {/* Chip Inside 6ft */}
                  <div
                    className={`${ROUND_COUNTER_TILE} ${
                      roundData.chipInside6ft > 0 ? "border-[#FFA500]" : "border-gray-200"
                    }`}
                    style={{
                      backgroundColor: roundData.chipInside6ft > 0 ? "#FFF7ED" : "white",
                    }}
                  >
                    <div className="flex min-h-[2.75rem] flex-col items-center justify-center gap-1 text-center">
                      <span className="text-sm font-semibold leading-tight" style={{ color: roundData.chipInside6ft > 0 ? "#014421" : "#6B7280" }}>
                        Chip inside 6ft
                      </span>
                      <InfoBubble
                        content="Approx. 1.8 metres"
                        buttonClassName="flex h-3 w-3 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-100 text-[9px] font-bold text-gray-500 cursor-help"
                        tooltipClassName="left-1/2 bottom-full mb-2 w-32 -translate-x-1/2 text-center"
                      />
                    </div>
                    <div className={ROUND_STEP_ROW}>
                      <button
                        type="button"
                        onClick={() => decrementCounter("chipInside6ft")}
                        className={`${ROUND_STEP_BTN} border-gray-200 bg-white hover:bg-gray-50`}
                        style={{
                          borderColor: roundData.chipInside6ft > 0 ? "#014421" : "#D1D5DB",
                          color: roundData.chipInside6ft > 0 ? "#014421" : "#6B7280",
                        }}
                      >
                        <Minus className="h-5 w-5" />
                      </button>
                      <span
                        className={ROUND_COUNTER_VALUE}
                        style={{ color: roundData.chipInside6ft > 0 ? "#014421" : "#111827" }}
                      >
                        {roundData.chipInside6ft}
                      </span>
                      <button
                        type="button"
                        onClick={() => incrementCounter("chipInside6ft")}
                        className={`${ROUND_STEP_BTN} border-gray-200 bg-white hover:bg-gray-50`}
                        style={{
                          borderColor: roundData.chipInside6ft > 0 ? "#014421" : "#D1D5DB",
                          color: roundData.chipInside6ft > 0 ? "#014421" : "#6B7280",
                        }}
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  {/* Double Chips */}
                  <div
                    className={`${ROUND_COUNTER_TILE} ${
                      roundData.doubleChips > 0 ? "border-[#FFA500]" : "border-gray-200"
                    }`}
                    style={{
                      backgroundColor: roundData.doubleChips > 0 ? "#FFF7ED" : "white",
                    }}
                  >
                    <div className="flex min-h-[2.75rem] flex-col items-center justify-center gap-1 px-0.5 text-center">
                      <span className="text-sm font-semibold leading-tight" style={{ color: roundData.doubleChips > 0 ? "#014421" : "#6B7280" }}>
                        Double chips
                      </span>
                      <InfoBubble
                        content="Any instance where an initial chip or pitch failed to reach the putting surface, requiring a second chip."
                        buttonClassName="flex h-3 w-3 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-100 text-[9px] font-bold text-gray-500 cursor-help"
                        tooltipClassName="left-1/2 bottom-full mb-2 w-48 max-w-[min(100vw-2rem,12rem)] -translate-x-1/2 p-1.5 text-center"
                      />
                    </div>
                    <div className={ROUND_STEP_ROW}>
                      <button
                        type="button"
                        onClick={() => decrementCounter("doubleChips")}
                        className={`${ROUND_STEP_BTN} border-gray-200 bg-white hover:bg-gray-50`}
                        style={{
                          borderColor: roundData.doubleChips > 0 ? "#014421" : "#D1D5DB",
                          color: roundData.doubleChips > 0 ? "#014421" : "#6B7280",
                        }}
                      >
                        <Minus className="h-5 w-5" />
                      </button>
                      <span
                        className={ROUND_COUNTER_VALUE}
                        style={{ color: roundData.doubleChips > 0 ? "#014421" : "#111827" }}
                      >
                        {roundData.doubleChips}
                      </span>
                      <button
                        type="button"
                        onClick={() => incrementCounter("doubleChips")}
                        className={`${ROUND_STEP_BTN} border-gray-200 bg-white hover:bg-gray-50`}
                        style={{
                          borderColor: roundData.doubleChips > 0 ? "#014421" : "#D1D5DB",
                          color: roundData.doubleChips > 0 ? "#014421" : "#6B7280",
                        }}
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Putting Card */}
          <div className="bg-white rounded-2xl p-4 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Putting</h2>
              <button
                type="button"
                onClick={clearPutting}
                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                title="Clear all"
              >
                <RotateCcw className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className={ROUND_COUNTER_GRID}>
              {/* Total putts */}
              <div
                className={`${ROUND_COUNTER_TILE} ${
                  roundData.totalPutts > 0 ? "border-[#FFA500]" : "border-gray-200"
                }`}
                style={{
                  backgroundColor: roundData.totalPutts > 0 ? "#FFF7ED" : "white",
                }}
              >
                <div className="flex min-h-[2.75rem] flex-col items-center justify-center gap-1 text-center">
                  <span
                    className="text-sm font-semibold leading-tight"
                    style={{ color: roundData.totalPutts > 0 ? "#014421" : "#6B7280" }}
                  >
                    Total putts
                  </span>
                  <InfoBubble
                    content="Only strokes taken once the ball is on the putting surface."
                    buttonClassName="flex h-3 w-3 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-100 text-[9px] font-bold text-gray-500 cursor-help"
                    tooltipClassName="left-1/2 bottom-full mb-2 w-40 max-w-[min(100vw-2rem,12rem)] -translate-x-1/2 p-1.5 text-center"
                  />
                </div>
                <div className={ROUND_STEP_ROW}>
                  <input
                    type="text"
                    inputMode="decimal"
                    aria-label="Total putts"
                    value={totalPuttsText}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setTotalPuttsText(raw);
                      const t = raw.trim();
                      if (t === "") {
                        updateField("totalPutts", 0);
                        return;
                      }
                      const n = Number(t);
                      updateField("totalPutts", Number.isFinite(n) ? Math.max(0, n) : 0);
                    }}
                    placeholder="0"
                    className="min-w-0 max-w-[5.5rem] rounded-lg border-2 border-gray-200 bg-white px-1 py-1.5 text-center text-[1.4rem] font-bold tabular-nums text-gray-900 sm:text-2xl"
                    style={{
                      borderColor: roundData.totalPutts > 0 ? "#014421" : "#D1D5DB",
                      color: roundData.totalPutts > 0 ? "#014421" : "#6B7280",
                    }}
                  />
                </div>
              </div>

              {/* 3-Putts */}
              <div
                className={`${ROUND_COUNTER_TILE} ${
                  roundData.threePutts > 0 ? "border-[#FFA500]" : "border-gray-200"
                }`}
                style={{
                  backgroundColor: roundData.threePutts > 0 ? "#FFF7ED" : "white",
                }}
              >
                <div className="flex min-h-[2.75rem] flex-col items-center justify-center gap-1 text-center">
                  <span
                    className="text-sm font-semibold leading-tight"
                    style={{ color: roundData.threePutts > 0 ? "#014421" : "#6B7280" }}
                  >
                    3-Putts
                  </span>
                  <InfoBubble
                    content="Any hole where 3 or more strokes were taken once the ball reached the putting surface."
                    buttonClassName="flex h-3 w-3 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-100 text-[9px] font-bold text-gray-500 cursor-help"
                    tooltipClassName="left-1/2 bottom-full mb-2 w-48 max-w-[min(100vw-2rem,12rem)] -translate-x-1/2 p-1.5 text-center"
                  />
                </div>
                <div className={ROUND_STEP_ROW}>
                  <button
                    type="button"
                    onClick={() => decrementCounter("threePutts")}
                    className={`${ROUND_STEP_BTN} border-gray-200 bg-white hover:bg-gray-50`}
                    style={{
                      borderColor: roundData.threePutts > 0 ? "#014421" : "#D1D5DB",
                      color: roundData.threePutts > 0 ? "#014421" : "#6B7280",
                    }}
                  >
                    <Minus className="h-5 w-5" />
                  </button>
                  <span
                    className={ROUND_COUNTER_VALUE}
                    style={{ color: roundData.threePutts > 0 ? "#014421" : "#111827" }}
                  >
                    {roundData.threePutts}
                  </span>
                  <button
                    type="button"
                    onClick={() => incrementCounter("threePutts")}
                    className={`${ROUND_STEP_BTN} border-gray-200 bg-white hover:bg-gray-50`}
                    style={{
                      borderColor: roundData.threePutts > 0 ? "#014421" : "#D1D5DB",
                      color: roundData.threePutts > 0 ? "#014421" : "#6B7280",
                    }}
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* &lt; 6ft attempts */}
              <div
                className={`${ROUND_COUNTER_TILE} ${
                  roundData.puttsUnder6ftAttempts > 0 ? "border-[#FFA500]" : "border-gray-200"
                }`}
                style={{
                  backgroundColor: roundData.puttsUnder6ftAttempts > 0 ? "#FFF7ED" : "white",
                }}
              >
                <div
                  className="flex min-h-[2.75rem] flex-col items-center justify-center text-center text-sm font-semibold leading-tight"
                  style={{ color: roundData.puttsUnder6ftAttempts > 0 ? "#014421" : "#6B7280" }}
                >
                  &lt; 6ft Att
                </div>
                <div className={ROUND_STEP_ROW}>
                  <button
                    type="button"
                    onClick={() => decrementCounter("puttsUnder6ftAttempts")}
                    className={`${ROUND_STEP_BTN} border-gray-200 bg-white hover:bg-gray-50`}
                    style={{
                      borderColor: roundData.puttsUnder6ftAttempts > 0 ? "#014421" : "#D1D5DB",
                      color: roundData.puttsUnder6ftAttempts > 0 ? "#014421" : "#6B7280",
                    }}
                  >
                    <Minus className="h-5 w-5" />
                  </button>
                  <span
                    className={ROUND_COUNTER_VALUE}
                    style={{ color: roundData.puttsUnder6ftAttempts > 0 ? "#014421" : "#111827" }}
                  >
                    {roundData.puttsUnder6ftAttempts}
                  </span>
                  <button
                    type="button"
                    onClick={() => incrementCounter("puttsUnder6ftAttempts")}
                    className={`${ROUND_STEP_BTN} border-gray-200 bg-white hover:bg-gray-50`}
                    style={{
                      borderColor: roundData.puttsUnder6ftAttempts > 0 ? "#014421" : "#D1D5DB",
                      color: roundData.puttsUnder6ftAttempts > 0 ? "#014421" : "#6B7280",
                    }}
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* &lt; 6ft made */}
              <div
                className={`${ROUND_COUNTER_TILE} ${
                  roundData.made6ftAndIn > 0 ? "border-[#FFA500]" : "border-gray-200"
                }`}
                style={{
                  backgroundColor: roundData.made6ftAndIn > 0 ? "#FFF7ED" : "white",
                }}
              >
                <div
                  className="flex min-h-[2.75rem] flex-col items-center justify-center text-center text-sm font-semibold leading-tight"
                  style={{ color: roundData.made6ftAndIn > 0 ? "#014421" : "#6B7280" }}
                >
                  &lt; 6ft Made
                </div>
                <div className={ROUND_STEP_ROW}>
                  <button
                    type="button"
                    onClick={() => decrementCounter("made6ftAndIn")}
                    className={`${ROUND_STEP_BTN} border-gray-200 bg-white hover:bg-gray-50`}
                    style={{
                      borderColor: roundData.made6ftAndIn > 0 ? "#014421" : "#D1D5DB",
                      color: roundData.made6ftAndIn > 0 ? "#014421" : "#6B7280",
                    }}
                  >
                    <Minus className="h-5 w-5" />
                  </button>
                  <span
                    className={ROUND_COUNTER_VALUE}
                    style={{ color: roundData.made6ftAndIn > 0 ? "#014421" : "#111827" }}
                  >
                    {roundData.made6ftAndIn}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (roundData.made6ftAndIn < roundData.puttsUnder6ftAttempts) {
                        incrementCounter("made6ftAndIn");
                      }
                    }}
                    className={`${ROUND_STEP_BTN} border-gray-200 bg-white hover:bg-gray-50 ${
                      roundData.made6ftAndIn >= roundData.puttsUnder6ftAttempts
                        ? "cursor-not-allowed opacity-50"
                        : ""
                    }`}
                    style={{
                      borderColor: roundData.made6ftAndIn > 0 ? "#014421" : "#D1D5DB",
                      color: roundData.made6ftAndIn > 0 ? "#014421" : "#6B7280",
                    }}
                    disabled={roundData.made6ftAndIn >= roundData.puttsUnder6ftAttempts}
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <button
            onClick={saveRound}
            disabled={!isRequiredFilled || isSaving}
            className="w-full py-4 rounded-xl text-lg font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg mb-6"
            style={{ backgroundColor: '#FFA500' }}
          >
            {isSaving ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Save Round
              </>
            )}
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}
