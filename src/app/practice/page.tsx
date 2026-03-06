"use client";

import { useState, useEffect, useMemo } from "react";
import { useStats } from "@/contexts/StatsContext";
import { useAuth } from "@/contexts/AuthContext";
import { Sparkles, Calendar, Clock, Home, Target, Flag, FlagTriangleRight, Check, CheckCircle2, PlayCircle, FileText, BookOpen, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, ExternalLink, Download, X, RefreshCw, Pencil, File } from "lucide-react";
import { OFFICIAL_DRILLS, type DrillRecord } from "@/data/official_drills";
import DrillCard, { type FacilityType } from "@/components/DrillCard";
import { AIPlayerInsights } from "@/components/AIPlayerInsights";
import { DrillLibrary } from "@/components/DrillLibrary";
import { getBenchmarkGoals } from "@/app/stats/page";

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
    pdf_url?: string; // PDF resource URL
    youtube_url?: string; // YouTube video URL
    levels?: Array<{ id: string; name: string; completed?: boolean }>; // Drill levels/checklist
    goal?: string; // Goal/Reps for this drill
  }>;
  date?: string; // Date this plan was generated
}

interface WeeklyPlan {
  [key: number]: DayPlan;
}

interface Drill {
  id: string;
  title: string;
  category: string;
  sub_category?: string;
  focus?: string;
  estimatedMinutes: number;
  xpValue: number;
  contentType?: 'video' | 'pdf' | 'text'; // Content type for display
  source?: string; // Source URL or content
  description?: string; // Description for text-based drills
  video_url?: string; // Video URL from database
  pdf_url?: string; // PDF URL from database
  youtube_url?: string; // YouTube URL (mapped from video_url)
  drill_levels?: any; // Drill levels from database
  levels?: Array<{ id: string; name: string; completed?: boolean }>; // Parsed drill levels
  goal?: string; // Goal/Reps from database
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_ABBREVIATIONS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

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

import { logActivity } from "@/lib/activity";

// XP Logic: Create a function updateUserXP(points) that adds a specific amount of XP to the user's profiles record in Supabase
async function updateUserXP(userId: string, points: number): Promise<void> {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    // Get current XP from profile
    const { data: currentProfile, error: fetchError } = await supabase
      .from('profiles')
      .select('total_xp')
      .eq('id', userId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Error fetching current XP:', fetchError);
    }

    const currentXP = currentProfile?.total_xp || 0;
    const newXP = currentXP + points;

    // Calculate level based on XP
    let newLevel = 1;
    if (newXP < 500) newLevel = 1;
    else if (newXP < 1500) newLevel = 2;
    else if (newXP < 3000) newLevel = 3;
    else newLevel = 4 + Math.floor((newXP - 3000) / 2000);

    // Update XP and level in profiles table
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ total_xp: newXP, current_level: newLevel })
      .eq('id', userId);

    if (updateError) {
      console.error('Error updating XP:', updateError);
    } else {
      console.log(`XP updated: ${currentXP} + ${points} = ${newXP} (Level ${newLevel})`);
      // Global Refresh: Dispatch event to refresh XP leaderboard
      window.dispatchEvent(new Event('xpUpdated'));
    }
  } catch (error) {
    console.error('Error in updateUserXP:', error);
  }
}

