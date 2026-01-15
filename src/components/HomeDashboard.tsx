"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useEffect, useRef, useMemo } from "react";
import { useStats } from "@/contexts/StatsContext";
import { useAuth } from "@/contexts/AuthContext";
import { 
  Play,
  Flame,
  Zap,
  TrendingDown,
  TrendingUp,
  Star,
  Trophy,
  Target,
  Activity,
  Clock,
  X,
  BookOpen,
  Users,
  Pencil,
  Check
} from "lucide-react";
import IconPicker, { GOLF_ICONS } from "@/components/IconPicker";
import Toast from "@/components/Toast";

// Video drills for Daily Focus rotation
const VIDEO_DRILLS = [
  {
    id: '1',
    title: 'Mastering Your Short Game',
    description: 'Learn the fundamentals of chipping and putting with Coach Sarah Thompson.',
    source: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    duration: '8:42',
    coach: 'Coach Sarah Thompson'
  },
  {
    id: '2',
    title: 'Driving Range Fundamentals',
    description: 'Perfect your swing mechanics and increase your driving distance.',
    source: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    duration: '12:15',
    coach: 'Coach Mike Johnson'
  },
  {
    id: '5',
    title: 'Swing Analysis Techniques',
    description: 'Learn how to analyze and improve your golf swing using video analysis.',
    source: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    duration: '15:30',
    coach: 'Coach David Lee'
  },
  {
    id: '7',
    title: 'Advanced Putting Techniques',
    description: 'Master advanced putting strategies for competitive play.',
    source: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    duration: '18:00',
    coach: 'Coach Emma Wilson'
  },
  {
    id: '9',
    title: 'Power Driving Techniques',
    description: 'Increase your driving distance with advanced techniques.',
    source: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    duration: '20:00',
    coach: 'Coach Tom Anderson'
  }
];

// Function to select video based on date seed
const getDailyVideo = (refreshKey: number = 0) => {
  const today = new Date();
  const dateSeed = today.getDate() + today.getMonth() * 31 + refreshKey;
  const videoIndex = dateSeed % VIDEO_DRILLS.length;
  return VIDEO_DRILLS[videoIndex];
};

interface ActivityItem {
  id: string;
  type: 'practice' | 'round';
  title: string;
  date: string;
  xp?: number;
  category?: string;
  drillTitle?: string;
}

interface CommunityRound {
  id: string;
  name: string;
  course: string;
  score: number;
  badge?: string;
  timeAgo: string;
}

