// Production Sync: Force Re-build 01-18-2026
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
  Radio,
  Calendar,
  TrendingUp,
  Star,
  Trophy,
  Target,
  Activity,
  Clock,
  X,
  BookOpen,
  Apple,
  Bot,
  Users,
  User,
  Pencil,
  Check,
  Flag,
} from "lucide-react";
import { DeleteRoundButton } from "@/components/DeleteRoundButton";
import { AddToHomeScreenGuide } from "@/components/AddToHomeScreenGuide";
import { LiveRoundInProgressBanner } from "@/components/LiveRoundInProgressBanner";
import {
  LIVE_ENTRY_ENABLED,
  LiveEntryNotReadyModal,
} from "@/components/LiveEntryNotReadyModal";
import { loadLiveRoundDraft, type LiveRoundDraft } from "@/lib/liveRoundDraft";
import IconPicker, { GOLF_ICONS } from "@/components/IconPicker";
import Toast from "@/components/Toast";
import { BunnyVideoPlayer } from "@/components/BunnyVideoPlayer";
import { DEFAULT_BUNNY_VIDEO_ID, APP_VIDEO_COACH_NAME, formatBunnyDuration } from "@/lib/bunnyStream";
import { useBunnyVideoMetadata } from "@/hooks/useBunnyVideoMetadata";
import { HallOfFameLeaderboard } from "@/components/academy/HallOfFameLeaderboard";

const FEATURED_LIBRARY_DRILL_ID = "swing-hell-drill";

interface ActivityItem {
  id: string;
  type: 'drill' | 'video' | 'achievement' | 'round' | 'practice';
  title: string;
  date: string;
  xp?: number;
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
  
  // Re-initialize simply: Define const { user } = useAuth();
  // Verify User Object: Make sure the user object from useAuth() is correctly identifying me so it can find my rounds in the database
  const { user, refreshUser, profileLoading } = useAuth();
  
  // Re-initialize simply: Define const { rounds = [] } = useStats();
  const {
    rounds = [],
    communityRounds = [],
    communityRoundsHydrated = false,
  } = useStats();
  
  // Verify User Object: Log user object to verify it's correctly identifying the user
  useEffect(() => {
    if (user?.id) {
      console.log('HomeDashboard: User object verified:', { id: user.id, email: user.email, fullName: user.fullName });
    } else {
      console.warn('HomeDashboard: No user.id available - cannot filter rounds');
    }
  }, [user?.id]);
  
  // Wipe the variable 'ec': Completely remove any mention of ec or ed from this file
  // All variables now use 'item' or 'round' - never 'ec' or 'ed'
  
  // Add Fetch Guard: Use useRef guards similar to Academy page to prevent loops
  const dataFetched = useRef(false);
  
