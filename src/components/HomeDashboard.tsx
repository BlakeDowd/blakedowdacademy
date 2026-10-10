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
  Crosshair,
  BarChart3,
  Smartphone,
  MessageSquare,
  Ruler,
  Timer,
  Camera,
  Loader2,
} from "lucide-react";
import { AddToHomeScreenGuide } from "@/components/AddToHomeScreenGuide";
import { FeedbackBox } from "@/components/FeedbackBox";
import { HomeWeekSchedule } from "@/components/HomeWeekSchedule";
import { HomeCoachingCard } from "@/components/coaching/HomeCoachingCard";
import { LiveRoundInProgressBanner } from "@/components/LiveRoundInProgressBanner";
import {
  LIVE_ENTRY_ENABLED,
  LiveEntryNotReadyModal,
} from "@/components/LiveEntryNotReadyModal";
import { loadLiveRoundDraft, type LiveRoundDraft } from "@/lib/liveRoundDraft";
import IconPicker from "@/components/IconPicker";
import ProfileAvatar from "@/components/ProfileAvatar";
import {
  isPhotoPicture,
  removeProfilePhoto,
  setCachedProfilePicture,
  uploadProfilePhoto,
} from "@/lib/profilePicture";
import Toast from "@/components/Toast";
import { BunnyVideoPlayer } from "@/components/BunnyVideoPlayer";
import {
  APP_VIDEO_COACH_NAME,
  buildBunnyThumbnailUrl,
  formatBunnyDuration,
  isBunnyPortraitVideo,
  resolveFeaturedHomeVideo,
} from "@/lib/bunnyStream";
import { useBunnyVideoMetadata } from "@/hooks/useBunnyVideoMetadata";
import { HallOfFameLeaderboard } from "@/components/academy/HallOfFameLeaderboard";