export default function PracticePage() {
  const { rounds, refreshPracticeSessions, refreshDrills } = useStats();
  const { user, refreshUser } = useAuth();
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlan>({});
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [drills, setDrills] = useState<Drill[]>([]);
  const [mostNeededCategory, setMostNeededCategory] = useState<string>('Putting');
  const [generatedPlan, setGeneratedPlan] = useState<WeeklyPlan | null>(null);
  const [xpNotification, setXpNotification] = useState<{ show: boolean; amount: number }>({ show: false, amount: 0 });
  const [expandedDrill, setExpandedDrill] = useState<string | null>(null); // Track which drill is expanded
  const [durationModal, setDurationModal] = useState<{ open: boolean; facility: FacilityType | null }>({ open: false, facility: null });
  const [totalPracticeMinutes, setTotalPracticeMinutes] = useState<number>(0);
  const [scheduleExpanded, setScheduleExpanded] = useState<boolean>(true); // Weekly schedule expanded state
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
  const [youtubeModal, setYoutubeModal] = useState<{ open: boolean; url: string }>({ open: false, url: '' }); // YouTube modal state
  
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
  
  // Base XP per facility type (for freestyle practice)
  const facilityBaseXP: Record<FacilityType, number> = {
    'Driving': 10,
    'Irons': 10,
    'Wedges': 10,
    'Chipping': 10,
    'Bunkers': 10,
    'Putting': 5,
    'Mental/Strategy': 5,
    'On-Course': 50,
  };

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
        const { data: userDrillsData } = await supabase
          .from('user_drills')
          .select('*')
          .eq('user_id', user.id)
          .gte('selected_date', monday.toISOString().split('T')[0])
          .lte('selected_date', sunday.toISOString().split('T')[0]);

        // FIX LINE 338: Handle error gracefully without crashing
        if (error) {
          console.warn('Practice schedule fetch warning:', error.message || 'Unknown error');
          // Continue with empty schedule instead of crashing
        }

        // Initialize plan structure from localStorage
        const loadedPlan: WeeklyPlan = {};
        let hasLocalPlan = false;
        if (typeof window !== 'undefined') {
          const savedPlans = localStorage.getItem('weeklyPracticePlans');
          if (savedPlans) {
            try {
              const parsedPlans = JSON.parse(savedPlans);
              if (Object.keys(parsedPlans).length > 0) {
                Object.assign(loadedPlan, parsedPlans);
                hasLocalPlan = true;
              }
            } catch (e) {
              console.error('Error parsing localStorage plans:', e);
            }
          }
        }
        
        // Do NOT pre-populate all days - only load what's in the database or stay empty

        // CROSS-REFERENCE: Fetch drill details from drills table and match by title
        if ((practiceData && practiceData.length > 0) || (userDrillsData && userDrillsData.length > 0)) {
          // Fetch all drills from drills table
          const { data: allDrillsData, error: drillsError } = await supabase
            .from('drills')
            .select('id, video_url, pdf_url, drill_levels, title, category, estimatedMinutes, description');
          
          // Create a map of drills by title for matching (CROSS-REFERENCE: match by title)
          const drillDetailsMap: Record<string, any> = {};
          
          // Add library drills first
          if (typeof OFFICIAL_DRILLS !== 'undefined') {
            OFFICIAL_DRILLS.forEach((drill: any) => {
              if (drill.id) drillDetailsMap[drill.id] = drill;
              if (drill.title) drillDetailsMap[drill.title.toLowerCase().trim()] = drill;
            });
          }

          // Merge database drills
          if (allDrillsData && !drillsError) {
            allDrillsData.forEach((drill: any) => {
              // Index by id
              if (drill.id) {
                drillDetailsMap[drill.id] = drillDetailsMap[drill.id] 
                  ? { ...drillDetailsMap[drill.id], ...drill } 
                  : drill;
              }
              // Index by title (lowercase for case-insensitive matching)
              if (drill.title) {
                const normalizedTitle = drill.title.toLowerCase().trim();
                drillDetailsMap[normalizedTitle] = drillDetailsMap[normalizedTitle]
                  ? { ...drillDetailsMap[normalizedTitle], ...drill }
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
                  date: new Date().toISOString().split('T')[0],
                };
              }
              const dayPlan = loadedPlan[dayIndex];
              
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
                  dayPlan.drills.push({
                    id: plannedDrill.drill_id,
                    title: drillDetails.title,
                    category: drillDetails.category,
                    estimatedMinutes: drillDetails.estimatedMinutes || 30,
                    completed: false,
                    pdf_url: drillDetails.pdf_url,
                    youtube_url: drillDetails.video_url,
                    description: drillDetails.description || undefined,
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
                date: new Date().toISOString().split('T')[0],
              };
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
            const drillTitle = drillDetails?.title || practice.drill_name || practice.type || practice.title || 'Practice Session';
            const isCompleted = practice.completed || false;
            
            // Check if this drill is already in our local plan (optional chaining prevents e[a].selected-style crash)
            const dayPlanRef = loadedPlan?.[dayIndex];
            const existingDrillIndex = (dayPlanRef?.drills ?? []).findIndex(d => 
              d?.id === generatedDrillId || d?.title === drillTitle
            );

            if (existingDrillIndex >= 0 && dayPlanRef?.drills) {
              dayPlanRef.drills[existingDrillIndex].completed = isCompleted;
              if (levels) dayPlanRef.drills[existingDrillIndex].levels = levels;
              if (drillDetails?.pdf_url || practice.pdf_url) dayPlanRef.drills[existingDrillIndex].pdf_url = drillDetails?.pdf_url || practice.pdf_url;
              if (drillDetails?.video_url || practice.youtube_url || practice.video_url) dayPlanRef.drills[existingDrillIndex].youtube_url = drillDetails?.video_url || practice.youtube_url || practice.video_url;
              if (drillDetails?.description != null) dayPlanRef.drills[existingDrillIndex].description = drillDetails.description;
            } else if (dayPlanRef?.drills) {
              dayPlanRef.drills.push({
                id: generatedDrillId,
                title: drillTitle,
                category: drillDetails?.category || practice.category || 'Practice',
                estimatedMinutes: drillDetails?.estimatedMinutes || practice.estimatedMinutes || 30,
                completed: isCompleted,
                pdf_url: drillDetails?.pdf_url || practice.pdf_url || undefined,
                youtube_url: drillDetails?.video_url || practice.youtube_url || practice.video_url || undefined,
                description: drillDetails?.description || practice.description || undefined,
                levels: levels || undefined,
              });
            }
          });
        }
        }

        setWeeklyPlan(loadedPlan);
      } catch (error) {
        console.error('Error loading weekly schedule:', error);
        // Fallback to localStorage
        const savedPlans = localStorage.getItem('weeklyPracticePlans');
        if (savedPlans) {
          try {
            const parsedPlans = JSON.parse(savedPlans);
            setWeeklyPlan(parsedPlans);
          } catch (e) {
            console.error('Error loading saved plans:', e);
          }
        }
      }
    };

    loadWeeklySchedule();
  }, [user?.id]);

  // Fetch drills directly from local data
  useEffect(() => {
    const loadDrills = () => {
      if (typeof window !== 'undefined') {
        try {
          // Map local static drills directly to state, bypassing Supabase RLS completely
          const fetchedDrills: Drill[] = OFFICIAL_DRILLS.map(d => {
            return {
              id: d.id,
              title: d.title,
              category: d.category,
              sub_category: '', // Not strictly needed
              focus: d.focus,
              estimatedMinutes: d.estimatedMinutes,
              xpValue: d.xpValue,
              contentType: d.contentType,
              source: d.video_url || d.youtube_url || d.pdf_url || d.description || '',
              description: d.description,
              pdf_url: d.pdf_url,
              youtube_url: d.youtube_url || d.video_url,
              goal: d.goal,
            };
          });
          
          setDrills(fetchedDrills);
          localStorage.setItem('drillsData', JSON.stringify(fetchedDrills));
        } catch (err) {
          console.error('Error loading drills:', err);
        }
      }
    };

    loadDrills();
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

    const drillToAdd = {
      id: drill.id,
      title: drill.title,
      category: drill.category,
      estimatedMinutes: drill.estimatedMinutes,
      completed: false,
      xpEarned: 0,
      isRound: drill.category === "9-Hole Round" || drill.category === "18-Hole Round",
      contentType: drill.contentType,
      description: drill.description,
      pdf_url: drill.pdf_url,
      youtube_url: drill.youtube_url || drill.video_url,
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

    // Get today's date for daily XP cap tracking
    const today = new Date().toISOString().split('T')[0];
    const dailyXPKey = `freestyleXP_${today}`;
    const currentDailyXP = parseInt(localStorage.getItem(dailyXPKey) || '0');

    // Calculate XP: base XP * number of 15-minute blocks
    const blocks = Math.floor(duration / 15);
    const baseXP = facilityBaseXP[facility];
    const calculatedXP = baseXP * blocks;

    // Apply daily cap (30 XP max per day for freestyle)
    const remainingDailyXP = Math.max(0, 30 - currentDailyXP);
    const xpEarned = Math.min(calculatedXP, remainingDailyXP);

    if (xpEarned <= 0) {
      alert('Daily freestyle practice XP limit reached (30 XP/day). Complete your Roadmap drills for more XP!');
      setDurationModal({ open: false, facility: null });
      return;
    }

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

      // Trigger on Practice: In the savePractice function, add 10 XP for every 10 minutes of practice logged
      // Calculate XP: 10 XP per 10 minutes (e.g., 30 minutes = 30 XP)
      const practiceXP = Math.floor(duration / 10) * 10;
      if (practiceXP > 0) {
        await updateUserXP(user.id, practiceXP);
        console.log(`Practice: Added ${practiceXP} XP for ${duration} minutes of practice`);
      }

      // Update daily XP cap
      localStorage.setItem(dailyXPKey, (currentDailyXP + xpEarned).toString());

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

    // Get relevant drill categories
    const relevantCategories = categoryMapping[mostNeededCategory] || ['Putting'];
    
    // Filter drills by category
    let relevantDrills = drills.filter(drill => 
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
      const allSelectedDrills: Array<Drill & { isSet?: boolean; setCount?: number; facility?: FacilityType; isRound?: boolean }> = [];

      // If round is selected, add On-Course Challenge FIRST (regardless of availableTime)
      if (roundType) {
        const roundTime = roundType === '9-hole' ? 120 : 240;
        
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
        const mentalGameDrills = drills.filter(drill => 
          (drill.category && drill.category.toLowerCase().includes('mental game')) ||
          (drill.category && drill.category.toLowerCase().includes('mental'))
        );
        
        if (mentalGameDrills.length > 0 && availableTime > roundTime) {
          const remainingTime = availableTime - roundTime;
          const mentalGameTime = Math.min(remainingTime, 30); // Add up to 30 min of mental game
          if (mentalGameTime >= 15) {
            const selectedMentalDrill = mentalGameDrills[Math.floor(Math.random() * mentalGameDrills.length)];
            if (selectedMentalDrill) {
              allSelectedDrills.push({
                ...selectedMentalDrill,
                id: `mental-${day.dayIndex}-${selectedMentalDrill.id}-${Date.now()}`,
                xpValue: pillarXPTiering['Mental Game'] || selectedMentalDrill.xpValue,
                estimatedMinutes: Math.min(mentalGameTime, selectedMentalDrill.estimatedMinutes),
              });
            }
          }
        }
      }

      // If facilities are selected, divide time equally among them (only if time > 0)
      if (selectedFacilities.length > 0 && availableTime > 0) {
        // Subtract round time if a round is selected
        const remainingTime = roundType ? availableTime - (roundType === '9-hole' ? 120 : 240) : availableTime;
        const timePerFacility = remainingTime > 0 ? Math.floor(remainingTime / selectedFacilities.length) : 0;
        
        selectedFacilities.forEach((facility: FacilityType) => {
          const compatibleCategories = facilityDrillMapping[facility] || [];
          
          // Smart Allocation: If Range (Grass) is selected, prioritize Skills and Wedge Play
          let facilityDrills;
          facilityDrills = drills.filter(drill => 
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
            facilityDrills = drills.filter(drill => {
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
          let facilityTime = timePerFacility;
          const facilitySelectedDrills: Drill[] = [];

          for (const drill of shuffled) {
            if (drill.estimatedMinutes <= facilityTime && facilitySelectedDrills.length < 3) {
              facilitySelectedDrills.push(drill);
              facilityTime -= drill.estimatedMinutes;
            }
            if (facilitySelectedDrills.length >= 2 && facilityTime < 15) {
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
        // No facilities selected and no round - use general drills (only if time > 0)
        const shuffled = [...relevantDrills].sort(() => Math.random() - 0.5);
        let remainingTime = availableTime;
        
        for (const drill of shuffled) {
          if (drill.estimatedMinutes <= remainingTime && allSelectedDrills.length < 5) {
            allSelectedDrills.push(drill);
            remainingTime -= drill.estimatedMinutes;
          }
          if (allSelectedDrills.length >= 3 && remainingTime < 15) {
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
          })),
        };
      }
    });

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
    // On-course challenges (rounds) always give 500 XP
    if (drill.isRound || drill.category === 'On-Course Challenge') {
      return 500;
    }
    
    // Regular drills: 10 XP per minute
    return drill.estimatedMinutes * 10;
  };

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

    // Calculate XP (always award XP when marking complete, regardless of previous state)
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
    if (!isCurrentlyCompleted) {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();

        // Check if already completed today to prevent duplicates
        const startOfDay = new Date(day.date + 'T00:00:00').toISOString();
        const endOfDay = new Date(day.date + 'T23:59:59').toISOString();
        
        const { data: existing } = await supabase
          .from('practice')
          .select('id')
          .eq('user_id', user.id)
          .eq('type', drill.title)
          .gte('completed_at', startOfDay)
          .lte('completed_at', endOfDay)
          .limit(1)
          .maybeSingle();

        if (existing) {
          console.log('Practice: Drill already completed today, skipping duplicate insert and XP.');
        } else {
          // Safe insert: Only use columns known to exist in 'practice' table based on logFreestylePractice
          const stableDrillId = (drill as any).drill_id || drill.id;
          const { data: practiceData, error: practiceError } = await supabase
            .from('practice')
            .insert({
              user_id: user.id,
              type: stableDrillId, // Use drill_id for matching; avoids spelling changes breaking old logs
              duration_minutes: drill.estimatedMinutes,
              notes: `Completed Drill: ${drill.category}`,
            })
            .select();

          if (practiceError) {
            console.error('Practice: Error saving to practice table:', practiceError);
          } else {
            console.log('Practice: Drill saved to practice table:', practiceData);
            
            // Trigger on Drill: Add XP to the user ONLY ONCE per drill per day
            await updateUserXP(user.id, xpEarned);
            console.log(`Practice: Added ${xpEarned} XP for drill completion`);
            
            // Trigger Global Sync
            await refreshDrills();
            window.dispatchEvent(new Event('drillsUpdated'));
            
            // Log activity to database
            await logActivity(user.id, 'drill', `Completed ${drill.title} (+${xpEarned} XP)`);
          }
        }
      } catch (error) {
        console.error('Practice: Error in markDrillComplete database save:', error);
      }
    }

    // Update activity history (but DO NOT locally add XP to prevent ghosting)
    if (typeof window !== 'undefined' && !isCurrentlyCompleted) {
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

  // Replace a drill in the plan
  const replaceDrill = async (dayIndex: number, drillIndex: number, newDrill: Drill) => {
    const day = weeklyPlan[dayIndex];
    if (!day || !day.drills[drillIndex]) return;

    const currentDrill = day.drills[drillIndex];
    
    // DATA SYNC: Fetch fresh drill data from database to get video_url and drill_levels
    let drillData = { ...newDrill };
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      
      const { data: dbDrill } = await supabase
        .from('drills')
        .select('video_url, pdf_url, drill_levels, title, category, estimatedMinutes, description')
        .eq('id', newDrill.id)
        .single();

      if (dbDrill) {
        let levels = null;
        if (dbDrill.drill_levels) {
          try {
            levels = typeof dbDrill.drill_levels === 'string' 
              ? JSON.parse(dbDrill.drill_levels)
              : dbDrill.drill_levels;
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

        drillData = {
          ...newDrill,
          pdf_url: dbDrill.pdf_url || newDrill.pdf_url,
          youtube_url: dbDrill.video_url || newDrill.youtube_url || newDrill.video_url,
          description: dbDrill.description ?? newDrill.description,
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
                      {summary.totalTime} mins total. Focus: {summary.categories}
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
                            onLevelToggle={updateLevelCompletion}
                            onYoutubeOpen={(url) => setYoutubeModal({ open: true, url })}
                            onExpandToggle={(dayIdx, drillIdx) => {
                              if (isExpanded) {
                                setExpandedScheduleDrill(null);
                              } else {
                                setExpandedScheduleDrill({ dayIndex: dayIdx, drillIndex: drillIdx });
                              }
                            }}
                            defaultExpanded={false} // Default to collapsed
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
        <AIPlayerInsights performanceMetrics={performanceMetrics} goals={goals} roundCount={myRounds.length} />

        {/* Log Freestyle Practice Section */}
        <div className="mb-6">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-4">Log Freestyle Practice</h3>
            <p className="text-xs text-gray-600 mb-4">Tap a category to log freestyle practice</p>
            <div className="grid grid-cols-3 gap-3">
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
                onClick={() => logFreestylePractice('On-Course', 135)}
                className="flex flex-col items-center gap-2 p-3 rounded-xl transition-all border-2 bg-gray-50 border-gray-200 hover:border-[#FFA500] hover:bg-gray-100"
              >
                <FlagTriangleRight className="w-5 h-5 text-gray-600" />
                <span className="text-xs font-medium text-center text-gray-700">9-Hole Round</span>
              </button>
              <button
                type="button"
                onClick={() => logFreestylePractice('On-Course', 270)}
                className="flex flex-col items-center gap-2 p-3 rounded-xl transition-all border-2 bg-gray-50 border-gray-200 hover:border-[#FFA500] hover:bg-gray-100"
              >
                <FlagTriangleRight className="w-5 h-5 text-gray-600" />
                <span className="text-xs font-medium text-center text-gray-700">18-Hole Round</span>
              </button>
            </div>
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
                {[15, 30, 45, 60].map((minutes) => {
                  const blocks = Math.floor(minutes / 15);
                  const baseXP = facilityBaseXP[durationModal.facility!];
                  const xp = baseXP * blocks;
                  
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
                            onLevelToggle={updateLevelCompletion}
                            onYoutubeOpen={(url) => setYoutubeModal({ open: true, url })}
                            onExpandToggle={(dayIdx, drillIdx) => {
                              if (isExpanded) {
                                setExpandedScheduleDrill(null);
                              } else {
                                setExpandedScheduleDrill({ dayIndex: dayIdx, drillIndex: drillIdx });
                              }
                            }}
                            defaultExpanded={false} // Default to collapsed
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
                  <div className="space-y-4 w-full">
                    {DAY_NAMES.map((dayName, dayIndex) => {
                      const day = weeklyPlan[dayIndex];
                      const dayDrills = day?.drills || [];
                      const completedCount = dayDrills.filter(d => d?.completed).length;
                      const totalCount = dayDrills.length;
                      
                      if (dayDrills.length === 0) return null;
                      
                      return (
                        <div key={dayIndex} className="border border-gray-200 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="text-lg font-semibold text-gray-900">{dayName}</h3>
                            {totalCount > 0 && (
                              <span className={`text-sm font-medium ${
                                completedCount === totalCount ? 'text-green-600' : 'text-gray-600'
                              }`}>
                                {completedCount}/{totalCount}
                              </span>
                            )}
                          </div>
                          <div className="space-y-2">
                            {dayDrills.map((drill, idx) => (
                              <div
                                key={`weekly-${dayIndex}-${drill.id}-${idx}`}
                                className={`flex items-center justify-between p-2 rounded ${
                                  drill.completed ? 'bg-green-50 border border-green-200' : 'bg-gray-50'
                                }`}
                              >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  {drill.completed && (
                                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                                  )}
                                  <span className={`text-sm flex-1 truncate ${
                                    drill.completed ? 'text-green-700 line-through' : 'text-gray-700'
                                  }`}>
                                    {drill.title}
                                  </span>
                                  {/* Media Icons - Small in Weekly View */}
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    {drill.pdf_url && (
                                      <a
                                        href={drill.pdf_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="p-1 rounded hover:bg-gray-200 transition-colors"
                                        title="View PDF"
                                      >
                                        <File className="w-3 h-3 text-gray-600" />
                                      </a>
                                    )}
                                    {drill.youtube_url && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setYoutubeModal({ open: true, url: drill.youtube_url || '' });
                                        }}
                                        className="p-1 rounded hover:bg-gray-200 transition-colors"
                                        title="Watch Video"
                                      >
                                        <PlayCircle className="w-3 h-3 text-red-600" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
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
        <DrillLibrary onAssignToDay={addDrillToDay} />

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