  // Toast state for non-blocking notifications
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);
  
  // Map the User Object: Update to read name from user.full_name (or user.fullName if API transforms it)
  // Note: AuthContext maps full_name from database to fullName property, but check both for compatibility
  // Safe Fallback: If a name isn't found, default to showing 'Golfer' instead of 'Member'
  const displayName = user?.fullName || (user as any)?.full_name || 'Golfer';
  
  // Use useMemo to safely calculate rounds count from useStats()
  // Update HomeDashboard.tsx to use useStats() to get the actual rounds.length so the stats are dynamic instead of zero
  // Make sure these are wrapped in the same useRef guards we used in the Academy to prevent any new loops
  const userRoundsCount = useMemo(() => {
    if (!rounds?.length || !user?.id) {
      console.log('HomeDashboard: userRoundsCount - no rounds or user.id');
      return 0;
    }
    const userRounds = rounds.filter((round: any) => round?.user_id === user.id);
    console.log('HomeDashboard: userRoundsCount calculated:', userRounds.length, 'rounds for user', user.id);
    return userRounds.length;
  }, [rounds, user?.id]);
  
  // Switch to camelCase: Create profile object with currentStreak (camelCase) to match the user object property name
  // The console logs show currentStreak is available in the user object (camelCase)
  // Remove Local State: No local state overrides - use the value directly from user.currentStreak
  // Map Property: Point the display to profile?.totalXP or user?.totalXP (using synchronized variable from AuthContext)
  const profile = useMemo(() => {
    // Update the Variable: Create profile object with currentStreak (camelCase) property to match user object
    // Data Source: Use user?.totalXP which is now properly synchronized from database xp column in AuthContext
    return {
      currentStreak: user?.currentStreak, // Use camelCase to match the user object property name
      totalXP: user?.totalXP, // Use synchronized totalXP from user object (mapped from database xp column)
      currentLevel: user?.currentLevel // Use synchronized currentLevel from user object
    };
  }, [user?.currentStreak, user?.totalXP, user?.currentLevel]);
  
  /** Personal rounds from StatsContext (already scoped to the signed-in user). */
  const allRounds = (rounds || []) as any[];
  const allCommunityRounds = (communityRounds || []) as any[];
  
  // Keep safeRounds for backward compatibility with other parts of the component
  const safeRounds = useMemo(() => {
    if (!user?.id) return [];
    return allRounds.filter((round: any) => round?.user_id === user.id);
  }, [allRounds, user?.id]);

  // Kill the Freeze: Completely removed the useEffect that triggers the 'No rounds found' Toast
  // This useEffect was causing an infinite loop that blocks the navigation bar
  // Removed entirely to prevent navigation freeze
  
  // Professional Wipe: Delete the entire getUserDisplayName function. Hard-code the name line to just say 'Member'
  // If I still see 'DEBUG' after this, I will know the deployment is failing
  
  // Profile modal state
  const [editedName, setEditedName] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const [selectedIcon, setSelectedIcon] = useState<string | null>(user?.preferredIconId || null);
  const [isSavingIcon, setIsSavingIcon] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  
  // Snapshot Data Fetching State
  const [snapshotData, setSnapshotData] = useState<{
    total_xp: number | null;
    current_level: number | null;
    preferred_icon_id: string | null;
    starting_handicap: number | null;
    handicap: number | null;
  } | null>(null);

  // Fetch profile stats for XP, level, and icon
  useEffect(() => {
    let mounted = true;
    const fetchSnapshot = async () => {
      if (!user?.id) return;
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { data, error } = await supabase
          .from("profiles")
          .select("total_xp, current_level, preferred_icon_id, starting_handicap, handicap")
          .eq("id", user.id)
          .single();
          
        if (error) {
          console.error("Error fetching snapshot data:", error);
        } else if (mounted && data) {
          setSnapshotData(data);
          if (data.preferred_icon_id) {
            setSelectedIcon(data.preferred_icon_id);
          }
        }
      } catch (err) {
        console.error("Failed to fetch snapshot:", err);
      }
    };
    fetchSnapshot();
    return () => { mounted = false; };
  }, [user?.id]);
  
  // Removed unused streak RPC fetch since AuthContext manages streak
  
  // Initialize editedName when modal opens
  // Use Profile Data: Use user.fullName instead of hardcoded 'Member'
  useEffect(() => {
    if (showProfileModal) {
      setEditedName(user?.fullName || (user?.email ? user.email.split('@')[0] : ''));
    }
  }, [showProfileModal, user?.fullName, user?.email]);
  
  // Update selectedIcon when snapshot preferred_icon_id changes
  useEffect(() => {
    if (snapshotData?.preferred_icon_id) {
      setSelectedIcon(snapshotData.preferred_icon_id);
    } else if (user?.preferredIconId) {
      setSelectedIcon(user.preferredIconId);
    } else {
      setSelectedIcon(null); // Fallback to null
    }
  }, [snapshotData?.preferred_icon_id, user?.preferredIconId]);
  
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
        .update({ preferred_icon_id: iconId })
        .eq('id', user.id);

      if (error) {
        console.error('Error updating preferred_icon_id:', error);
        // Revert on error
        setSelectedIcon(snapshotData?.preferred_icon_id || user?.preferredIconId || null);
        // Remove Browser Alerts: Use non-blocking Toast instead of alert()
        setToast({ message: 'Failed to update icon. Please try again.', type: 'error' });
      } else {
        // Optimistically update snapshotData
        setSnapshotData(prev => ({ ...(prev || ({} as any)), preferred_icon_id: iconId }));
        // Refresh user context to sync
        if (refreshUser) {
          await refreshUser();
        }
      }
    } catch (error) {
      console.error('Error saving icon:', error);
      setSelectedIcon(snapshotData?.preferred_icon_id || user?.preferredIconId || null);
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
          preferred_icon_id: selectedIcon || null
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
  
  // Remove Hardcoding: Delete any const totalXP = 0 placeholders that might be overriding the real data
  // Data Source: Use profile?.totalXP from the profile object instead of hardcoded state
  const { metadata: bunnyVideoMetadata } = useBunnyVideoMetadata(DEFAULT_BUNNY_VIDEO_ID);
  const dailyVideoTitle = bunnyVideoMetadata?.title ?? "";
  const dailyVideoDuration = bunnyVideoMetadata?.lengthSeconds
    ? formatBunnyDuration(bunnyVideoMetadata.lengthSeconds)
    : "";
  const [recentActivities, setRecentActivities] = useState<ActivityItem[]>([]);
  const [scoreTab, setScoreTab] = useState<'myRounds' | 'community'>('myRounds');
  const [activeLiveDraft, setActiveLiveDraft] = useState<LiveRoundDraft | null>(null);
  const [liveEntryGateOpen, setLiveEntryGateOpen] = useState(false);

  const openLiveEntry = () => {
    if (LIVE_ENTRY_ENABLED) {
      router.push("/log-round/live");
      return;
    }
    setLiveEntryGateOpen(true);
  };

  const openLiveEntryForTesting = () => {
    setLiveEntryGateOpen(false);
    router.push("/log-round/live");
  };

  useEffect(() => {
    if (!user?.id || typeof window === "undefined") {
      setActiveLiveDraft(null);
      return;
    }
    setActiveLiveDraft(loadLiveRoundDraft(user.id));
  }, [user?.id]);
  
  // Add a useMemo Hook: Wrap the rounds display logic in a useMemo that depends on the activeTab state
  // Strict Filtering: If activeTab === 'my-rounds', explicitly return rounds.filter(r => r.user_id === user?.id)
  // If activeTab === 'community', return the full rounds array (Global)
  const filteredRoundsByTab = useMemo(() => {
    // Clear the Cache: Ensure that when the tab changes, the filtering logic re-runs
    if (scoreTab === 'myRounds') {
      // Strict Filtering: If activeTab === 'my-rounds', explicitly return rounds.filter(r => r.user_id === user?.id)
      if (!user?.id) {
        console.log('HomeDashboard: No user.id available for filtering My Rounds');
        return [];
      }
      
      console.log('HomeDashboard: My Rounds tab - showing', allRounds.length, 'personal rounds for user', user.id);
      return allRounds;
    } else {
      console.log('HomeDashboard: Community tab - showing all', allCommunityRounds.length, 'rounds');
      return allCommunityRounds;
    }
  }, [allRounds, allCommunityRounds, user?.id, scoreTab]); // Add scoreTab to dependencies to re-run when tab changes
  
  // Fetch Guard removed
  
  // Calculate level and progress - Level 1 starts at 0 XP, Level 2 requires 100 XP
  // Locate the 'Total XP' display: Update the code to use the synchronized variable from profile or user
  const totalXP = snapshotData?.total_xp ?? profile?.totalXP ?? user?.totalXP ?? 0;
  // Add Log: Add console.log('XP SYNC CHECK:', profile?.totalXP) to confirm the value is being received from the database
  console.log('XP SYNC CHECK:', profile?.totalXP, 'user?.totalXP:', user?.totalXP, 'snapshotData?.total_xp:', snapshotData?.total_xp, 'calculated totalXP:', totalXP);
  
  // Exponential Growth: Level thresholds - Level 2 = 500 XP, Level 3 = 1500 XP, Level 4 = 3000 XP
  const getLevelInfo = (xp: number) => {
    if (xp < 500) {
      return { level: 1, xpForCurrentLevel: xp, xpNeededForNextLevel: 500, xpRemaining: 500 - xp };
    } else if (xp < 1500) {
      return { level: 2, xpForCurrentLevel: xp - 500, xpNeededForNextLevel: 1000, xpRemaining: 1500 - xp };
    } else if (xp < 3000) {
      return { level: 3, xpForCurrentLevel: xp - 1500, xpNeededForNextLevel: 1500, xpRemaining: 3000 - xp };
    } else {
      // Level 4+ (every 2000 XP after 3000)
      const level4XP = xp - 3000;
      const additionalLevels = Math.floor(level4XP / 2000);
      const level = 4 + additionalLevels;
      const xpInCurrentLevel = level4XP % 2000;
      return { level, xpForCurrentLevel: xpInCurrentLevel, xpNeededForNextLevel: 2000, xpRemaining: 2000 - xpInCurrentLevel };
    }
  };
  
  const levelInfo = getLevelInfo(totalXP);
  // Database Sync: Pull level directly from database columns
  const currentLevel = snapshotData?.current_level ?? profile?.currentLevel ?? user?.currentLevel ?? levelInfo.level;
  const xpRemaining = levelInfo.xpRemaining;
  
  // Replace Mock Data: Use real rounds from useStats() instead of hardcoded users like 'Alex Chen'
  // Map Real Rounds: Use the rounds array from useStats(). Filter it to show the most recent 5-10 rounds from all users.
  // Calculate Nett: For each round, display the Nett Score. If the database has score and handicap, calculate it as {round.score - round.handicap}.
  // Add Labels: Display the user's name (or ID fallback), the course name, and a 'Nett' label next to their score.
  
  // Fetch user profiles for name lookup (similar to Academy page)
  // Clear the Cache: Ensure that when the tab changes, the name-mapping logic re-runs so Luke's name doesn't stay stuck on my personal rounds
  const [userProfiles, setUserProfiles] = useState<Map<string, { full_name?: string; preferred_icon_id?: string }>>(new Map());
  
  // Add Name Mapping: Create a way to fetch the full_name from the profiles table for every user_id found in the rounds
  // Clear the Cache: Re-fetch profiles when tab changes or rounds change
  useEffect(() => {
    const sourceRounds =
      scoreTab === 'myRounds' ? allRounds : allCommunityRounds;
    if (!sourceRounds || sourceRounds.length === 0) {
      setUserProfiles(new Map());
      return;
    }
    
    const fetchProfiles = async () => {
      // Add Name Mapping: Extract all unique user_ids from rounds
      // Clear the Cache: Use filteredRoundsByTab to get user_ids based on current tab
      const roundsToUse = sourceRounds;
      
      const uniqueUserIds = Array.from(new Set(roundsToUse.map((item: any) => item?.user_id).filter(Boolean)));
      if (uniqueUserIds.length === 0) {
        setUserProfiles(new Map());
        return;
      }
      
      console.log('HomeDashboard: Fetching profiles for', uniqueUserIds.length, 'users (tab:', scoreTab, '):', uniqueUserIds);
      
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, preferred_icon_id')
          .in('id', uniqueUserIds);
        
        if (error) {
          console.error('Error fetching user profiles for Community:', error);
          setUserProfiles(new Map());
          return;
        }
        
        // Add Name Mapping: Create a Map to store user_id -> full_name mappings
        // Clear the Cache: Reset and rebuild the map when tab changes
        const profileMap = new Map<string, { full_name?: string; preferred_icon_id?: string }>();
        if (data) {
          data.forEach((profile: any) => {
            profileMap.set(profile.id, { full_name: profile.full_name, preferred_icon_id: profile.preferred_icon_id });
            console.log('HomeDashboard: Mapped user', profile.id, 'to name:', profile.full_name);
          });
        }
        console.log('HomeDashboard: Loaded', profileMap.size, 'profiles for tab:', scoreTab);
        setUserProfiles(profileMap);
      } catch (error) {
        console.error('Error in fetchProfiles for Community:', error);
        setUserProfiles(new Map());
      }
    };
    
    fetchProfiles();
  }, [allRounds, allCommunityRounds, scoreTab, user?.id]); // Re-run when personal or community rounds change or tab switches
  
  // Delete all logic related to 'Alex Chen', 'Maria Rodriguez', and any hardcoded mock users
  // Wipe the variable 'ec': Completely remove any mention of ec or ed from this file
  // Note: recentRounds removed - now using filteredRoundsByTab which handles both tabs
  
  // Format time ago
  const formatTimeAgo = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const inputDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.floor((today.getTime() - inputDate.getTime()) / 86400000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffMins = Math.floor(diffMs / 60000);
    
    const timeString = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    
    if (diffDays === 0) {
      if (diffHours >= 1 && diffHours < 12) {
        return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
      }
      if (diffMins < 60 && diffMins > 0) {
        return `${diffMins} min${diffMins === 1 ? '' : 's'} ago`;
      }
      if (diffMins === 0) {
        return 'Just now';
      }
      return `Today at ${timeString}`;
    } else if (diffDays === 1) {
      return `Yesterday at ${timeString}`;
    } else {
      return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${timeString}`;
    }
  };
  
  // Get icon for activity type
  const getActivityIcon = (activity: ActivityItem) => {
    if (activity.type === 'round') return Flag;
    if (activity.type === 'drill') return Check;
    if (activity.type === 'video') return Play;
    if (activity.type === 'achievement') return Trophy;
    return Clock; // default for practice
  };
  
  // Get icon color for activity
  const getActivityIconColor = (activity: ActivityItem) => {
    if (activity.type === 'round') return '#014421';
    if (activity.type === 'drill' || activity.type === 'video') return '#FFA500';
    if (activity.type === 'achievement') return '#FFD700';
    return '#014421';
  };
  
  // Load recent activities
  const loadRecentActivities = async () => {
    if (typeof window === 'undefined' || !user?.id) return;
    
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);
        
      if (error) {
        console.error('Error loading recent activities:', error);
        return;
      }
      
      if (data) {
        const mappedActivities: ActivityItem[] = data.map(log => ({
          id: log.id,
          type: (log.activity_type ?? log.type) as any,
          title: log.activity_title ?? log.title ?? '',
          date: log.created_at
        }));
        
        setRecentActivities(mappedActivities);
      }
    } catch (err) {
      console.error('Failed to fetch activity logs:', err);
    }
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

    // Fetch activities every time the component mounts or user ID changes
    loadRecentActivities();
    
    // Listen for practice activity to refresh video
    const handlePracticeUpdate = () => {
      loadRecentActivities();
    };
    
    // Listen for rounds updates
    const handleRoundsUpdate = () => {
      loadRecentActivities();
    };
    
    window.addEventListener('practiceActivityUpdated', handlePracticeUpdate);
    window.addEventListener('roundsUpdated', handleRoundsUpdate);

    return () => {
      window.removeEventListener('practiceActivityUpdated', handlePracticeUpdate);
      window.removeEventListener('roundsUpdated', handleRoundsUpdate);
    };
  }, [user?.id, rounds?.length]);

  // Add Verification: Add a simple console.log to confirm it's no longer undefined
  // Switch to camelCase: Log profile.currentStreak (camelCase) to verify it matches the user object property
  console.log('Banner Displaying Streak:', profile?.currentStreak, 'user.currentStreak:', user?.currentStreak);
  
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
        <div className="flex-1 w-full flex flex-col bg-gray-50">
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 pt-4 pb-32 w-full">
            <div className="w-full max-w-md mx-auto">
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
                <IconPicker selectedIcon={selectedIcon} onSelectIcon={handleIconSelect} />
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
        {/* Alignment: Use flexbox container (flex justify-between items-center) to ensure name is on left and streak is perfectly aligned on right */}
        <div className="pt-2 pb-4 flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowProfileModal(true)}
              className="w-14 h-14 rounded-full overflow-hidden ring-2 ring-gray-100 shadow-sm flex items-center justify-center text-3xl bg-white cursor-pointer hover:ring-[#014421] transition-all"
            >
              <div className="flex items-center justify-center w-full h-full">
                {(() => {
                  // Fallback to null (not flame) if no valid icon exists
                  let displayIcon = snapshotData?.preferred_icon_id ?? user?.preferredIconId ?? null;
                  if (displayIcon === 'flame') displayIcon = null; // Strictly ignore old 'flame' database artifacts
                  
                  return displayIcon ? (() => {
                    const SelectedIcon = GOLF_ICONS.find(icon => icon.id === displayIcon)?.icon;
                    return SelectedIcon ? <SelectedIcon className="w-8 h-8 text-[#014421]" strokeWidth={2.5} /> : <User className="w-8 h-8 text-gray-400" strokeWidth={2.5} />;
                  })() : <User className="w-8 h-8 text-gray-400" strokeWidth={2.5} />;
                })()}
              </div>
            </button>
            <div className="flex-1">
              <p className="text-gray-400 text-xs">Welcome back,</p>
              <p className="text-gray-900 font-bold text-xl mt-1 truncate min-w-0 flex-shrink">
                {/* Connect Auth: Import useAuth and extract the user object */}
                {/* Personalize Greeting: Replace the hardcoded 'Member' text with {user?.fullName || 'Golfer'} */}
                {/* Safety: Keep the existing useRef guards to ensure this doesn't trigger a re-fetch loop */}
                <span>{displayName}</span>
              </p>
            </div>
          </div>
          
          {/* Relocate UI: Move the streak display to the right side of the Welcome Header */}
          {/* Styling: Wrap the streak in a small, pill-shaped badge with a subtle orange background */}
          <div 
            className="px-3 py-1.5 rounded-full flex items-center gap-1.5"
            style={{ 
              backgroundColor: '#FFA500',
              boxShadow: '0 2px 8px rgba(255, 165, 0, 0.2)'
            }}
          >
            <Flame className="w-3.5 h-3.5 text-white" />
            {/* Force Variable Sync: Using profile.currentStreak (camelCase) to match our database fix */}
            <span className="text-white text-sm font-semibold">
              {(profile?.currentStreak || 0)} day{(profile?.currentStreak || 0) !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Coach Administration - visible for authorized coaches only */}
        {(['bdowd@pgamember.org.au', 'allendowd86@gmail.com'].includes((user?.email || '').toLowerCase().trim())) && (
          <div className="w-full px-4 mb-4">
            <Link 
              href="/dashboard/coach"
              className="block w-full"
            >
              <div className="w-full bg-gradient-to-r from-gray-900 to-gray-800 rounded-xl shadow-lg border border-gray-700 overflow-hidden hover:from-gray-800 hover:to-gray-700 transition-all">
                <div className="p-5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                      <Users className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white mb-0.5">Coach Administration</h3>
                      <p className="text-gray-400 text-sm">Open Coaches Dashboard →</p>
                    </div>
                  </div>
                  <span className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg shrink-0">
                    Open
                  </span>
                </div>
              </div>
            </Link>
          </div>
        )}

        <HallOfFameLeaderboard />

        {/* Featured video */}
        <div className="w-full px-4 mb-4">
          <div
            className="mx-auto w-full max-w-[380px] overflow-hidden bg-white"
            style={{
              borderRadius: "16px",
              boxShadow: "0 8px 24px rgba(0, 0, 0, 0.08)",
            }}
          >
            <div className="relative aspect-[9/16] w-full overflow-hidden bg-black">
              <BunnyVideoPlayer videoId={DEFAULT_BUNNY_VIDEO_ID} fill />
              {dailyVideoDuration ? (
                <div className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/70 px-2 py-1 text-xs text-white backdrop-blur-sm">
                  {dailyVideoDuration}
                </div>
              ) : null}
            </div>
            {dailyVideoTitle ? (
              <div className="p-5">
                <button
                  type="button"
                  onClick={() => router.push(`/library?drill=${FEATURED_LIBRARY_DRILL_ID}`)}
                  className="mb-2 block w-full text-left text-xl font-bold tracking-tight transition-opacity hover:opacity-80"
                  style={{
                    color: "#014421",
                    fontFamily: "system-ui, -apple-system, sans-serif",
                    fontWeight: 700,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {dailyVideoTitle}
                </button>
                <p className="text-sm text-gray-500">{APP_VIDEO_COACH_NAME}</p>
              </div>
            ) : null}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="px-4 mb-6 w-full">
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
            <div className="space-y-3 mb-6 max-h-[400px] overflow-y-auto pr-2 pb-2 custom-scrollbar">
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
        <div className="px-4 mb-6 w-full">
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
          {/* Key the List: Add a unique key to the list container based on the activeTab to force React to re-render the list from scratch when switching */}
          {scoreTab === 'myRounds' ? (
            // Fix the Display: Once filtered, the list should show my specific rounds (like the one at Twin Creeks) instead of the 'No rounds recorded' message
            // Strict Filtering: Use filteredRoundsByTab which is filtered by user_id === user.id for myRounds tab
            filteredRoundsByTab && filteredRoundsByTab.length > 0 ? (
              <div key={`myRounds-${scoreTab}`} className="space-y-3">
                {filteredRoundsByTab
                  .sort((a, b) => new Date(b.date || b.created_at || 0).getTime() - new Date(a.date || a.created_at || 0).getTime())
                  .slice(0, 3)
                  .map((round, index) => {
                    const isPB = isPersonalBest(round);
                    return (
                      <div key={round?.id || `my-round-${round?.date}-${index}`} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                        <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {isPB ? (
                            <Trophy className="w-5 h-5 shrink-0" style={{ color: '#FFA500' }} />
                          ) : (
                            <Star className="w-5 h-5 shrink-0" style={{ color: '#014421' }} />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-gray-800 font-medium">You</p>
                            <p className="text-gray-400 text-sm truncate">{round.course || 'Unknown Course'}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {isPB && (
                                <span className="text-xs px-2 py-0.5 rounded text-white font-medium" style={{ backgroundColor: '#FFA500' }}>
                                  Personal Best
                                </span>
                              )}
                              <span className="text-gray-400 text-xs">• {formatTimeAgo(round.date)}</span>
                            </div>
                          </div>
                        </div>
                        <p className="text-2xl font-bold shrink-0" style={{ color: '#FFA500' }}>
                          {round.score || round.nett?.toFixed(0) || 'N/A'}
                        </p>
                        </div>
                        <div className="mt-3 flex justify-end border-t border-gray-100 pt-3">
                          <DeleteRoundButton
                            round={{
                              id: round.id,
                              created_at: round.created_at,
                              date: round.date,
                              course: round.course,
                            }}
                          />
                        </div>
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
            // Initialization Safety: Add if (!rounds || rounds.length === 0) return <div>Loading rounds...</div>; at the top of the Community section to prevent it from mapping an empty state.
            // Strict Filtering: Use filteredRoundsByTab which returns the full rounds array for community tab
            // Clear the Cache: Ensure that when the tab changes, the name-mapping logic re-runs so Luke's name doesn't stay stuck on my personal rounds
            !communityRoundsHydrated ? (
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 text-center">
                <p className="text-gray-600 text-sm">Loading rounds...</p>
              </div>
            ) : filteredRoundsByTab.length > 0 ? (
              <div key={`community-${scoreTab}`} className="space-y-3">
                {/* Key the List: Add a unique key to the list container based on the activeTab to force React to re-render the list from scratch when switching */}
                {/* Fix the 'ec' Crash: In HomeDashboard.tsx, find the .map() function for Recent Scores. Change the logic to: rounds.map((round) => { ... }) and use (round?.score || 0) - (round?.handicap || 0) for the Nett calculation. */}
                {/* Clear the Cache: Sort and slice filteredRoundsByTab (which is the full array for community tab) */}
                {[...filteredRoundsByTab]
                  .sort((a: any, b: any) => {
                    const dateA = new Date(a?.date || a?.created_at || 0);
                    const dateB = new Date(b?.date || b?.created_at || 0);
                    return dateB.getTime() - dateA.getTime();
                  })
                  .slice(0, 5)
                  .map((round: any, index: number) => {
                  // Fix the 'ec' Crash: Use rounds.map((round) => { ... }) and use (round?.score || 0) - (round?.handicap || 0) for the Nett calculation
                  const nett = (round?.score || 0) - (round?.handicap || 0);
                  
                  // Add Name Mapping: Create a way to fetch the full_name from the profiles table for every user_id found in the rounds
                  // Update the List: Inside the .map() function for the Community feed, replace the display of the ID (e.g., '3261994e') with the actual full_name
                  // Safe Fallback: If a name isn't found for an ID, default to showing 'Golfer' instead of the weird code
                  const userId = round?.user_id;
                  const profile = userId ? userProfiles.get(userId) : null;
                  // Update the List: Replace ID display with actual full_name
                  const displayName = profile?.full_name || 'Golfer'; // Safe Fallback: If a name isn't found for an ID, default to showing 'Golfer' instead of the weird code
                  
                  // Debug logging to verify name lookup
                  if (userId && !profile?.full_name) {
                    console.warn('HomeDashboard: No profile found for user_id:', userId, 'in userProfiles Map');
                  }
                  
                  const courseName = round?.course || 'Unknown Course';
                  const roundDate = round?.date || round?.created_at || new Date().toISOString();
                  const timeAgo = formatTimeAgo(roundDate);
                  
                  return (
                    <div key={round?.id || `round-${roundDate}-${index}`} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <Star className="w-5 h-5" style={{ color: '#014421' }} />
                        <div className="flex-1">
                          <p className="text-gray-800 font-medium">{displayName}</p>
                          <p className="text-gray-400 text-sm">{courseName}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-gray-400 text-xs">• {timeAgo}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold" style={{ color: '#FFA500' }}>{nett.toFixed(0)}</p>
                        <p className="text-xs text-gray-400">Nett</p>
                      </div>
                    </div>
                  );
                })}
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

        {/* Action Buttons */}
        <div className="w-full px-4 mb-6 space-y-3">
          {LIVE_ENTRY_ENABLED && activeLiveDraft && (
            <LiveRoundInProgressBanner draft={activeLiveDraft} variant="home" />
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.push('/log-round')}
              className="flex-1 text-white font-semibold py-3.5 rounded-xl shadow-md hover:shadow-lg transition-all hover:scale-[1.02]"
              style={{ backgroundColor: '#FFA500' }}
            >
              Log Round
            </button>
            <button
              type="button"
              onClick={openLiveEntry}
              className="flex flex-1 items-center justify-center gap-2 text-white font-semibold py-3.5 rounded-xl shadow-md hover:shadow-lg transition-all hover:scale-[1.02]"
              style={{ backgroundColor: '#FFA500' }}
            >
              <Radio className="h-4 w-4 shrink-0" aria-hidden />
              Live Entry
            </button>
          </div>
          <LiveEntryNotReadyModal
            open={liveEntryGateOpen}
            onClose={() => setLiveEntryGateOpen(false)}
            onOpenForTesting={openLiveEntryForTesting}
          />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.push('/practice')}
              className="flex-1 text-white font-semibold py-3.5 rounded-xl shadow-md hover:shadow-lg transition-all hover:scale-[1.02]"
              style={{ backgroundColor: '#FFA500' }}
            >
              Log Practice
            </button>
            <button
              type="button"
              onClick={() => router.push('/practice?plan=schedule')}
              className="flex flex-1 items-center justify-center gap-2 text-white font-semibold py-3.5 rounded-xl shadow-md hover:shadow-lg transition-all hover:scale-[1.02]"
              style={{ backgroundColor: '#FFA500' }}
            >
              <Calendar className="h-4 w-4 shrink-0" aria-hidden />
              Practice Plan
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => router.push('/practice?plan=combine')}
              className="flex flex-1 items-center justify-center gap-2 text-white font-semibold py-3.5 rounded-xl shadow-md hover:shadow-lg transition-all hover:scale-[1.02]"
              style={{ backgroundColor: '#FFA500' }}
            >
              <Target className="h-4 w-4 shrink-0" aria-hidden />
              Combine Tests
            </button>
            <button
              type="button"
              onClick={() => router.push('/?view=leaderboard')}
              className="flex flex-1 items-center justify-center gap-2 text-white font-semibold py-3.5 rounded-xl shadow-md hover:shadow-lg transition-all hover:scale-[1.02]"
              style={{ backgroundColor: '#FFA500' }}
            >
              <Trophy className="h-4 w-4 shrink-0" aria-hidden />
              Leaderboards
            </button>
            <button
              type="button"
              onClick={() => router.push('/practice?plan=library')}
              className="flex flex-1 items-center justify-center gap-2 text-white font-semibold py-3.5 rounded-xl shadow-md hover:shadow-lg transition-all hover:scale-[1.02]"
              style={{ backgroundColor: '#FFA500' }}
            >
              <BookOpen className="h-4 w-4 shrink-0" aria-hidden />
              Drill Library
            </button>
            <button
              type="button"
              onClick={() => router.push('/practice?plan=fuel')}
              className="flex flex-1 items-center justify-center gap-2 text-white font-semibold py-3.5 rounded-xl shadow-md hover:shadow-lg transition-all hover:scale-[1.02]"
              style={{ backgroundColor: '#FFA500' }}
            >
              <Apple className="h-4 w-4 shrink-0" aria-hidden />
              Fuel Planner
            </button>
            <button
              type="button"
              onClick={() => router.push('/virtual-caddie')}
              className="flex flex-1 items-center justify-center gap-2 text-white font-semibold py-3.5 rounded-xl shadow-md hover:shadow-lg transition-all hover:scale-[1.02]"
              style={{ backgroundColor: '#FFA500' }}
            >
              <Bot className="h-4 w-4 shrink-0" aria-hidden />
              Virtual Caddie
            </button>
          </div>
        </div>

        <div className="w-full px-4 mb-4">
          <AddToHomeScreenGuide />
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