const INSTALL_BANNER_DISMISSED_KEY = 'homeInstallBannerDismissed';
const RECENT_ITEMS_SHOWN = 3;

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
    
    const previousPicture = selectedIcon;
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
        if (isPhotoPicture(iconId)) void removeProfilePhoto(supabase, iconId);
      } else {
        if (previousPicture !== iconId) void removeProfilePhoto(supabase, previousPicture);
        setCachedProfilePicture(user.id, iconId);
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
  
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const handlePhotoChosen = async (file: File | undefined) => {
    if (!file || !user?.id) return;
    setIsUploadingPhoto(true);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const value = await uploadProfilePhoto(createClient(), user.id, file);
      await handleIconSelect(value);
    } catch (error) {
      console.error('Error uploading profile photo:', error);
      setToast({ message: error instanceof Error ? error.message : 'Photo upload failed. Please try again.', type: 'error' });
    } finally {
      setIsUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
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
  const [featuredHome] = useState(() => resolveFeaturedHomeVideo());
  const { metadata: bunnyVideoMetadata, loading: bunnyVideoMetadataLoading } = useBunnyVideoMetadata(
    featuredHome.bunnyVideoId,
  );
  const dailyVideoIsPortrait = isBunnyPortraitVideo(bunnyVideoMetadata);
  const dailyVideoTitle = featuredHome.label;
  const dailyVideoDuration = bunnyVideoMetadata?.lengthSeconds
    ? formatBunnyDuration(bunnyVideoMetadata.lengthSeconds)
    : "";
  const [featuredVideoExpanded, setFeaturedVideoExpanded] = useState(false);
  const featuredThumbUrl = bunnyVideoMetadataLoading
    ? null
    : buildBunnyThumbnailUrl(featuredHome.bunnyVideoId, bunnyVideoMetadata?.thumbnailFileName);
  const [recentActivities, setRecentActivities] = useState<ActivityItem[]>([]);
  const [recentTab, setRecentTab] = useState<'activity' | 'myRounds' | 'community'>('activity');
  const scoreTab: 'myRounds' | 'community' = recentTab === 'community' ? 'community' : 'myRounds';
  const [leaderboardExpanded, setLeaderboardExpanded] = useState(false);
  const [installGuideOpen, setInstallGuideOpen] = useState(false);
  const [installBannerHidden, setInstallBannerHidden] = useState(true);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (new URLSearchParams(window.location.search).get('view') === 'leaderboard') {
      setLeaderboardExpanded(true);
    }
    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstallBannerHidden(isStandalone || localStorage.getItem(INSTALL_BANNER_DISMISSED_KEY) === '1');
  }, []);

  const dismissInstallBanner = () => {
    localStorage.setItem(INSTALL_BANNER_DISMISSED_KEY, '1');
    setInstallBannerHidden(true);
  };
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
              
              <div className="mb-4">
                <p className="block text-sm font-medium text-gray-700 mb-2">Profile Picture</p>
                <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
                  <ProfileAvatar picture={selectedIcon} name={editedName || user?.fullName} size={56} />
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      disabled={isUploadingPhoto || isSavingIcon}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#014421] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#013320] disabled:opacity-60"
                    >
                      {isUploadingPhoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                      {isUploadingPhoto ? 'Uploading…' : isPhotoPicture(selectedIcon) ? 'Change photo' : 'Upload photo'}
                    </button>
                    <p className="mt-1 text-xs text-gray-500">Or pick an emblem below.</p>
                  </div>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handlePhotoChosen(e.target.files?.[0])}
                  />
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Choose Your Emblem
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
              aria-label="Edit profile"
              className="relative w-14 h-14 rounded-full ring-2 ring-gray-100 shadow-sm flex items-center justify-center bg-white cursor-pointer hover:ring-[#014421] transition-all"
            >
              {(() => {
                // 'flame' is a legacy database artifact, not a real emblem
                const picture = snapshotData?.preferred_icon_id ?? user?.preferredIconId ?? null;
                return picture && picture !== 'flame' ? (
                  <ProfileAvatar picture={picture} name={displayName} size={isPhotoPicture(picture) ? 56 : 46} />
                ) : (
                  <User className="w-8 h-8 text-gray-400" strokeWidth={2.5} />
                );
              })()}
              <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#FFA500] ring-2 ring-white">
                <Camera className="h-3 w-3 text-white" strokeWidth={2.5} />
              </span>
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

        <HomeCoachingCard />

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

        <HomeWeekSchedule />

        {/* Quick actions */}
        <div className="w-full px-4 mb-6 space-y-3">
          {LIVE_ENTRY_ENABLED && activeLiveDraft && (
            <LiveRoundInProgressBanner draft={activeLiveDraft} variant="home" />
          )}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => router.push('/log-round')}
              className="flex items-center justify-center gap-2 text-white font-semibold py-3.5 rounded-xl shadow-md hover:shadow-lg transition-all hover:scale-[1.02]"
              style={{ backgroundColor: '#FFA500' }}
            >
              <Flag className="h-4 w-4 shrink-0" aria-hidden />
              Log Round
            </button>
            <button
              type="button"
              onClick={() => router.push('/practice')}
              className="flex items-center justify-center gap-2 text-white font-semibold py-3.5 rounded-xl shadow-md hover:shadow-lg transition-all hover:scale-[1.02]"
              style={{ backgroundColor: '#FFA500' }}
            >
              <Target className="h-4 w-4 shrink-0" aria-hidden />
              Practice
            </button>
          </div>
          <LiveEntryNotReadyModal
            open={liveEntryGateOpen}
            onClose={() => setLiveEntryGateOpen(false)}
            onOpenForTesting={openLiveEntryForTesting}
          />
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Live Entry', icon: Radio, onClick: openLiveEntry },
              { label: 'Combine Tests', icon: Crosshair, onClick: () => router.push('/practice?plan=combine') },
              { label: 'Drill Library', icon: BookOpen, onClick: () => router.push('/practice?plan=library') },
              { label: 'My Stats', icon: BarChart3, onClick: () => router.push('/stats') },
              { label: 'Fuel Planner', icon: Apple, onClick: () => router.push('/practice?plan=fuel') },
              { label: 'Virtual Caddie', icon: Bot, onClick: () => router.push('/virtual-caddie') },
              { label: 'Putt Calculator', icon: Ruler, onClick: () => router.push('/putting-calculator') },
              { label: 'Swing Tempo', icon: Timer, onClick: () => router.push('/full-swing-tempo') },
              { label: 'Chip Tempo', icon: Flag, onClick: () => router.push('/short-game-tempo') },
            ].map(({ label, icon: Icon, onClick }) => (
              <button
                key={label}
                type="button"
                onClick={onClick}
                className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-gray-100 bg-white px-1 py-3 text-center text-xs font-semibold leading-tight text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
              >
                <Icon className="h-5 w-5 text-[#014421]" aria-hidden />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Featured video — compact until tapped, then full player */}
        <div className="w-full px-4 mb-4">
          <div
            className="mx-auto w-full max-w-[380px] overflow-hidden bg-white"
            style={{
              borderRadius: "16px",
              boxShadow: "0 8px 24px rgba(0, 0, 0, 0.08)",
            }}
          >
            {featuredVideoExpanded ? (
              <div
                className={`relative w-full overflow-hidden bg-black ${
                  dailyVideoIsPortrait ? "aspect-[9/16]" : "aspect-video"
                }`}
              >
                <BunnyVideoPlayer
                  videoId={featuredHome.bunnyVideoId}
                  fill
                  autoplay
                />
                <button
                  type="button"
                  onClick={() => setFeaturedVideoExpanded(false)}
                  className="absolute right-2 top-2 z-10 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm hover:bg-black/80"
                  aria-label="Close video"
                >
                  Close
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setFeaturedVideoExpanded(true)}
                className="group relative block w-full overflow-hidden bg-stone-900 text-left aspect-[16/10]"
                aria-label={`Play ${dailyVideoTitle}`}
              >
                {featuredThumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={featuredThumbUrl}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-[#014421] to-stone-900" />
                )}
                <div className="absolute inset-0 bg-black/25" />
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#FFA500] text-white shadow-lg transition-transform group-hover:scale-105">
                    <Play className="h-6 w-6 fill-current ml-0.5" aria-hidden />
                  </span>
                </span>
                {dailyVideoDuration ? (
                  <span className="absolute bottom-2 right-2 rounded bg-black/70 px-2 py-1 text-xs text-white backdrop-blur-sm">
                    {dailyVideoDuration}
                  </span>
                ) : null}
              </button>
            )}
            <div className="p-4">
              <button
                type="button"
                onClick={() =>
                  featuredVideoExpanded
                    ? router.push(`/library?drill=${featuredHome.libraryDrillId}`)
                    : setFeaturedVideoExpanded(true)
                }
                className="mb-1 block w-full text-left text-lg font-bold tracking-tight transition-opacity hover:opacity-80"
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
              {!featuredVideoExpanded ? (
                <p className="mt-1 text-xs text-stone-400">Tap to play</p>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    router.push(`/library?drill=${featuredHome.libraryDrillId}`)
                  }
                  className="mt-2 text-xs font-semibold text-[#FFA500] hover:underline"
                >
                  Open in Library
                </button>
              )}
            </div>
          </div>
        </div>

        <HallOfFameLeaderboard
          compact
          expanded={leaderboardExpanded}
          onExpandedChange={setLeaderboardExpanded}
        />

        {/* Recent activity and scores */}
        <div className="px-4 mb-6 w-full">
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">Recent</h2>
              <Link
                href={recentTab === 'activity' ? '/activity' : '/scores'}
                className="text-sm font-medium hover:underline"
                style={{ color: '#FFA500' }}
              >
                View All
              </Link>
            </div>
            <div className="mb-3 grid grid-cols-3 gap-1 rounded-xl bg-gray-100 p-1">
              {([
                ['activity', 'Activity'],
                ['myRounds', 'My Rounds'],
                ['community', 'Community'],
              ] as const).map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setRecentTab(tab)}
                  className={`rounded-lg py-1.5 text-xs font-semibold transition-colors ${
                    recentTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {recentTab === 'activity' ? (
              recentActivities.length > 0 ? (
                <ul className="divide-y divide-gray-100">
                  {recentActivities.slice(0, RECENT_ITEMS_SHOWN).map((activity) => {
                    const IconComponent = getActivityIcon(activity);
                    const iconColor = getActivityIconColor(activity);
                    const isRound = activity.type === 'round';
                    return (
                      <li key={activity.id} className="flex items-center gap-3 py-2.5">
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                          style={{
                            backgroundColor: isRound ? 'rgba(1, 68, 33, 0.1)' : 'rgba(255, 165, 0, 0.1)',
                          }}
                        >
                          <IconComponent className="h-4 w-4" style={{ color: iconColor }} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-800">{activity.title}</p>
                          <div className="mt-0.5 flex items-center gap-2">
                            <span className="text-xs text-gray-400">{formatTimeAgo(activity.date)}</span>
                            {activity.xp ? (
                              <span className="text-xs font-medium" style={{ color: '#FFA500' }}>
                                +{activity.xp} XP
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="py-4 text-center">
                  <Activity className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                  <p className="mb-3 text-sm text-gray-600">No activity yet. Start your journey!</p>
                  <button
                    type="button"
                    onClick={() => router.push('/practice')}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-white"
                    style={{ backgroundColor: '#FFA500' }}
                  >
                    Start Practicing
                  </button>
                </div>
              )
            ) : recentTab === 'myRounds' ? (
              filteredRoundsByTab.length > 0 ? (
                <ul className="divide-y divide-gray-100">
                  {[...filteredRoundsByTab]
                    .sort((a, b) => new Date(b.date || b.created_at || 0).getTime() - new Date(a.date || a.created_at || 0).getTime())
                    .slice(0, RECENT_ITEMS_SHOWN)
                    .map((round, index) => {
                      const isPB = isPersonalBest(round);
                      return (
                        <li key={round?.id || `my-round-${round?.date}-${index}`} className="flex items-center gap-3 py-2.5">
                          {isPB ? (
                            <Trophy className="h-5 w-5 shrink-0" style={{ color: '#FFA500' }} />
                          ) : (
                            <Star className="h-5 w-5 shrink-0" style={{ color: '#014421' }} />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-gray-800">{round.course || 'Unknown Course'}</p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-2">
                              {isPB && (
                                <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white" style={{ backgroundColor: '#FFA500' }}>
                                  Personal Best
                                </span>
                              )}
                              <span className="text-xs text-gray-400">{formatTimeAgo(round.date)}</span>
                            </div>
                          </div>
                          <p className="shrink-0 text-xl font-bold" style={{ color: '#FFA500' }}>
                            {round.score || round.nett?.toFixed(0) || 'N/A'}
                          </p>
                        </li>
                      );
                    })}
                </ul>
              ) : (
                <div className="py-4 text-center">
                  <Trophy className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                  <p className="mb-1 text-sm text-gray-600">
                    {userRoundsCount === 0 ? 'No rounds recorded' : `${userRoundsCount} Round${userRoundsCount !== 1 ? 's' : ''} recorded`}
                  </p>
                  <p className="mb-3 text-xs text-gray-400">Log your first round to see your stats</p>
                  <button
                    type="button"
                    onClick={() => router.push('/log-round')}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-white"
                    style={{ backgroundColor: '#FFA500' }}
                  >
                    Log Round
                  </button>
                </div>
              )
            ) : !communityRoundsHydrated ? (
              <p className="py-4 text-center text-sm text-gray-600">Loading rounds...</p>
            ) : filteredRoundsByTab.length > 0 ? (
              <ul className="divide-y divide-gray-100">
                {[...filteredRoundsByTab]
                  .sort((a: any, b: any) => new Date(b?.date || b?.created_at || 0).getTime() - new Date(a?.date || a?.created_at || 0).getTime())
                  .slice(0, RECENT_ITEMS_SHOWN)
                  .map((round: any, index: number) => {
                    const nett = (round?.score || 0) - (round?.handicap || 0);
                    const roundProfile = round?.user_id ? userProfiles.get(round.user_id) : null;
                    const roundDate = round?.date || round?.created_at || new Date().toISOString();
                    return (
                      <li key={round?.id || `round-${roundDate}-${index}`} className="flex items-center gap-3 py-2.5">
                        <ProfileAvatar picture={roundProfile?.preferred_icon_id} name={roundProfile?.full_name || 'Golfer'} size={32} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-800">{roundProfile?.full_name || 'Golfer'}</p>
                          <p className="truncate text-xs text-gray-400">
                            {round?.course || 'Unknown Course'} · {formatTimeAgo(roundDate)}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-xl font-bold leading-none" style={{ color: '#FFA500' }}>{nett.toFixed(0)}</p>
                          <p className="text-[10px] text-gray-400">Nett</p>
                        </div>
                      </li>
                    );
                  })}
              </ul>
            ) : (
              <div className="py-4 text-center">
                <Users className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                <p className="mb-1 text-sm text-gray-600">No community rounds yet</p>
                <p className="text-xs text-gray-400">Be the first to log a round!</p>
              </div>
            )}
          </div>
        </div>

        <div className="w-full px-4 mb-4 space-y-3">
          {!installBannerHidden ? (
            installGuideOpen ? (
              <div className="relative">
                <AddToHomeScreenGuide />
                <button
                  type="button"
                  onClick={() => setInstallGuideOpen(false)}
                  className="absolute right-3 top-3 rounded-full p-1 text-gray-400 hover:bg-gray-100"
                  aria-label="Close install guide"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
                <Smartphone className="h-5 w-5 shrink-0 text-[#014421]" aria-hidden />
                <button type="button" onClick={() => setInstallGuideOpen(true)} className="min-w-0 flex-1 text-left">
                  <p className="text-sm font-semibold text-gray-900">Save app to your phone</p>
                  <p className="text-xs text-gray-500">Tap to see how</p>
                </button>
                <button
                  type="button"
                  onClick={dismissInstallBanner}
                  className="rounded-full p-1 text-gray-400 hover:bg-gray-100"
                  aria-label="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )
          ) : null}

          {feedbackOpen ? (
            <div className="relative">
              <FeedbackBox />
              <button
                type="button"
                onClick={() => setFeedbackOpen(false)}
                className="absolute right-3 top-3 rounded-full p-1 text-gray-400 hover:bg-gray-100"
                aria-label="Close feedback"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setFeedbackOpen(true)}
              className="flex w-full items-center justify-center gap-2 py-2 text-sm font-medium text-gray-500 hover:text-[#014421]"
            >
              <MessageSquare className="h-4 w-4" aria-hidden />
              Send feedback
            </button>
          )}
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