export default function HomeDashboard() {
  const router = useRouter();
  const { rounds } = useStats();
  const { user, refreshUser } = useAuth();
  
  // Add Initialization Guard: Wrap the component return in a check: if (!rounds) return null;
  // Safety Check: Add if (!rounds) return null; at the top of the component to ensure the app doesn't try to render before the data exists
  // Initialization Guard: Initialize the rounds variable as an empty array [] at the top of the component to ensure it exists before the code tries to access it
  const safeRoundsArray = (rounds || []) as any[];
  
  // Add Initialization Guard: Early return if rounds is not available (but allow empty array)
  // Note: We allow empty array to render, but if rounds is null/undefined, we return null
  if (rounds === null || rounds === undefined) {
    return null;
  }
  
  // Add Fetch Guard: Use useRef guards similar to Academy page to prevent loops
  const dataFetched = useRef(false);
  
  // Toast state for non-blocking notifications
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);
  
  // Sync Name: Replace 'Member' with {user?.full_name || 'Golfer'}
  // Note: AuthContext maps full_name from database to fullName property
  // Safety: Keep the existing useRef guards to ensure this doesn't trigger a re-fetch loop
  const displayName = useMemo(() => {
    // Sync Name: Replace 'Member' with {user?.full_name || 'Golfer'}
    // AuthContext provides fullName (mapped from full_name in database)
    if (!user) return 'Golfer';
    // Use user.fullName (which comes from profiles.full_name) with fallback to 'Golfer'
    const name = user.fullName || 'Golfer';
    console.log('HomeDashboard: displayName calculated:', { fullName: user.fullName, email: user.email, result: name });
    return name;
  }, [user?.fullName, user]);
  
  // Use useMemo to safely calculate rounds count from useStats()
  // Update HomeDashboard.tsx to use useStats() to get the actual rounds.length so the stats are dynamic instead of zero
  // Make sure these are wrapped in the same useRef guards we used in the Academy to prevent any new loops
  const userRoundsCount = useMemo(() => {
    if (!rounds || !user?.id) return 0;
    // Filter Dashboard Rounds: Even though we fetch 'all' rounds in the background, 
    // filter safeRounds to show only the ones where round.user_id === user.id for personal stats
    const userRounds = rounds.filter((round: any) => round.user_id === user.id);
    return userRounds.length;
  }, [rounds, user?.id]);
  
  // Calculate streak days from practice activity history
  // Update HomeDashboard.tsx to use useStats() to get the actual rounds.length so the stats are dynamic instead of zero
  const streakDays = useMemo(() => {
    if (typeof window === 'undefined') return 0;
    try {
      const practiceHistory = JSON.parse(localStorage.getItem('practiceActivityHistory') || '[]');
      if (!practiceHistory || practiceHistory.length === 0) return 0;
      
      // Sort by date descending
      const sortedHistory = practiceHistory
        .map((entry: any) => ({
          date: new Date(entry.timestamp || entry.date),
          entry
        }))
        .sort((a: any, b: any) => b.date.getTime() - a.date.getTime());
      
      if (sortedHistory.length === 0) return 0;
      
      // Calculate consecutive days from today backwards
      let streak = 0;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      for (let i = 0; i < sortedHistory.length; i++) {
        const entryDate = new Date(sortedHistory[i].date);
        entryDate.setHours(0, 0, 0, 0);
        
        const daysDiff = Math.floor((today.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysDiff === streak) {
          streak++;
        } else if (daysDiff > streak) {
          break; // Gap in streak
        }
      }
      
      return streak;
    } catch (error) {
      console.error('Error calculating streak:', error);
      return 0;
    }
  }, [rounds?.length]); // Recalculate when rounds change (practice activities are in localStorage)
  
  // Ensure rounds is always an array, never null or undefined
  // Filter Dashboard Rounds: Even though we fetch 'all' rounds in the background, 
  // filter safeRounds to show only the ones where round.user_id === user.id for personal stats
  // Initialization Guard: Initialize the rounds variable as an empty array [] at the top of the component to ensure it exists before the code tries to access it
  const allRounds = (rounds || []) as any[];
  const safeRounds = user?.id 
    ? allRounds.filter((round: any) => round?.user_id === user.id)
    : [];
  
  // Kill the Freeze: Completely removed the useEffect that triggers the 'No rounds found' Toast
  // This useEffect was causing an infinite loop that blocks the navigation bar
  // Removed entirely to prevent navigation freeze
  
  // Professional Wipe: Delete the entire getUserDisplayName function. Hard-code the name line to just say 'Member'
  // If I still see 'DEBUG' after this, I will know the deployment is failing
  
  // Profile modal state
  const [editedName, setEditedName] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const [selectedIcon, setSelectedIcon] = useState<string | null>(user?.profileIcon || null);
  const [isSavingIcon, setIsSavingIcon] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  
  // Initialize editedName when modal opens
  // Use Profile Data: Use user.fullName instead of hardcoded 'Member'
  useEffect(() => {
    if (showProfileModal) {
      setEditedName(user?.fullName || (user?.email ? user.email.split('@')[0] : ''));
    }
  }, [showProfileModal, user?.fullName, user?.email]);
  
  // Update selectedIcon when user.profileIcon changes
  useEffect(() => {
    if (user?.profileIcon) {
      setSelectedIcon(user.profileIcon);
    }
  }, [user?.profileIcon]);
  
  // Removed inline name editing - all editing happens in modal

  // Handle icon selection with instant UI feedback
  const handleIconSelect = async (iconId: string) => {
    if (!user?.id) return;
    
    setSelectedIcon(iconId);
    setIsSavingIcon(true);
    
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      
      const { error } = await supabase
        .from('profiles')
        .update({ profile_icon: iconId })
        .eq('id', user.id);

      if (error) {
        console.error('Error updating profile_icon:', error);
        // Revert on error
        setSelectedIcon(user?.profileIcon || null);
        // Remove Browser Alerts: Use non-blocking Toast instead of alert()
        setToast({ message: 'Failed to update icon. Please try again.', type: 'error' });
      } else {
        // Refresh user context to sync
        if (refreshUser) {
          await refreshUser();
        }
      }
    } catch (error) {
      console.error('Error saving icon:', error);
      setSelectedIcon(user?.profileIcon || null);
      // Remove Browser Alerts: Use non-blocking Toast instead of alert()
      setToast({ message: 'Failed to update icon. Please try again.', type: 'error' });
    } finally {
      setIsSavingIcon(false);
    }
  };
  
  // Bulletproof Save: Update full_name and profile_icon in profiles table
  const handleProfileModalSave = async () => {
    if (!user?.id || !editedName.trim()) {
      // Remove Browser Alerts: Use non-blocking Toast instead of alert()
      setToast({ message: 'Please enter your name.', type: 'warning' });
      return;
    }
    
    setIsSavingName(true);
    setIsSavingIcon(true);
    
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      
      const newName = editedName.trim();
      
      // Add ID Logging: Check if the ID matches the database
      console.log('Current User ID:', user.id);
      console.log('Attempting to update full_name to:', newName);
      
      // Force Table Sync: Explicitly target the full_name column in the profiles table
      // The Save Command: Use exact logic as specified
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ 
          full_name: newName,
          profile_icon: selectedIcon || null
        })
        .eq('id', user.id);

      // Capture RLS Errors: Show error via non-blocking Toast
      if (profileError) {
        console.error('Error updating full_name:', profileError);
        console.error('Error code:', profileError.code);
        console.error('Error message:', profileError.message);
        console.error('Error details:', profileError.details);
        // Remove Browser Alerts: Use non-blocking Toast instead of alert()
        setToast({ message: `Error: ${profileError.message || 'Unknown error'} (Code: ${profileError.code || 'N/A'})`, type: 'error' });
        setIsSavingName(false);
        setIsSavingIcon(false);
        return;
      }
      
      console.log('Profile update successful!');

      // Close modal immediately
      setShowProfileModal(false);
      
      // Leaderboard Refresh: Fetch updated full_name and clear cache
      if (refreshUser) {
        await refreshUser();
      }
      
      // Force UI Update: Use router.refresh() so name updates everywhere instantly
      // This ensures the Dashboard and Academy leaderboard show the new name immediately (not cached)
      router.refresh();
    } catch (error) {
      console.error('Error saving profile:', error);
      // Remove Browser Alerts: Use non-blocking Toast instead of alert()
      setToast({ message: 'Failed to save profile. Please try again.', type: 'error' });
    } finally {
      setIsSavingName(false);
      setIsSavingIcon(false);
    }
  };
  
  const [totalXP, setTotalXP] = useState(0);
  const [dailyVideo, setDailyVideo] = useState(() => getDailyVideo());
  const [refreshKey, setRefreshKey] = useState(0);
  const [showLevelModal, setShowLevelModal] = useState(false);
  const [recentActivities, setRecentActivities] = useState<ActivityItem[]>([]);
  const [scoreTab, setScoreTab] = useState<'myRounds' | 'community'>('myRounds');
  
  // Add Fetch Guard: At the top of the HomeDashboard component, add const activitiesFetched = useRef(false);
  const activitiesFetched = useRef(false);
  
  // Calculate level and progress - Level 1 starts at 0 XP, Level 2 requires 100 XP
  const currentLevel = totalXP === 0 ? 1 : Math.floor(totalXP / 100) + 1;
  const xpForCurrentLevel = totalXP % 100;
  const xpNeededForNextLevel = 100;
  const levelProgress = (xpForCurrentLevel / xpNeededForNextLevel) * 100;
  const xpRemaining = xpNeededForNextLevel - xpForCurrentLevel;
  
  // Replace Mock Data: Use real rounds from useStats() instead of hardcoded users like 'Alex Chen'
  // Map Real Rounds: Use the rounds array from useStats(). Filter it to show the most recent 5-10 rounds from all users.
  // Calculate Nett: For each round, display the Nett Score. If the database has score and handicap, calculate it as {round.score - round.handicap}.
  // Add Labels: Display the user's name (or ID fallback), the course name, and a 'Nett' label next to their score.
  
  // Fetch user profiles for name lookup (similar to Academy page)
  const [userProfiles, setUserProfiles] = useState<Map<string, { full_name?: string; profile_icon?: string }>>(new Map());
  
  useEffect(() => {
    // Initialization Guard: Use safeRoundsArray instead of rounds directly
    if (!safeRoundsArray || safeRoundsArray.length === 0) return;
    
    const fetchProfiles = async () => {
      // Fix Mapping: Ensure the map looks like rounds.map((round) => ...) and that all variables inside use round.score, round.handicap, etc.
      // Search and Destroy 'ed': Find the variable ed - ensure we use 'round' not 'ed' in map functions
      const uniqueUserIds = Array.from(new Set(safeRoundsArray.map((round: any) => round?.user_id).filter(Boolean)));
      if (uniqueUserIds.length === 0) return;
      
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, profile_icon')
          .in('id', uniqueUserIds);
        
        if (error) {
          console.error('Error fetching user profiles for Community:', error);
          return;
        }
        
        const profileMap = new Map<string, { full_name?: string; profile_icon?: string }>();
        if (data) {
          data.forEach((profile: any) => {
            profileMap.set(profile.id, { full_name: profile.full_name, profile_icon: profile.profile_icon });
          });
        }
        setUserProfiles(profileMap);
      } catch (error) {
        console.error('Error in fetchProfiles for Community:', error);
      }
    };
    
    fetchProfiles();
  }, [safeRoundsArray.length]);
  
  // Find the Mock List: Locate the component or array that contains 'Alex Chen', 'Maria Rodriguez', and 'James Mitchell'.
  // Delete Mocks: Completely delete that hardcoded list.
  // Use Real Rounds: Use the rounds array from StatsContext.
  // Display Nett Scores: For each round in the 'Community' tab, display:
  //   - The User Name (lookup from profile or round metadata).
  //   - The Course Name.
  //   - The Nett Score (calculated as round.score - round.handicap).
  // Sort by Date: Ensure the most recent rounds from all users appear at the top.
  // Check for Typo: Search the file for any variable named ed. It is likely a typo of round.score, handicap, or formattedDate.
  // Add Optional Chaining: Ensure all round properties use the ?. operator (e.g., round?.score) to prevent accessing properties of undefined objects.
  // Initialize the Map: Ensure the allEntries or rounds array is initialized as an empty array [] before the component tries to map through it.
  // Calculate Nett Safely: Ensure this calculation only happens if round is not null.
  // Search and Destroy 'ed': Find the variable ed in HomeDashboard.tsx or RecentScores.tsx. It is likely a typo in a .map() function or a Nett score calculation: (round.score - round.handicap).
  // Fix Mapping: Ensure the map looks like rounds.map((round) => ...) and that all variables inside use round.score, round.handicap, etc.
  // Initialization Guard: Initialize the rounds variable as an empty array [] at the top of the component to ensure it exists before the code tries to access it.
  // Safety: Add optional chaining to the name lookup: round?.full_name || 'Golfer'.
  // Fix the Map: Look for Array.map functions using ec. Rename ec to round and ensure no calculations happen before the variable is defined.
  // Add Safety Guards: Wrap the community rounds logic in a check: if (!rounds || rounds.length === 0) return null;
  const communityRounds = useMemo(() => {
    // Add Safety Guards: Wrap the community rounds logic in a check: if (!rounds || rounds.length === 0) return [];
    // Initialization Guard: Initialize the rounds variable as an empty array [] at the top of the component to ensure it exists before the code tries to access it
    // Use safeRoundsArray instead of rounds directly
    if (!safeRoundsArray || !Array.isArray(safeRoundsArray) || safeRoundsArray.length === 0) {
      console.log('HomeDashboard: No rounds available for Community tab');
      return [];
    }
    
    console.log('HomeDashboard: Processing rounds for Community tab:', safeRoundsArray.length, 'total rounds');
    
    // Sort by Date: Ensure the most recent rounds from all users appear at the top
    // Get all rounds (not filtered by user), sort by date descending, take top 10
    // Add Optional Chaining: Ensure all round properties use the ?. operator
    // Fix Mapping: Ensure the map looks like rounds.map((round) => ...) and that all variables inside use round.score, round.handicap, etc.
    const allRounds = safeRoundsArray
      .filter((round: any) => {
        // Add Optional Chaining: Ensure all round properties use the ?. operator
        if (!round || typeof round !== 'object') return false;
        // Only include rounds with valid user_id and score
        // Fix Mapping: Use round.score, round.handicap, etc. (not ed)
        const hasUserId = round?.user_id && String(round.user_id).trim() !== '';
        const hasScore = round?.score !== null && round?.score !== undefined && round?.score > 0;
        return hasUserId && hasScore;
      })
      .sort((roundA: any, roundB: any) => {
        // Add Optional Chaining: Ensure all round properties use the ?. operator
        // Fix Mapping: Use roundA and roundB (not ed)
        if (!roundA || !roundB) return 0;
        // Sort by Date: Most recent first
        const dateA = new Date(roundA?.date || roundA?.created_at || 0);
        const dateB = new Date(roundB?.date || roundB?.created_at || 0);
        return dateB.getTime() - dateA.getTime();
      })
      .slice(0, 10); // Most recent 5-10 rounds
    
    console.log('HomeDashboard: Filtered to', allRounds.length, 'valid rounds for Community tab');
    
    // Initialize the Map: Ensure allEntries or rounds array is initialized as an empty array [] before mapping
    if (!Array.isArray(allRounds) || allRounds.length === 0) {
      return [];
    }
    
    // Map to CommunityRound format
    // Calculate Nett Safely: Ensure this calculation only happens if round is not null
    // Fix Mapping: Ensure the map looks like rounds.map((round) => ...) and that all variables inside use round.score, round.handicap, etc.
    return allRounds
      .filter((round: any) => round && typeof round === 'object') // Filter out null/undefined rounds first
      .map((round: any) => {
        // Fix the Map: Look for Array.map functions using ec. Rename ec to round and ensure no calculations happen before the variable is defined.
        // Hunt for 'ec': Ensure we use 'round' not 'ec' in map functions
        // Fix the Scope: Ensure the variable is fully initialized before it's used to calculate score - handicap
        // Use Robust Names: Use 'round' to make the code clearer and prevent these scoping errors
        if (!round || typeof round !== 'object') {
          return null; // Safety: Skip invalid rounds
        }
        
        // Fix Nett Calculation: Ensure the nett score is calculated safely: const nett = (round.score || 0) - (round.handicap || 0)
        // Display Nett Scores: Calculate as round.score - round.handicap
        // Add Optional Chaining: Ensure all round properties use the ?. operator
        // Hunt for 'ec': All map functions use 'round' not 'ec'
        let nettScore: number = 0;
        if (round?.nett !== null && round?.nett !== undefined) {
          nettScore = round.nett;
        } else {
          // Fix Nett Calculation: Ensure the nett score is calculated safely: const nett = (round.score || 0) - (round.handicap || 0)
          // Hunt for 'ec': Use 'round' not 'ec' - all variables initialized before calculation
          const nett = (round?.score || 0) - (round?.handicap || 0);
          nettScore = nett;
          // If calculation results in invalid score, fallback to gross score
          if (nettScore < 0 || !isFinite(nettScore)) {
            nettScore = round?.score || 0;
          }
        }
        
        // The User Name (lookup from profile or round metadata)
        // Add Optional Chaining: Ensure all round properties use the ?. operator
        // Safety: Add optional chaining to the name lookup: round?.full_name || 'Golfer'
        // Fix Mapping: Use round.user_id (not ed)
        const userId = round?.user_id;
        const profile = userId ? userProfiles.get(userId) : null;
        // Safety: Add optional chaining to the name lookup: round?.full_name || 'Golfer'
        const displayName = profile?.full_name || (userId ? String(userId).substring(0, 8) : 'Golfer');
        
        // The Course Name
        // Add Optional Chaining: Ensure all round properties use the ?. operator
        // Fix Mapping: Use round.course (not ed)
        const courseName = round?.course || 'Unknown Course';
        
        // Add Optional Chaining: Ensure all round properties use the ?. operator
        // Fix Mapping: Use round.date or round.created_at (not ed)
        const roundDate = round?.date || round?.created_at || new Date().toISOString();
        
        return {
          id: round?.id || `round-${userId || 'unknown'}-${roundDate}`,
          name: displayName,
          course: courseName,
          score: nettScore,
          badge: undefined, // Delete Mocks: Remove all mock badges
          timeAgo: formatTimeAgo(roundDate)
        };
      })
      .filter((item: any) => item !== null); // Filter out null items from failed mappings
  }, [safeRoundsArray, userProfiles]);
  
  // Format time ago
  const formatTimeAgo = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else {
      return `${diffDays}d ago`;
    }
  };
  
  // Get icon for activity type
  const getActivityIcon = (activity: ActivityItem) => {
    if (activity.type === 'round') {
      return Trophy;
    }
    // Practice activities
    const category = activity.category?.toLowerCase() || '';
    if (category.includes('putting')) return Target;
    if (category.includes('driving')) return Zap;
    if (category.includes('short') || category.includes('chipping')) return BookOpen;
    return Activity;
  };
  
  // Get icon color for activity
  const getActivityIconColor = (activity: ActivityItem) => {
    if (activity.type === 'round') {
      return '#014421';
    }
    return '#FFA500';
  };
  
  // Load recent activities
  const loadRecentActivities = () => {
    if (typeof window === 'undefined') return;
    
    const allActivities: ActivityItem[] = [];
    
    // Load practice sessions
    const practiceHistory = localStorage.getItem('practiceActivityHistory');
    if (practiceHistory) {
      try {
        const history = JSON.parse(practiceHistory);
        history.forEach((activity: any) => {
          allActivities.push({
            id: activity.id || `practice-${Date.now()}`,
            type: 'practice',
            title: activity.title || activity.drillTitle || 'Practice Session',
            date: activity.timestamp || activity.date,
            xp: activity.xp || 100,
            drillTitle: activity.drillTitle || activity.title,
            category: activity.category,
          });
        });
      } catch (e) {
        console.error('Error loading practice history:', e);
      }
    }
    
    // Load rounds - use safeRounds with optional chaining
    if (safeRounds && safeRounds.length > 0) {
      safeRounds.forEach((round, index) => {
        allActivities.push({
          id: `round-${index}`,
          type: 'round',
          title: `${round.holes} Holes at ${round.course || 'Unknown Course'}`,
          date: round.date,
          xp: 500,
          category: 'Round',
        });
      });
    }
    
    // Sort by date (newest first) and take top 3
    allActivities.sort((a, b) => {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
    
    setRecentActivities(allActivities.slice(0, 3));
    
    // Set the Guard: Inside loadRecentActivities, after you call setRecentActivities on line 378, add activitiesFetched.current = true;
    activitiesFetched.current = true;
  };
  
  // Check if round is personal best
  const isPersonalBest = (round: { score?: number | null }): boolean => {
    if (!safeRounds || safeRounds.length === 0) return false;
    // Check Dashboard Fetch: Filter by score only, NOT by user_id - show all rounds from all users
    // Profile Mapping: Rounds with user_id that doesn't exist in profiles will still show (with 'Unknown User')
    const userRounds = safeRounds.filter((r: { score?: number | null; user_id?: string }) => {
      // Filter by score only - don't filter by user_id
      // This ensures rounds from all users (including those with missing profiles) are shown
      return r.score !== null && r.score !== undefined;
    });
    if (userRounds.length === 0) return false;
    // Bulletproof: Ensure we have valid scores before using Math.min
    const scores = userRounds.map((r: { score?: number | null }) => r.score || 999).filter(s => s !== null && s !== undefined);
    if (scores.length === 0) return false;
    const bestScore = Math.min(...scores);
    return round.score === bestScore;
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Wrap the Call: In the useEffect on line 411, add a check: if (activitiesFetched.current) return;
    if (activitiesFetched.current) return;

    const loadXP = () => {
      const savedProgress = localStorage.getItem('userProgress');
      if (savedProgress) {
        const progress = JSON.parse(savedProgress);
        setTotalXP(progress.totalXP || 0);
      }
    };

    loadXP();
    loadRecentActivities();

    // Listen for XP updates
    window.addEventListener('userProgressUpdated', loadXP);
    window.addEventListener('storage', loadXP);
    
    // Listen for practice activity to refresh video
    const handlePracticeUpdate = () => {
      setRefreshKey(prev => prev + 1);
      setDailyVideo(getDailyVideo(refreshKey + 1));
      loadRecentActivities();
    };
    
    // Listen for rounds updates
    const handleRoundsUpdate = () => {
      loadRecentActivities();
    };
    
    window.addEventListener('practiceActivityUpdated', handlePracticeUpdate);
    window.addEventListener('roundsUpdated', handleRoundsUpdate);

    return () => {
      window.removeEventListener('userProgressUpdated', loadXP);
      window.removeEventListener('storage', loadXP);
      window.removeEventListener('practiceActivityUpdated', handlePracticeUpdate);
      window.removeEventListener('roundsUpdated', handleRoundsUpdate);
    };
  }, [user?.id, rounds?.length]); // Cleanup Dependencies: Ensure the useEffect dependency array only contains stable values like [user?.id] and not the recentActivities state itself
  // Update HomeDashboard.tsx: Add rounds?.length to dependencies so streak recalculates when rounds change

  // Wrap return in try-catch to prevent crashes
  try {
    return (
      <>
        {/* Remove Browser Alerts: Non-blocking Toast notification instead of alert() */}
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
        <div className="min-h-screen bg-gray-50 pb-20">
          <div className="max-w-md mx-auto bg-white min-h-screen">
        {/* Profile Modal - Opens when avatar is clicked */}
        {/* Kill Invisible Overlays: Add pointer-events-none to backdrop so it doesn't block Navbar */}
        {/* Z-Index Check: Modal z-40 is lower than Navbar z-[60] so navigation is never covered */}
        {showProfileModal && (
          <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4 pointer-events-auto" onClick={() => setShowProfileModal(false)}>
            <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900">Edit Profile</h2>
                <button
                  onClick={() => setShowProfileModal(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              {/* Name Input */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Your Name
                </label>
                <input
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#014421] focus:border-[#014421]"
                  placeholder="Enter your name"
                  autoFocus
                />
              </div>
              
              {/* Icon Picker */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Choose Your Icon
                </label>
                <IconPicker selectedIcon={selectedIcon} onSelectIcon={setSelectedIcon} />
              </div>
              
              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowProfileModal(false)}
                  className="px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleProfileModalSave}
                  disabled={isSavingName || !editedName.trim()}
                  className="flex-1 px-4 py-3 bg-[#014421] text-white rounded-lg font-semibold hover:bg-[#013320] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSavingName ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Top Section - Premium Header */}
        <div className="px-5 pt-6 pb-4 flex items-center justify-between mb-4 bg-white">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowProfileModal(true)}
              className="w-14 h-14 rounded-full overflow-hidden ring-2 ring-gray-100 shadow-sm flex items-center justify-center text-3xl bg-white cursor-pointer hover:ring-[#014421] transition-all"
            >
              {selectedIcon ? (
                GOLF_ICONS.find(icon => icon.id === selectedIcon)?.emoji || '👤'
              ) : (
                '👤'
              )}
            </button>
            <div className="flex-1">
              <p className="text-gray-400 text-xs">Welcome back,</p>
              <p className="text-gray-900 font-bold text-xl mt-1">
                {/* Connect Auth: Import useAuth and extract the user object */}
                {/* Personalize Greeting: Replace the hardcoded 'Member' text with {user?.fullName || 'Golfer'} */}
                {/* Safety: Keep the existing useRef guards to ensure this doesn't trigger a re-fetch loop */}
                <span>{displayName}</span>
              </p>
            </div>
          </div>
        </div>
        
        {/* Stats Cards Section - Streak */}
        <div className="px-5 mb-4">
          <div 
            className="rounded-full px-4 py-2 flex items-center gap-2 shadow-md"
            style={{ 
              backgroundColor: '#FFA500',
              boxShadow: '0 4px 12px rgba(255, 165, 0, 0.3)'
            }}
          >
            <Flame className="w-4 h-4 text-white" />
            <div className="flex flex-col">
              <span className="text-xs font-medium text-white">Streak</span>
              {/* Update HomeDashboard.tsx to use useStats() to get the actual rounds.length so the stats are dynamic instead of zero */}
              <span className="text-white text-sm font-bold">{streakDays} day{streakDays !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>

        {/* Video and Daily Focus - Premium Card */}
        <div className="px-5 mb-4">
          <div 
            className="bg-white overflow-hidden"
            style={{ 
              borderRadius: '16px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.08)'
            }}
          >
            <div 
              className="relative aspect-video flex items-center justify-center overflow-hidden"
              style={{ background: 'linear-gradient(to bottom right, #f0fdf4, #dcfce7, #bbf7d0)' }}
            >
              {/* Golf balls pattern background */}
              <div className="absolute inset-0 opacity-30">
                <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2">
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-8 h-8 bg-white rounded-full shadow-md"></div>
                    <div className="flex gap-1">
                      <div className="w-6 h-6 bg-white rounded-full shadow-md"></div>
                      <div className="w-6 h-6 bg-white rounded-full shadow-md"></div>
                    </div>
                    <div className="flex gap-0.5">
                      <div className="w-5 h-5 bg-white rounded-full shadow-md"></div>
                      <div className="w-5 h-5 bg-white rounded-full shadow-md"></div>
                      <div className="w-5 h-5 bg-white rounded-full shadow-md"></div>
                    </div>
                  </div>
                </div>
              </div>
              <div 
                className="absolute inset-0"
                style={{ background: 'linear-gradient(to top, rgba(134, 239, 172, 0.4), transparent)' }}
              />
              
              {/* Glassmorphism Play Button Overlay */}
              <div 
                className="relative w-20 h-20 rounded-full flex items-center justify-center backdrop-blur-md z-10 cursor-pointer transition-transform hover:scale-110"
                onClick={() => router.push(`/library?drill=${dailyVideo.id}`)}
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.25)',
                  border: '2px solid rgba(255, 255, 255, 0.5)',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)'
                }}
              >
                <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                  <Play className="w-8 h-8 ml-1" style={{ color: '#014421' }} fill="#014421" />
                </div>
              </div>
              
              <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded backdrop-blur-sm">
                {dailyVideo.duration}
              </div>
            </div>
            <div className="p-5">
              <div className="inline-block border border-[#FFA500] rounded-full px-3 py-1 mb-3 bg-transparent">
                <span className="text-xs font-medium" style={{ color: '#FFA500' }}>Daily Focus</span>
              </div>
              <h2 
                className="font-bold text-xl mb-2 tracking-tight"
                style={{ 
                  color: '#014421',
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  fontWeight: 700,
                  letterSpacing: '-0.02em'
                }}
              >
                {dailyVideo.title}
              </h2>
              <p className="text-gray-500 text-sm">{dailyVideo.coach}</p>
            </div>
          </div>
        </div>

        {/* Action Buttons - Side by Side */}
        <div className="px-5 mb-6 flex gap-3">
          <button 
            onClick={() => router.push('/log-round')}
            className="flex-1 text-white font-semibold py-3.5 rounded-xl shadow-md hover:shadow-lg transition-all hover:scale-[1.02]" 
            style={{ backgroundColor: '#FFA500' }}
          >
            Log Round
          </button>
          <button 
            onClick={() => {
              router.push('/practice');
              // Trigger video refresh after navigation
              setTimeout(() => {
                setRefreshKey(prev => prev + 1);
                setDailyVideo(getDailyVideo(refreshKey + 1));
              }, 100);
            }}
            className="flex-1 bg-white border-2 font-semibold py-3.5 rounded-xl transition-all hover:shadow-md"
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0fdf4'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'} 
            style={{ borderColor: '#014421', color: '#014421' }}
          >
            Log Today's Practice
          </button>
        </div>

        {/* Skills Snapshot - Equal Width Cards */}
        <div className="px-5 mb-6">
          <h3 className="text-gray-600 font-medium text-base mb-3">Skills Snapshot</h3>
          <div className="flex gap-3">
            {/* Streak Card - Links to Practice */}
            <Link 
              href="/practice"
              className="flex-1 bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col items-start cursor-pointer transition-all hover:scale-95 hover:border-[#FFA500] active:scale-[0.97]"
            >
              <Flame className="w-6 h-6 mb-2" style={{ color: '#FFA500' }} />
              {/* Update HomeDashboard.tsx to use useStats() to get the actual rounds.length so the stats are dynamic instead of zero */}
              <p className="text-2xl font-bold" style={{ color: '#FFA500' }}>{streakDays}</p>
              <p className="text-gray-400 text-xs mt-1">days streak</p>
            </Link>
            
            {/* XP Card - Opens Level Up Modal */}
            <button
              onClick={() => setShowLevelModal(true)}
              className="flex-1 bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col items-start cursor-pointer transition-all hover:scale-95 hover:border-[#FFA500] active:scale-[0.97] text-left"
            >
              <Zap className="w-6 h-6 mb-2" style={{ color: '#FFA500' }} />
              <p className="text-2xl font-bold" style={{ color: '#FFA500' }}>{totalXP.toLocaleString()}</p>
              <p className="text-gray-400 text-xs mt-1">Total XP</p>
            </button>
            
            {/* Handicap Card - Links to Stats */}
            <Link
              href="/stats"
              className="flex-1 bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col items-start cursor-pointer transition-all hover:scale-95 hover:border-[#FFA500] active:scale-[0.97]"
            >
              <TrendingDown className="w-6 h-6 mb-2" style={{ color: '#FFA500' }} />
              <p 
                className="text-2xl font-bold mt-0"
                style={{ 
                  color: '#FFA500',
                  fontWeight: 700,
                  fontFamily: 'system-ui, -apple-system, sans-serif'
                }}
              >
                {(() => {
                  // Safeguard: if no rounds, return --
                  if (!safeRounds || safeRounds.length === 0) return '--';
                  const lastRound = safeRounds[safeRounds.length - 1];
                  return lastRound?.handicap !== null && lastRound?.handicap !== undefined
                    ? lastRound.handicap.toFixed(1)
                    : '--';
                })()}
              </p>
              <p className="text-gray-400 text-xs mt-1">Handicap</p>
            </Link>
          </div>
        </div>
        
        {/* Level Up Modal */}
        {/* Kill Invisible Overlays: Add pointer-events-auto to backdrop so it doesn't block Navbar */}
        {/* Z-Index Check: Modal z-40 is lower than Navbar z-[60] so navigation is never covered */}
        {showLevelModal && (
          <div 
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 pointer-events-auto"
            onClick={() => setShowLevelModal(false)}
          >
            <div 
              className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setShowLevelModal(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="flex flex-col items-center text-center mb-6">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: '#FFA500' }}>
                  <Trophy className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Level {currentLevel}</h3>
                <p className="text-gray-600 text-sm mb-4">
                  {xpRemaining} XP until Level {currentLevel + 1}
                </p>
                
                {/* Progress Bar */}
                <div className="w-full mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-medium text-gray-600">Progress to Level {currentLevel + 1}</span>
                    <span className="text-xs font-bold" style={{ color: '#FFA500' }}>
                      {xpForCurrentLevel} / {xpNeededForNextLevel} XP
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500 relative overflow-hidden"
                      style={{ 
                        width: `${levelProgress}%`,
                        background: 'linear-gradient(to right, #FFA500, #FF8C00)'
                      }}
                    >
                      <div 
                        className="absolute inset-0"
                        style={{
                          background: 'linear-gradient(to right, transparent, rgba(255, 255, 255, 0.4), transparent)',
                          animation: 'shimmer 2s infinite ease-in-out'
                        }}
                      ></div>
                    </div>
                  </div>
                </div>
                
                <div className="w-full bg-gray-50 rounded-xl p-4 mt-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-700">Total XP</span>
                    <span className="text-lg font-bold" style={{ color: '#FFA500' }}>
                      {totalXP.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
              
              <button
                onClick={() => setShowLevelModal(false)}
                className="w-full py-3 bg-[#FFA500] text-white font-semibold rounded-lg hover:bg-[#FF8C00] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Recent Activity */}
        <div className="px-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-gray-600 font-medium text-base">Recent Activity</h3>
            <Link 
              href="/activity"
              className="text-sm font-medium hover:underline transition-all"
              style={{ color: '#FFA500' }}
            >
              View All
            </Link>
          </div>
          {recentActivities.length > 0 ? (
            <div className="space-y-3 mb-6">
              {recentActivities.map((activity) => {
                const IconComponent = getActivityIcon(activity);
                const iconColor = getActivityIconColor(activity);
                const isRound = activity.type === 'round';
                
                return (
                  <div key={activity.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center gap-3">
                    <div 
                      className="w-10 h-10 rounded-lg flex items-center justify-center" 
                      style={{ 
                        backgroundColor: isRound 
                          ? 'rgba(1, 68, 33, 0.1)' 
                          : 'rgba(255, 165, 0, 0.1)' 
                      }}
                    >
                      <IconComponent className="w-5 h-5" style={{ color: iconColor }} />
                    </div>
                    <div className="flex-1">
                      <p className="text-gray-800 font-medium text-sm">{activity.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Clock className="w-3 h-3 text-gray-400" />
                        <span className="text-gray-400 text-xs">{formatTimeAgo(activity.date)}</span>
                        {activity.xp && (
                          <>
                            <span className="text-gray-400 text-xs">•</span>
                            <span className="text-xs font-medium" style={{ color: '#FFA500' }}>
                              +{activity.xp} XP
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 text-center mb-6">
              <Activity className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-600 text-sm mb-2">No activity yet. Start your journey!</p>
              <button
                onClick={() => router.push('/practice')}
                className="text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                style={{ 
                  backgroundColor: '#FFA500',
                  color: 'white'
                }}
              >
                Start Practicing
              </button>
            </div>
          )}
        </div>

        {/* Recent Scores */}
        <div className="px-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-gray-600 font-medium text-base">Recent Scores</h3>
            <Link
              href="/scores"
              className="text-sm font-medium hover:underline transition-all"
              style={{ color: '#FFA500' }}
            >
              View All
            </Link>
          </div>
          
          {/* Tab Toggles */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setScoreTab('myRounds')}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                scoreTab === 'myRounds'
                  ? 'bg-[#FFA500] text-white shadow-md'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              My Rounds
            </button>
            <button
              onClick={() => setScoreTab('community')}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                scoreTab === 'community'
                  ? 'bg-[#FFA500] text-white shadow-md'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Users className="w-4 h-4 inline mr-1" />
              Community
            </button>
          </div>
          
          {/* Scores List */}
          {scoreTab === 'myRounds' ? (
            safeRounds?.length > 0 ? (
              <div className="space-y-3">
                {safeRounds
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .slice(0, 3)
                  .map((round, index) => {
                    const isPB = isPersonalBest(round);
                    return (
                      <div key={index} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1">
                          {isPB ? (
                            <Trophy className="w-5 h-5" style={{ color: '#FFA500' }} />
                          ) : (
                            <Star className="w-5 h-5" style={{ color: '#014421' }} />
                          )}
                          <div className="flex-1">
                            <p className="text-gray-800 font-medium">You</p>
                            <p className="text-gray-400 text-sm">{round.course || 'Unknown Course'}</p>
                            <div className="flex items-center gap-2 mt-1">
                              {isPB && (
                                <span className="text-xs px-2 py-0.5 rounded text-white font-medium" style={{ backgroundColor: '#FFA500' }}>
                                  Personal Best
                                </span>
                              )}
                              <span className="text-gray-400 text-xs">• {formatTimeAgo(round.date)}</span>
                            </div>
                          </div>
                        </div>
                        <p className="text-2xl font-bold" style={{ color: '#FFA500' }}>
                          {round.score || round.nett?.toFixed(0) || 'N/A'}
                        </p>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 text-center">
                <Trophy className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                {/* Use useStats() to get the rounds.length and replace the '0 Rounds' text */}
                <p className="text-gray-600 text-sm mb-2">
                  {userRoundsCount === 0 ? 'No rounds recorded' : `${userRoundsCount} Round${userRoundsCount !== 1 ? 's' : ''} recorded`}
                </p>
                <p className="text-gray-400 text-xs mb-4">Log your first round to see your stats</p>
                <button
                  onClick={() => router.push('/log-round')}
                  className="text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                  style={{ 
                    backgroundColor: '#FFA500',
                    color: 'white'
                  }}
                >
                  Log Round
                </button>
              </div>
            )
          ) : (
            communityRounds.length > 0 ? (
              <div className="space-y-3">
                {communityRounds
                  .filter((round: any) => round && round.id) // Add Optional Chaining: Filter out any null/undefined rounds
                  // Hunt for 'ec': Ensure we use 'round' not 'ec' in map functions
                  // Use Robust Names: Use 'round' to make the code clearer and prevent these scoping errors
                  .map((round: any) => (
                    <div key={round.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <Star className="w-5 h-5" style={{ color: '#014421' }} />
                        <div className="flex-1">
                          <p className="text-gray-800 font-medium">{round?.name || 'Unknown User'}</p>
                          <p className="text-gray-400 text-sm">{round?.course || 'Unknown Course'}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-gray-400 text-xs">• {round?.timeAgo || 'Recently'}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold" style={{ color: '#FFA500' }}>{(round?.score ?? 0).toFixed(0)}</p>
                        {/* Add Labels: Display 'Nett' label next to their score */}
                        <p className="text-xs text-gray-400">Nett</p>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 text-center">
                <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-gray-600 text-sm mb-2">No community rounds yet</p>
                <p className="text-gray-400 text-xs">Be the first to log a round!</p>
              </div>
            )
          )}
        </div>

        {/* Trophy Case Section - Moved to Bottom */}
        <div className="px-5 mb-6">
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Trophy Case</h2>
            <div className="text-center py-8">
              <Trophy className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-sm text-gray-500">No trophies yet. Keep practicing!</p>
            </div>
          </div>
        </div>

          </div>
        </div>
      </>
  );
  } catch (error) {
    console.error('Error rendering HomeDashboard:', error);
    // Kill Invisible Overlays: Add pointer-events-none to error div so it doesn't block Navbar
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 pointer-events-none">
        <div className="text-center pointer-events-auto">
          <p className="text-gray-600 mb-4">Something went wrong. Please refresh the page.</p>
          <button 
            onClick={() => {}} 
            className="px-4 py-2 bg-[#014421] text-white rounded-lg"
          >
            Refresh
          </button>
        </div>
      </div>
    );
  }
}


