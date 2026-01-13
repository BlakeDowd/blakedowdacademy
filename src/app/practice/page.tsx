"use client";

import { useState, useEffect } from "react";
import { useStats } from "@/contexts/StatsContext";
import { useAuth } from "@/contexts/AuthContext";
import { Sparkles, Calendar, Clock, Home, Target, Flag, FlagTriangleRight, Check, CheckCircle2, PlayCircle, FileText, BookOpen, ChevronDown, ChevronUp, ExternalLink, Download, X, RefreshCw } from "lucide-react";
import { DRILLS as LIBRARY_DRILLS, type Drill as LibraryDrill } from "@/data/drills";

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

export default function PracticePage() {
  const { rounds } = useStats();
  const { user } = useAuth();
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
  const [swappingDrill, setSwappingDrill] = useState<{ dayIndex: number; drillIndex: number } | null>(null); // Track which drill is being swapped
  const [swapSuccess, setSwapSuccess] = useState<{ dayIndex: number; drillIndex: number } | null>(null); // Track successful swap for feedback
  const [expandedScheduleDrill, setExpandedScheduleDrill] = useState<{ dayIndex: number; drillIndex: number } | null>(null); // Track expanded drill in schedule
  
  // Base XP per facility type (for freestyle practice)
  const facilityBaseXP: Record<FacilityType, number> = {
    'home': 5,
    'range-mat': 10,
    'range-grass': 10,
    'bunker': 10,
    'chipping-green': 10,
    'putting-green': 5,
  };

  // Initialize weekly plan and load from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Try to load saved plans
    const savedPlans = localStorage.getItem('weeklyPracticePlans');
    if (savedPlans) {
      try {
        const parsedPlans = JSON.parse(savedPlans);
        // Reset all times to 0 and clear drills - wipe hardcoded data
        const resetPlans: WeeklyPlan = {};
        DAY_ABBREVIATIONS.forEach((_, index) => {
          resetPlans[index] = {
            dayIndex: index,
            dayName: DAY_NAMES[index],
            selected: false, // Reset selection state
            availableTime: 0, // Always start at 0 on refresh - wipe hardcoded data
            selectedFacilities: [],
            roundType: null,
            drills: [], // Clear drills on refresh - user must regenerate
            date: new Date().toISOString().split('T')[0],
          };
        });
        setWeeklyPlan(resetPlans);
        setGeneratedPlan(null); // Clear generated plan on refresh
        return;
      } catch (e) {
        console.error('Error loading saved plans:', e);
      }
    }

    // Initialize empty plan with all days at 0
    const initialPlan: WeeklyPlan = {};
    DAY_ABBREVIATIONS.forEach((_, index) => {
      initialPlan[index] = {
        dayIndex: index,
        dayName: DAY_NAMES[index],
        selected: false,
        availableTime: 0, // Start at 0 minutes
        selectedFacilities: [],
        roundType: null,
        drills: [],
        date: new Date().toISOString().split('T')[0],
      };
    });
    setWeeklyPlan(initialPlan);
    setGeneratedPlan(null); // No generated plan initially
  }, []);

  // Load drills from drills.ts (library drills)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Use drills from the library data file
      const libraryDrills: Drill[] = LIBRARY_DRILLS.map((d: LibraryDrill) => ({
        id: d.id,
        title: d.title,
        category: d.category,
        estimatedMinutes: d.estimatedMinutes,
        xpValue: d.xpValue,
        contentType: d.contentType,
        source: d.source,
        description: d.description,
      }));
      setDrills(libraryDrills);
      
      // Also save to localStorage for backward compatibility
      localStorage.setItem('drillsData', JSON.stringify(libraryDrills));
    }
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
  const logFreestylePractice = (facility: FacilityType, duration: number) => {
    if (typeof window === 'undefined') return;

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

    // Log to activity history
    const activityHistory = JSON.parse(localStorage.getItem('practiceActivityHistory') || '[]');
    const timestamp = new Date().toISOString();
    const facilityLabel = facilityInfo[facility].label;
    activityHistory.push({
      id: `freestyle-${facility}-${Date.now()}-${Math.random()}`,
      type: 'practice',
      title: `${facilityLabel} Practice`,
      date: timestamp.split('T')[0],
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

    // Show XP notification
    setXpNotification({ show: true, amount: xpEarned });
    setTimeout(() => {
      setXpNotification({ show: false, amount: 0 });
    }, 3000);

    // Close modal
    setDurationModal({ open: false, facility: null });
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
  const markDrillComplete = (dayIndex: number, drillIndex: number) => {
    const day = weeklyPlan[dayIndex];
    if (!day || !day.drills[drillIndex]) return;

    const drill = day.drills[drillIndex];
    const isCurrentlyCompleted = drill.completed || false;

    // Calculate XP (always award XP when marking complete, regardless of previous state)
    const xpEarned = calculateDrillXP(drill, day);

    // Update plan (toggle completion state)
    const updatedPlan = { ...weeklyPlan };
    updatedPlan[dayIndex] = {
      ...day,
      drills: day.drills.map((d, idx) => 
        idx === drillIndex
          ? { ...d, completed: !isCurrentlyCompleted, xpEarned: !isCurrentlyCompleted ? xpEarned : 0 }
          : d
      ),
    };

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
        replaceDrill(dayIndex, drillIndex, randomDrill);
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
    
    replaceDrill(dayIndex, drillIndex, randomDrill);
    
    // Show success feedback
    setSwapSuccess({ dayIndex, drillIndex });
    setTimeout(() => {
      setSwapSuccess(null);
    }, 2000);
  };

  // Replace a drill in the plan
  const replaceDrill = (dayIndex: number, drillIndex: number, newDrill: Drill) => {
    const day = weeklyPlan[dayIndex];
    if (!day || !day.drills[drillIndex]) return;

    const currentDrill = day.drills[drillIndex];
    
    // Apply XP tiering based on pillar
    const pillar = Object.keys(pillarXPTiering).find(p => 
      newDrill.category.toLowerCase().includes(p.toLowerCase()) ||
      p.toLowerCase().includes(newDrill.category.toLowerCase())
    );
    const xpValue = pillar ? pillarXPTiering[pillar] : newDrill.xpValue;

    const updatedPlan = { ...weeklyPlan };
    updatedPlan[dayIndex] = {
      ...day,
      drills: day.drills.map((d, idx) => 
        idx === drillIndex
          ? {
              ...newDrill,
              id: `swapped-${dayIndex}-${drillIndex}-${Date.now()}-${newDrill.id}`,
              category: newDrill.category,
              estimatedMinutes: newDrill.estimatedMinutes,
              xpValue: xpValue,
              completed: false, // Reset completion status
              xpEarned: 0,
              facility: currentDrill.facility, // Preserve facility assignment
              isRound: currentDrill.isRound, // Preserve round flag
              contentType: newDrill.contentType,
              source: newDrill.source,
              description: newDrill.description,
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
        {/* Header */}
        <div className="pt-6 pb-4">
          <h1 className="text-2xl font-bold text-gray-900">Weekly Planner</h1>
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
                        const isCompleted = drill.completed || false;
                        const xpEarned = drill.xpEarned || 0;
                        const isRound = drill.isRound || false;
                        
                        // Get total completion count for this drill
                        const getCompletionCount = () => {
                          if (typeof window === 'undefined') return 0;
                          const savedProgress = localStorage.getItem('userProgress');
                          if (savedProgress) {
                            try {
                              const userProgress = JSON.parse(savedProgress);
                              return userProgress.drillCompletions?.[drill.id] || 0;
                            } catch (e) {
                              return 0;
                            }
                          }
                          return 0;
                        };
                        const completionCount = getCompletionCount();
                        
                        const drillKey = `${drill.id}-${day.dayIndex}-${idx}`;
                        const isExpanded = expandedDrill === drillKey;
                        
                        return (
                          <div
                            key={drillKey}
                            className={`rounded-lg transition-all ${
                              isRound
                                ? isCompleted
                                  ? 'bg-[#FFA500]/20 border-2 border-[#FFA500]'
                                  : 'bg-gray-50 border-2 border-[#FFA500]'
                                : isCompleted
                                  ? 'bg-[#FFA500]/20 border-2 border-[#FFA500]'
                                  : 'bg-gray-50 border border-gray-200'
                            }`}
                          >
                            {/* Drill Card Header - Clickable */}
                            <div
                              className="flex items-center justify-between p-3 cursor-pointer"
                              onClick={() => setExpandedDrill(isExpanded ? null : drillKey)}
                            >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              {/* Completion Checkbox */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation(); // Prevent card expansion when clicking checkbox
                                  markDrillComplete(day.dayIndex, idx);
                                }}
                                className={`flex-shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${
                                  isCompleted
                                    ? 'bg-[#FFA500] border-[#014421]'
                                    : 'bg-white border-gray-300 hover:border-[#FFA500]'
                                }`}
                              >
                                {isCompleted && (
                                  <Check className="w-4 h-4" style={{ color: '#014421' }} />
                                )}
                              </button>
                              
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {/* Content Type Icon */}
                                  {drill.contentType && (
                                    <span className="flex-shrink-0">
                                      {drill.contentType === 'video' && (
                                        <PlayCircle className="w-4 h-4 text-gray-500" />
                                      )}
                                      {drill.contentType === 'pdf' && (
                                        <FileText className="w-4 h-4 text-gray-500" />
                                      )}
                                      {drill.contentType === 'text' && (
                                        <BookOpen className="w-4 h-4 text-gray-500" />
                                      )}
                                    </span>
                                  )}
                                  <span className={`text-sm font-medium ${
                                    isCompleted ? 'text-[#014421] line-through' : isRound ? 'text-[#014421] font-semibold' : 'text-gray-800'
                                  }`}>
                                    {drill.title}
                                  </span>
                                  {/* Show +500 XP badge for rounds, even when not completed */}
                                  {isRound && !isCompleted && (
                                    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ 
                                      backgroundColor: '#FFA500', 
                                      color: '#014421' 
                                    }}>
                                      +500 XP
                                    </span>
                                  )}
                                  {isCompleted && xpEarned > 0 && (
                                    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ 
                                      backgroundColor: '#FFA500', 
                                      color: '#014421' 
                                    }}>
                                      +{xpEarned} XP
                                    </span>
                                  )}
                                </div>
                                {/* Times Completed Counter */}
                                {completionCount > 0 && (
                                  <div className="text-xs text-gray-500 mt-1">
                                    Completed {completionCount} {completionCount === 1 ? 'time' : 'times'}
                                  </div>
                                )}
                                {drill.isSet && drill.setCount && (
                                  <span className="text-xs text-gray-500 ml-0">
                                    ({drill.setCount}x set)
                                  </span>
                                )}
                                {drill.facility && (
                                  <div className="text-xs text-gray-500 mt-0.5">
                                    @ {facilityInfo[drill.facility].label}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-medium ${
                                isCompleted ? 'text-[#014421]' : 'text-gray-600'
                              }`}>
                                {formatTime(drill.estimatedMinutes)}
                              </span>
                              {/* Expand/Collapse Icon */}
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4 text-gray-500" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-gray-500" />
                              )}
                            </div>
                            </div>
                            
                            {/* Expandable Content */}
                            {isExpanded && (
                              <div className="px-3 pb-3 border-t border-gray-200 pt-3">
                                {drill.contentType === 'video' && drill.source && (
                                  <div className="mb-3">
                                    <a
                                      href={drill.source}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-2 px-4 py-2 text-white rounded-lg transition-all font-medium text-sm"
                                      style={{ backgroundColor: '#dc2626' }}
                                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#b91c1c'}
                                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <PlayCircle className="w-4 h-4" />
                                      Watch on YouTube
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  </div>
                                )}
                                
                                {drill.contentType === 'pdf' && drill.source && (
                                  <div className="mb-3">
                                    <a
                                      href={drill.source}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-2 px-4 py-2 bg-[#014421] hover:bg-[#014421]/90 text-white rounded-lg transition-all font-medium text-sm"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <Download className="w-4 h-4" />
                                      View PDF Guide
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  </div>
                                )}
                                
                                {drill.contentType === 'text' && drill.description && (
                                  <div className="mb-3">
                                    <div className="bg-white rounded-lg p-4 border border-gray-200 max-h-96 overflow-y-auto">
                                      <div className="prose prose-sm max-w-none">
                                        <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans">
                                          {drill.description}
                                        </pre>
                                      </div>
                                    </div>
                                  </div>
                                )}
                                
                                {/* Description fallback for drills without specific content type */}
                                {!drill.contentType && drill.description && (
                                  <div className="mb-3">
                                    <div className="bg-white rounded-lg p-4 border border-gray-200 max-h-96 overflow-y-auto">
                                      <p className="text-sm text-gray-700">{drill.description}</p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
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

            {/* Schedule Content - Collapsible */}
            {scheduleExpanded && (
              <div className="px-4 pb-4">
                {/* Horizontal 7-Day Calendar Row - Responsive */}
                <div className="grid grid-cols-7 gap-1 sm:gap-2 overflow-x-auto">
                  {DAY_NAMES.map((dayName, dayIndex) => {
                    const day = weeklyPlan[dayIndex];
                    const dayDrills = day?.drills || [];
                    const completedCount = dayDrills.filter(d => d.completed).length;
                    const totalCount = dayDrills.length;
                    
                    // Get current week's Monday
                    const today = new Date();
                    const currentDay = today.getDay();
                    const monday = new Date(today);
                    monday.setDate(today.getDate() - (currentDay === 0 ? 6 : currentDay - 1));
                    const dayDate = new Date(monday);
                    dayDate.setDate(monday.getDate() + dayIndex);
                    const isToday = dayDate.toDateString() === today.toDateString();
                    
                    return (
                      <div key={dayIndex} className="flex flex-col min-w-[100px] sm:min-w-[112px]" style={{ transform: 'scale(1.35)' }}>
                        {/* Day Header - Larger font for better readability on mobile */}
                        <div className={`text-center mb-1.5 sm:mb-2 ${isToday ? 'font-bold' : 'font-medium'}`}>
                          <div className={`text-base sm:text-lg ${isToday ? 'text-[#014421]' : 'text-gray-600'}`}>
                            {dayName.substring(0, 3)}
                          </div>
                          <div className={`text-base sm:text-lg ${isToday ? 'text-[#FFA500]' : 'text-gray-500'}`}>
                            {dayDate.getDate()}
                          </div>
                        </div>
                        
                        {/* Drill Blocks */}
                        <div className="space-y-1.5 sm:space-y-2 min-h-[72px] sm:min-h-[86px]">
                          {dayDrills.length === 0 ? (
                            <div className="text-center py-2">
                              <span className="text-base sm:text-lg text-gray-400">—</span>
                            </div>
                          ) : (
                            dayDrills.slice(0, 3).map((drill, drillIdx) => {
                              const isCompleted = drill.completed || false;
                              const actualDrillIndex = day.drills.findIndex(d => d.id === drill.id);
                              const isSwapping = swappingDrill?.dayIndex === dayIndex && swappingDrill?.drillIndex === actualDrillIndex;
                              const justSwapped = swapSuccess?.dayIndex === dayIndex && swapSuccess?.drillIndex === actualDrillIndex;
                              const isExpanded = expandedScheduleDrill?.dayIndex === dayIndex && expandedScheduleDrill?.drillIndex === actualDrillIndex;
                              
                              return (
                                <div key={`${dayIndex}-${drill.id}-${drillIdx}`} className="relative group">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      // Expand/collapse instead of auto-complete
                                      if (actualDrillIndex !== -1) {
                                        if (isExpanded) {
                                          setExpandedScheduleDrill(null);
                                        } else {
                                          setExpandedScheduleDrill({ dayIndex, drillIndex: actualDrillIndex });
                                        }
                                      }
                                    }}
                                    className={`w-full p-2.5 sm:p-3 rounded text-left transition-all hover:scale-105 relative ${
                                      isCompleted
                                        ? 'bg-green-500 text-white border-2 border-green-600'
                                        : 'bg-[#FFA500] text-[#014421] border-2 border-[#FFA500] hover:bg-[#FFA500]/90'
                                    } ${justSwapped ? 'ring-2 ring-green-400 ring-offset-1' : ''} ${isExpanded ? 'ring-2 ring-[#014421]' : ''}`}
                                    title={drill.title}
                                  >
                                    <div className="text-lg sm:text-xl font-semibold truncate pr-6">
                                      {drill.title.length > 12 ? drill.title.substring(0, 12) + '...' : drill.title}
                                    </div>
                                    {isCompleted && (
                                      <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 mt-0.5" />
                                    )}
                                    {justSwapped && (
                                      <div className="absolute top-0 right-0 bg-green-400 text-white text-[9px] sm:text-[10px] px-1 rounded animate-pulse">
                                        Swapped!
                                      </div>
                                    )}
                                    {isSwapping && (
                                      <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded">
                                        <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin text-[#014421]" />
                                      </div>
                                    )}
                                    {isExpanded && (
                                      <ChevronUp className="absolute top-1 right-1 w-3 h-3 text-[#014421]" />
                                    )}
                                  </button>
                                  
                                  {/* Expanded Drill View */}
                                  {isExpanded && (
                                    <div className="absolute z-10 mt-1 w-full bg-white border-2 border-[#014421] rounded-lg shadow-lg p-3 sm:p-4">
                                      <div className="space-y-2.5">
                                        <div className="font-semibold text-sm sm:text-base text-gray-900">{drill.title}</div>
                                        {drill.description && (
                                          <div className="text-xs sm:text-sm text-gray-600 max-h-32 overflow-y-auto">
                                            {drill.description}
                                          </div>
                                        )}
                                        <div className="flex items-center justify-between text-xs sm:text-sm text-gray-500">
                                          <span>{drill.estimatedMinutes} min</span>
                                          {drill.facility && (
                                            <span>@ {facilityInfo[drill.facility].label}</span>
                                          )}
                                        </div>
                                        {/* Mark as Done Button */}
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (actualDrillIndex !== -1) {
                                              markDrillComplete(dayIndex, actualDrillIndex);
                                              setExpandedScheduleDrill(null);
                                            }
                                          }}
                                          disabled={isCompleted}
                                          className={`w-full py-2 sm:py-2.5 px-4 rounded-lg font-semibold text-sm sm:text-base transition-all ${
                                            isCompleted
                                              ? 'bg-green-500 text-white cursor-not-allowed'
                                              : 'bg-[#014421] text-white hover:bg-[#014421]/90'
                                          }`}
                                        >
                                          {isCompleted ? (
                                            <span className="flex items-center justify-center gap-1.5">
                                              <CheckCircle2 className="w-4 h-4" />
                                              Completed
                                            </span>
                                          ) : (
                                            'Mark as Done'
                                          )}
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                  
                                  {/* Swap Button */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (actualDrillIndex !== -1) {
                                        swapDrill(dayIndex, actualDrillIndex);
                                      }
                                    }}
                                    disabled={isSwapping || drill.isRound}
                                    className={`absolute top-0 right-0 p-0.5 sm:p-1 rounded-bl rounded-tr transition-all ${
                                      drill.isRound
                                        ? 'opacity-30 cursor-not-allowed'
                                        : 'opacity-0 group-hover:opacity-100 hover:bg-gray-200/80'
                                    } ${isSwapping ? 'opacity-100' : ''}`}
                                    title="Swap Drill"
                                  >
                                    <RefreshCw className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${isSwapping ? 'animate-spin text-[#014421]' : 'text-gray-600'}`} />
                                  </button>
                                </div>
                              );
                            })
                          )}
                          {dayDrills.length > 3 && (
                            <div className="text-center">
                              <span className="text-xs sm:text-sm text-gray-500">+{dayDrills.length - 3} more</span>
                            </div>
                          )}
                        </div>
                        
                        {/* Completion Indicator */}
                        {totalCount > 0 && (
                          <div className="mt-1.5 sm:mt-2 text-center">
                            <span className={`text-xs sm:text-sm font-semibold ${
                              completedCount === totalCount ? 'text-green-600' : 'text-gray-600'
                            }`}>
                              {completedCount}/{totalCount}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
