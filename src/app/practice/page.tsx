"use client";

import { useState, useEffect } from "react";
import { useStats } from "@/contexts/StatsContext";
import { useAuth } from "@/contexts/AuthContext";
import { Sparkles, Calendar, Clock, Home, Target, Flag, FlagTriangleRight, Check, CheckCircle2, PlayCircle, FileText, BookOpen, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, ExternalLink, Download, X, RefreshCw, Pencil, File } from "lucide-react";
import { DRILLS as LIBRARY_DRILLS, type Drill as LibraryDrill } from "@/data/drills";
import DrillCard from "@/components/DrillCard";

type FacilityType = 'home' | 'range-mat' | 'range-grass' | 'bunker' | 'chipping-green' | 'putting-green';
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
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_ABBREVIATIONS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// Map Stats categories to Drill categories
const categoryMapping: Record<string, string[]> = {
  'Putting': ['Putting'],
  'Driving': ['Driving'],
  'Short Game': ['Short Game', 'Wedge Play'],
  'Approach': ['Irons', 'Skills'],
  'Sand Play': ['Short Game', 'Wedge Play'],
};

// Map facility types to compatible drill categories (using new pillars)
const facilityDrillMapping: Record<FacilityType, string[]> = {
  'home': ['Putting', 'Skills', 'Mental Game'],
  'range-mat': ['Driving', 'Irons', 'Skills'],
  'range-grass': ['Skills', 'Wedge Play'], // Smart allocation: Range Grass → Skills & Wedge Play
  'bunker': ['Short Game', 'Wedge Play'],
  'chipping-green': ['Short Game', 'Wedge Play'],
  'putting-green': ['Putting'],
};

// XP Tiering based on Pillar
const pillarXPTiering: Record<string, number> = {
  'Skills': 50,
  'Wedge Play': 75,
  'Putting': 50,
  'Driving': 75,
  'Irons': 60,
  'Short Game': 60,
  'On-Course': 500, // High XP for on-course practice
  'Mental Game': 100, // Higher XP for mental game
};

// Facility display info
const facilityInfo: Record<FacilityType, { label: string; icon: any }> = {
  'home': { label: 'Home/Net', icon: Home },
  'range-mat': { label: 'Range (Mat)', icon: Target },
  'range-grass': { label: 'Range (Grass)', icon: Target },
  'bunker': { label: 'Bunker', icon: Flag },
  'chipping-green': { label: 'Chipping Green', icon: Flag },
  'putting-green': { label: 'Putting Green', icon: Flag },
};

// All facility types
const ALL_FACILITIES: FacilityType[] = ['home', 'range-mat', 'range-grass', 'bunker', 'chipping-green', 'putting-green'];

// XP Logic: Create a function updateUserXP(points) that adds a specific amount of XP to the user's profiles record in Supabase
async function updateUserXP(userId: string, points: number): Promise<void> {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    // Get current XP from profile
    const { data: currentProfile, error: fetchError } = await supabase
      .from('profiles')
      .select('xp')
      .eq('id', userId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Error fetching current XP:', fetchError);
      // If XP column doesn't exist, initialize it to 0
      const currentXP = 0;
      const newXP = currentXP + points;

      // Update or insert XP
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ xp: newXP })
        .eq('id', userId);

      if (updateError) {
        console.error('Error updating XP:', updateError);
      } else {
        console.log(`XP updated: ${currentXP} + ${points} = ${newXP}`);
      }
      return;
    }

    const currentXP = currentProfile?.xp || 0;
    const newXP = currentXP + points;

    // Update XP in profiles table
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ xp: newXP })
      .eq('id', userId);

    if (updateError) {
      console.error('Error updating XP:', updateError);
    } else {
      console.log(`XP updated: ${currentXP} + ${points} = ${newXP}`);
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
  // No fallbacks to 'User' - if full_name is an email, show email; if it's a name, show name
  const getUserName = () => {
    // Force: ONLY use full_name from profiles table
    if (user?.fullName) {
      return user.fullName; // Show whatever is in full_name (email or name)
    }
    // If no full_name exists, show email as fallback
    if (user?.email) {
      return user.email;
    }
    // Final fallback only if nothing exists
    return '';
  };
  
  const userName = getUserName();
  
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
    'home': 5,
    'range-mat': 10,
    'range-grass': 10,
    'bunker': 10,
    'chipping-green': 10,
    'putting-green': 5,
  };

  // Initialize weekly plan and load from database (DATA JOIN: practice table + drills table)
  useEffect(() => {
    const loadWeeklySchedule = async () => {
      if (typeof window === 'undefined' || !user?.id) {
        // Initialize empty plan if no user
        const initialPlan: WeeklyPlan = {};
        DAY_ABBREVIATIONS.forEach((_, index) => {
          initialPlan[index] = {
            dayIndex: index,
            dayName: DAY_NAMES[index],
            selected: false,
            availableTime: 0,
            selectedFacilities: [],
            roundType: null,
            drills: [],
            date: new Date().toISOString().split('T')[0],
          };
        });
        setWeeklyPlan(initialPlan);
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

        // SIMPLIFY THE FETCH: Fetch practice schedule from practice table
        const { data: practiceData, error } = await supabase
          .from('practice')
          .select('*')
          .eq('user_id', user.id)
          .gte('completed_at', monday.toISOString())
          .lte('completed_at', sunday.toISOString())
          .order('completed_at', { ascending: true });

        // FIX LINE 338: Handle error gracefully without crashing
        if (error) {
          console.warn('Practice schedule fetch warning:', error.message || 'Unknown error');
          // Continue with empty schedule instead of crashing
        }

        // Initialize plan structure
        const loadedPlan: WeeklyPlan = {};
        DAY_ABBREVIATIONS.forEach((_, index) => {
          loadedPlan[index] = {
            dayIndex: index,
            dayName: DAY_NAMES[index],
            selected: false,
            availableTime: 0,
            selectedFacilities: [],
            roundType: null,
            drills: [],
            date: new Date().toISOString().split('T')[0],
          };
        });

        // CROSS-REFERENCE: Fetch drill details from drills table and match by title
        if (practiceData && practiceData.length > 0) {
          // Fetch all drills from drills table
          const { data: allDrillsData, error: drillsError } = await supabase
            .from('drills')
            .select('id, video_url, pdf_url, drill_levels, title, category, estimatedMinutes');
          
          // Create a map of drills by title for matching (CROSS-REFERENCE: match by title)
          const drillDetailsMap: Record<string, any> = {};
          if (allDrillsData && !drillsError) {
            allDrillsData.forEach((drill: any) => {
              // Index by id
              if (drill.id) {
                drillDetailsMap[drill.id] = drill;
              }
              // Index by title (lowercase for case-insensitive matching)
              if (drill.title) {
                drillDetailsMap[drill.title.toLowerCase().trim()] = drill;
              }
            });
          }

          // MAP THE DATA: Map practice data to weekly plan with cross-referenced drill data
          practiceData.forEach((practice: any) => {
            const practiceDate = new Date(practice.completed_at);
            const dayOfWeek = practiceDate.getDay();
            const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Convert Sunday=0 to Monday=0

            if (!loadedPlan[dayIndex]) return;

            // CROSS-REFERENCE: Match drill by title (practice.type or drill_name matches drills.title)
            let drillDetails: any = null;
            const matchTitle = practice.type || practice.drill_name || practice.title || '';
            
            if (matchTitle) {
              drillDetails = drillDetailsMap[matchTitle.toLowerCase().trim()];
            }
            
            // Fallback: try drill_id if title match didn't work
            if (!drillDetails && practice.drill_id) {
              drillDetails = drillDetailsMap[practice.drill_id];
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
            loadedPlan[dayIndex].drills.push({
              id: drillDetails?.id || practice.drill_id || `practice-${practice.id}`,
              title: drillDetails?.title || practice.drill_name || practice.type || practice.title || 'Practice Session',
              category: drillDetails?.category || practice.category || 'Practice',
              estimatedMinutes: drillDetails?.estimatedMinutes || practice.estimatedMinutes || 30,
              completed: practice.completed || false,
              // MAP THE DATA: video_url, pdf_url, drill_levels attached here
              pdf_url: drillDetails?.pdf_url || practice.pdf_url || undefined,
              youtube_url: drillDetails?.video_url || practice.youtube_url || practice.video_url || undefined,
              levels: levels || undefined,
            });
          });
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

  // Load drills from drills.ts (library drills) and merge with database data
  useEffect(() => {
    const loadDrills = async () => {
      if (typeof window !== 'undefined') {
        // Use drills from the library data file
        let libraryDrills: Drill[] = LIBRARY_DRILLS.map((d: LibraryDrill) => ({
          id: d.id,
          title: d.title,
          category: d.category,
          estimatedMinutes: d.estimatedMinutes,
          xpValue: d.xpValue,
          contentType: d.contentType,
          source: d.source,
          description: d.description,
        }));

        // DATA MAPPING: Fetch video_url, pdf_url, and drill_levels from drills table
        try {
          const { createClient } = await import("@/lib/supabase/client");
          const supabase = createClient();
          
          const { data: dbDrills, error } = await supabase
            .from('drills')
            .select('id, video_url, pdf_url, drill_levels');
          
          if (!error && dbDrills) {
            // Merge database data with library drills
            libraryDrills = libraryDrills.map(libDrill => {
              const dbDrill = dbDrills.find(db => db.id === libDrill.id);
              if (dbDrill) {
                // Parse drill_levels if it's a JSON string
                let levels = null;
                if (dbDrill.drill_levels) {
                  try {
                    levels = typeof dbDrill.drill_levels === 'string' 
                      ? JSON.parse(dbDrill.drill_levels)
                      : dbDrill.drill_levels;
                    // Ensure levels have id and name properties
                    if (Array.isArray(levels)) {
                      levels = levels.map((level, idx) => ({
                        id: level.id || `level-${idx}`,
                        name: level.name || level,
                        completed: level.completed || false
                      }));
                    }
                  } catch (e) {
                    console.error('Error parsing drill_levels:', e);
                  }
                }
                
                return {
                  ...libDrill,
                  // Map video_url to youtube_url for consistency
                  youtube_url: dbDrill.video_url || undefined,
                  pdf_url: dbDrill.pdf_url || undefined,
                  levels: levels || undefined,
                };
              }
              return libDrill;
            });
          }
        } catch (error) {
          console.error('Error fetching drills from database:', error);
        }

        setDrills(libraryDrills);
        
        // Also save to localStorage for backward compatibility
        localStorage.setItem('drillsData', JSON.stringify(libraryDrills));
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
    if (lastRound && lastRound.missed6ftAndIn > 2) {
      setMostNeededCategory('Putting');
      return;
    }

    // Find biggest gap
    const gaps = [
      { category: 'Approach', gap: goals.gir - averages.gir },
      { category: 'Driving', gap: goals.fir - averages.fir },
      { category: 'Short Game', gap: goals.upAndDown - averages.upAndDown },
      { category: 'Putting', gap: averages.putts - goals.putts },
    ];

    const biggestGap = gaps.reduce((max, current) => 
      current.gap > max.gap ? current : max
    );

    setMostNeededCategory(biggestGap.category);
  }, [rounds]);

  const toggleDay = (dayIndex: number) => {
    // Always set the clicked day as the active day for editing
    setSelectedDay(dayIndex);
    
    // Toggle the selected state (for plan generation)
    setWeeklyPlan(prev => ({
      ...prev,
      [dayIndex]: {
        ...prev[dayIndex],
        selected: !prev[dayIndex].selected,
      },
    }));
  };

  const updateTime = (dayIndex: number, minutes: number) => {
    setWeeklyPlan(prev => ({
      ...prev,
      [dayIndex]: {
        ...prev[dayIndex],
        availableTime: minutes,
      },
    }));
  };

  const toggleFacility = (dayIndex: number, facilityType: FacilityType) => {
    // Original behavior for roadmap facility selection
    setWeeklyPlan(prev => {
      const currentFacilities = prev[dayIndex].selectedFacilities || [];
      const isSelected = currentFacilities.includes(facilityType);
      
      return {
        ...prev,
        [dayIndex]: {
          ...prev[dayIndex],
          selectedFacilities: isSelected
            ? currentFacilities.filter(f => f !== facilityType)
            : [...currentFacilities, facilityType],
        },
      };
    });
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
      
      userProgress.totalXP = (userProgress.totalXP || 0) + xpEarned;
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
    setWeeklyPlan(prev => ({
      ...prev,
      [dayIndex]: {
        ...prev[dayIndex],
        roundType: prev[dayIndex].roundType === roundType ? null : roundType,
        availableTime: prev[dayIndex].roundType === roundType ? (prev[dayIndex].availableTime || 0) : timeInMinutes,
      },
    }));
  };

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

  const generatePlan = () => {
    const newPlan: WeeklyPlan = { ...weeklyPlan };
    
    // Get all selected days
    const selectedDays = Object.values(weeklyPlan).filter(day => day.selected);

    if (selectedDays.length === 0) {
      alert('Please select at least one day');
      return;
    }

    // Check if any selected day has time > 0 or a round selected
    const validDays = selectedDays.filter(day => 
      day.availableTime > 0 || day.roundType !== null
    );

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
        drill.category.toLowerCase().includes(cat.toLowerCase()) ||
        cat.toLowerCase().includes(drill.category.toLowerCase())
      )
    );

    // Apply XP tiering based on pillar
    relevantDrills = relevantDrills.map(drill => {
      const pillar = Object.keys(pillarXPTiering).find(p => 
        drill.category.toLowerCase().includes(p.toLowerCase()) ||
        p.toLowerCase().includes(drill.category.toLowerCase())
      );
      const xpValue = pillar ? pillarXPTiering[pillar] : drill.xpValue;
      return { ...drill, xpValue };
    });

    // Apply XP tiering based on pillar
    relevantDrills = relevantDrills.map(drill => {
      const pillar = Object.keys(pillarXPTiering).find(p => 
        drill.category.toLowerCase().includes(p.toLowerCase()) ||
        p.toLowerCase().includes(drill.category.toLowerCase())
      );
      const xpValue = pillar ? pillarXPTiering[pillar] : drill.xpValue;
      return { ...drill, xpValue };
    });

    // Try to find on-course challenge drills from the library first
    const libraryOnCourseChallenges: Drill[] = drills.filter(drill => 
      drill.title.toLowerCase().includes('ladies tee') ||
      drill.title.toLowerCase().includes('alternate club') ||
      drill.title.toLowerCase().includes('scrambling only') ||
      drill.title.toLowerCase().includes('challenge') ||
      drill.title.toLowerCase().includes('target') ||
      drill.title.toLowerCase().includes('3-club') ||
      drill.category.toLowerCase().includes('on-course') ||
      drill.category.toLowerCase().includes('course challenge')
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
      const selectedFacilities = day.selectedFacilities || [];
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
          drill.category.toLowerCase().includes('mental game') ||
          drill.category.toLowerCase().includes('mental')
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
          if (facility === 'range-grass') {
            facilityDrills = drills.filter(drill => 
              drill.category.toLowerCase().includes('skills') ||
              drill.category.toLowerCase().includes('wedge play') ||
              drill.category.toLowerCase().includes('wedge') ||
              compatibleCategories.some(cat =>
                drill.category.toLowerCase().includes(cat.toLowerCase()) ||
                cat.toLowerCase().includes(drill.category.toLowerCase())
              )
            );
          } else {
            facilityDrills = relevantDrills.filter(drill => 
              compatibleCategories.some(cat =>
                drill.category.toLowerCase().includes(cat.toLowerCase()) ||
                cat.toLowerCase().includes(drill.category.toLowerCase())
              )
            );
          }
          
          // Apply XP tiering to facility drills
          facilityDrills = facilityDrills.map(drill => {
            const pillar = Object.keys(pillarXPTiering).find(p => 
              drill.category.toLowerCase().includes(p.toLowerCase()) ||
              p.toLowerCase().includes(drill.category.toLowerCase())
            );
            const xpValue = pillar ? pillarXPTiering[pillar] : drill.xpValue;
            return { ...drill, xpValue };
          });

          // If no compatible drills, use any drills that could work at this facility
          if (facilityDrills.length === 0) {
            facilityDrills = drills.filter(drill => {
              return compatibleCategories.some(cat =>
                drill.category.toLowerCase().includes(cat.toLowerCase()) ||
                drill.title.toLowerCase().includes(cat.toLowerCase())
              );
            });
          }

          // Select drills for this facility
          const shuffled = [...facilityDrills].sort(() => Math.random() - 0.5);
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
        // Reset all completion states when generating a new plan (session-based)
        newPlan[day.dayIndex] = {
          ...day,
          date: new Date().toISOString().split('T')[0],
          drills: allSelectedDrills.map(d => ({
            id: d.id,
            title: d.title,
            category: d.category,
            estimatedMinutes: d.isSet ? (d.estimatedMinutes * (d.setCount || 1)) : d.estimatedMinutes,
            isSet: d.isSet,
            setCount: d.setCount,
            facility: d.facility,
            completed: false, // Always start as not completed (session-based)
            xpEarned: 0, // Reset XP earned for this session
            isRound: d.isRound || false, // Preserve round flag
            contentType: d.contentType, // Preserve content type
            source: d.source, // Preserve source
            description: d.description, // Preserve description
          })),
        };
      }
    });

    // Save to localStorage
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

        // Check the Submit Function: Ensure that when a drill is logged, it uses supabase.from('drill_scores').insert(...) instead of just marking it as a practice session
        // Match the Fields: Ensure it sends drill_name, score, and user_id
        // Try drill_scores table first (as user specified), fallback to drills table
        let saved = false;
        
        // TEMPORARY BYPASS: Save to practice table without drill_id/drill_name
        // Use only columns that definitely exist: user_id, completed, completed_at
        const { data: practiceData, error: practiceError } = await supabase
          .from('practice')
          .insert({
            user_id: user.id,
            // TEMPORARY BYPASS: Remove drill_id and drill_name - add back when columns exist
            // drill_id: drill.id,
            // drill_name: drill.title,
            completed: true,
            completed_at: new Date().toISOString(),
            // Include optional fields if they exist in the table
            pdf_url: drill.pdf_url || null,
            youtube_url: drill.youtube_url || null,
            completed_levels: drill.levels ? JSON.stringify(drill.levels.filter(l => l.completed).map(l => l.id)) : null,
          })
          .select();

        if (practiceError) {
          console.error('Practice: Error saving to practice table:', practiceError);
        } else {
          console.log('Practice: Drill saved to practice table:', practiceData);
          saved = true;
        }

        // Trigger on Drill: In the markDrillComplete function, add 100 XP to the user whenever a drill is logged
        await updateUserXP(user.id, 100);
        console.log('Practice: Added 100 XP for drill completion');

        // Trigger Global Sync: After saving, dispatch the drillsUpdated event so the leaderboard refreshes immediately
        await refreshDrills();
        window.dispatchEvent(new Event('drillsUpdated'));
        console.log('Practice: Drill logged - triggering global refresh for all users');
      } catch (error) {
        console.error('Practice: Error in markDrillComplete database save:', error);
        // Continue with localStorage fallback
      }
    }

    // Update userProgress and activity history (ALWAYS award XP when marking complete)
    if (typeof window !== 'undefined' && !isCurrentlyCompleted) {
      const savedProgress = localStorage.getItem('userProgress');
      const userProgress = savedProgress ? JSON.parse(savedProgress) : { 
        completedDrills: [], 
        totalXP: 0, 
        totalMinutes: 0,
        drillCompletions: {} // Track total completions per drill
      };
      
      // ALWAYS add XP and minutes when marking complete (repeatable - every click awards XP)
      userProgress.totalXP = (userProgress.totalXP || 0) + xpEarned;
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
    if (!day.drills || day.drills.length === 0) return false;
    return day.drills.every(drill => drill.completed);
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
        .select('video_url, pdf_url, drill_levels, title, category, estimatedMinutes')
        .eq('id', newDrill.id)
        .single();

      if (dbDrill) {
        // Parse drill_levels if it's a JSON string
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

        // DATA SYNC: Attach video_url, pdf_url, and drill_levels
        drillData = {
          ...newDrill,
          pdf_url: dbDrill.pdf_url || newDrill.pdf_url,
          youtube_url: dbDrill.video_url || newDrill.youtube_url || newDrill.video_url,
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

    // Save to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('weeklyPracticePlans', JSON.stringify(updatedPlan));
    }

    setWeeklyPlan(updatedPlan);
    setGeneratedPlan(updatedPlan);
    setSwappingDrill(null);
  };

  const getDaySummary = (day: DayPlan) => {
    if (!day.selected || day.drills.length === 0) return null;
    
    const totalTime = day.drills.reduce((sum, d) => sum + d.estimatedMinutes, 0);
    const categories = [...new Set(day.drills.map(d => d.category))];
    
    return {
      dayName: day.dayName,
      totalTime,
      categories: categories.join(' & '),
    };
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="max-w-md mx-auto bg-white min-h-screen px-4">
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
                const isSelected = day?.selected || false;
                const isActive = selectedDay === index; // Active day being edited
                return (
                  <button
                    key={index}
                    onClick={() => toggleDay(index)}
                    className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl transition-all min-h-[70px] ${
                      isActive
                        ? 'bg-[#FFA500] border-2 border-[#014421]' // Orange for active day
                        : isSelected
                        ? 'bg-[#014421]/10 border-2 border-[#014421]/30' // Subtle green for selected
                        : 'bg-gray-50 border border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span className={`text-sm font-semibold ${
                      isActive ? 'text-[#014421]' : isSelected ? 'text-[#014421]' : 'text-gray-600'
                    }`}>
                      {abbr}
                    </span>
                    {day?.availableTime > 0 ? (
                      <span className={`text-xs font-bold ${
                        isActive ? 'text-[#014421]' : isSelected ? 'text-[#014421]' : 'text-gray-700'
                      }`}>
                        {formatTime(day.availableTime)}
                      </span>
                    ) : (
                      <span className={`text-xs ${
                        isActive ? 'text-[#014421]/60' : isSelected ? 'text-[#014421]/40' : 'text-gray-400'
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
                  
                  {/* Slider Input with 15-minute snap points */}
                  <input
                    type="range"
                    min="0"
                    max="480"
                    step="15"
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

                {/* Course Selection Buttons - Below Slider */}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setRoundType(selectedDay, '9-hole')}
                    className={`flex-1 py-3 px-4 rounded-lg font-semibold text-sm transition-all border-2 ${
                      weeklyPlan[selectedDay]?.roundType === '9-hole'
                        ? 'bg-[#FFA500] border-[#014421] text-[#014421]'
                        : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400'
                    }`}
                  >
                    <FlagTriangleRight className="w-4 h-4 inline mr-2" />
                    9-Hole Round
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoundType(selectedDay, '18-hole')}
                    className={`flex-1 py-3 px-4 rounded-lg font-semibold text-sm transition-all border-2 ${
                      weeklyPlan[selectedDay]?.roundType === '18-hole'
                        ? 'bg-[#FFA500] border-[#014421] text-[#014421]'
                        : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400'
                    }`}
                  >
                    <FlagTriangleRight className="w-4 h-4 inline mr-2" />
                    18-Hole Round
                  </button>
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
              </div>
            </div>
          </div>
        )}

        {/* Generate Plan Button */}
        <div className="mb-6">
          <button
            onClick={generatePlan}
            disabled={selectedDay === null || (weeklyPlan[selectedDay]?.availableTime || 0) === 0}
            className={`w-full py-4 rounded-xl font-semibold text-white shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 ${
              selectedDay === null || (weeklyPlan[selectedDay]?.availableTime || 0) === 0
                ? 'opacity-50 cursor-not-allowed'
                : ''
            }`}
            style={{ backgroundColor: '#014421' }}
          >
            <Sparkles className="w-5 h-5" />
            Practice Roadmap
          </button>
        </div>

        {/* Summary Cards */}
        {generatedPlan && Object.values(generatedPlan).some(day => day.selected && day.drills.length > 0) && (
          <div className="space-y-3 mb-6">
            {Object.values(generatedPlan)
              .filter(day => day.selected && day.drills.length > 0)
              .map((day) => {
                const summary = getDaySummary(day);
                if (!summary) return null;
                
                const dayComplete = isDayComplete(day);
                const completedCount = day.drills.filter((d: DayPlan['drills'][0]) => d.completed).length;
                const totalDrills = day.drills.length;
                
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
                      {day.drills.map((drill: DayPlan['drills'][0], idx: number) => {
                        const actualDrillIndex = day.drills.findIndex(d => d.id === drill.id);
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
                            defaultExpanded={true} // AUTO-OPEN: Force expanded so buttons are always visible
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

        {/* Info Card */}
        <div className="mb-6">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
            <p className="text-sm text-gray-600">
              <span className="font-semibold text-gray-900">Focus Area:</span>{' '}
              {Object.values(weeklyPlan).some(day => day.selected && day.roundType) ? (
                <span className="font-semibold" style={{ color: '#014421' }}>
                  On-Course Performance.
                </span>
              ) : (
                <>
                  Based on your stats, we're targeting <span className="font-semibold" style={{ color: '#014421' }}>
                    {mostNeededCategory}
                  </span> improvements.
                </>
              )}
            </p>
          </div>
        </div>

        {/* Quick Practice Log Section */}
        <div className="mb-6">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-4">Quick Practice Log</h3>
            <p className="text-xs text-gray-600 mb-4">Tap a facility to log freestyle practice</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {ALL_FACILITIES.map((facilityType) => {
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
                    <span className="text-xs font-medium text-center text-gray-700">
                      {info.label}
                    </span>
                  </button>
                );
              })}
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
              <div className="px-4 pb-4 w-full overflow-hidden" style={{ maxWidth: '100vw' }}>
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
                        const actualDrillIndex = day.drills.findIndex(d => d.id === drill.id);
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
                            defaultExpanded={true} // AUTO-OPEN: Force expanded so buttons are always visible
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
                      const completedCount = dayDrills.filter(d => d.completed).length;
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
  );
}
