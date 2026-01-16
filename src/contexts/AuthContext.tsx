"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { User as SupabaseUser } from "@supabase/supabase-js";

interface User {
  id: string;
  email: string;
  fullName?: string; // Standardized: Only use full_name from profiles table
  profileIcon?: string; // Golf icon selected by student
  initialHandicap?: number;
  createdAt?: string;
  currentStreak?: number; // State Sync: Include streak in user state so banner updates
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, fullName: string, initialHandicap: number, profileIcon?: string) => Promise<void>;
  logout: () => Promise<void>;
  loading: boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Implement a Daily Streak system
// Check on Load: Every time the app loads and the user is logged in, compare today's date with last_login_date in their profile
// State Sync: Ensure setProfile is called with the updated streak value so the banner changes from '0 days' to '1 day' without needing a manual refresh
async function checkAndUpdateStreak(supabase: ReturnType<typeof createClient>, userId: string, profile: any): Promise<number | null> {
  try {
    // Add a Loading Guard: In the streak calculation function, add an if (!profileLoaded) return; guard so it doesn't run with empty data
    if (!profile || !profile.id) {
      console.warn('AuthContext: checkAndUpdateStreak - Profile not loaded, returning null');
      return null;
    }
    
    // Console Log: Add console.log('Streak from DB:', profile.current_streak) so I can see if the app is actually reading the '1' during the refresh
    console.log('AuthContext: Streak from DB:', profile.current_streak, 'last_login_date:', profile.last_login_date);
    
    // Compare Dates Only: Ensure the logic compares only the Date strings (YYYY-MM-DD), not the full timestamps, to avoid resets caused by time differences
    // Timezone Fix: Use new Date().toLocaleDateString('en-CA') (YYYY-MM-DD) to ensure the date format in the database matches the date format in the app exactly
    const today = new Date();
    const todayString = today.toLocaleDateString('en-CA'); // YYYY-MM-DD format (en-CA locale)
    
    // Compare Dates Only: Extract only the date part (YYYY-MM-DD) from last_login_date, ignoring any time component
    // Handle First Login: If last_login_date is empty or null, the code must automatically set current_streak to 1 and save today's date
    // Check the Variable: Ensure we check for null, undefined, and empty string
    let lastLoginDateString = profile.last_login_date;
    
    // Compare Dates Only: If last_login_date contains a timestamp, extract only the date part (YYYY-MM-DD)
    if (lastLoginDateString && typeof lastLoginDateString === 'string') {
      // If it's a full timestamp (contains 'T' or space), extract just the date part
      if (lastLoginDateString.includes('T') || lastLoginDateString.includes(' ')) {
        lastLoginDateString = lastLoginDateString.split('T')[0].split(' ')[0]; // Get YYYY-MM-DD only
        console.log('AuthContext: Extracted date from timestamp:', lastLoginDateString);
      }
    }
    
    const isFirstLogin = !lastLoginDateString || lastLoginDateString === null || lastLoginDateString === '' || lastLoginDateString.trim() === '';
    
    const currentStreak = profile.current_streak || 0;
    let newStreak = currentStreak;
    let xpReward = 0;
    let streakMessage = '';
    
    // Handle First Login: If last_login_date is empty or null, the code must automatically set current_streak to 1 and save today's date
    if (isFirstLogin) {
      // First time login - start streak at 1
      newStreak = 1;
      xpReward = 50; // XP Reward: Give the user 50 XP the moment that 1-day streak starts
      streakMessage = 'Streak Started: 1 day!';
      console.log('AuthContext: First time login - initializing streak to 1 day (last_login_date is empty/null):', lastLoginDateString);
    } else {
      // Compare Dates Only: Ensure the logic compares only the Date strings (YYYY-MM-DD), not the full timestamps, to avoid resets caused by time differences
      // Timezone Fix: Use toLocaleDateString('en-CA') for comparison to match database format
      // Compare Dates Only: lastLoginDateString should already be YYYY-MM-DD format, but ensure it's formatted correctly
      let lastLoginDateFormatted = lastLoginDateString;
      
      // Compare Dates Only: If it's not already in YYYY-MM-DD format, convert it
      if (lastLoginDateString && typeof lastLoginDateString === 'string') {
        // If it contains a timestamp, extract just the date
        if (lastLoginDateString.includes('T') || lastLoginDateString.includes(' ')) {
          lastLoginDateFormatted = lastLoginDateString.split('T')[0].split(' ')[0];
        } else {
          // Try to parse and reformat to ensure YYYY-MM-DD
          const parsedDate = new Date(lastLoginDateString);
          if (!isNaN(parsedDate.getTime())) {
            lastLoginDateFormatted = parsedDate.toLocaleDateString('en-CA');
          }
        }
      }
      
      // Compare Dates Only: Compare only the date strings (YYYY-MM-DD), not timestamps
      if (todayString === lastLoginDateFormatted) {
        // Fix Calculation Loop: If the last_login_date is 'Today', do not run any reset logic. Just display the number from the database.
        console.log('AuthContext: Compare Dates Only - Same day login detected (today:', todayString, 'last:', lastLoginDateFormatted, '), returning database streak without calculation:', currentStreak);
        return currentStreak; // Return current streak from database without any calculation
      }
      
      // Calculate days difference using date strings only (YYYY-MM-DD)
      const todayDate = new Date(todayString);
      const lastDate = new Date(lastLoginDateFormatted);
      const daysDiff = Math.floor((todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      
      console.log('AuthContext: Compare Dates Only - Days difference:', daysDiff, 'today:', todayString, 'last:', lastLoginDateFormatted);
      
      if (daysDiff === 1) {
        // If the dates are exactly 1 day apart, increase current_streak by 1 and reward 50 XP
        newStreak = currentStreak + 1;
        xpReward = 50;
        streakMessage = `Streak Updated: ${newStreak} days!`;
      } else {
        // If it's more than 1 day apart, reset the streak to 1
        newStreak = 1;
        streakMessage = 'Streak Reset: 1 day (missed login)';
      }
    }
    
    // Update Database: Save the new streak and update last_login_date to today
    // Timezone Fix: Use toLocaleDateString('en-CA') to ensure the date format in the database matches the date format in the app exactly
    console.log('AuthContext: Updating streak to', newStreak, 'with last_login_date:', todayString);
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        current_streak: newStreak,
        last_login_date: todayString // Store as YYYY-MM-DD using en-CA locale
      })
      .eq('id', userId);
    
    if (updateError) {
      console.error('AuthContext: Error updating streak:', updateError);
      // Handle First Login: Even on error, if it was first login, we should still return 1 to update the UI
      if (isFirstLogin) {
        console.warn('AuthContext: Database update failed but returning 1 for first login UI update');
        return 1;
      }
      return currentStreak; // Return current streak on error
    }
    
    // XP Reward: Give the user 50 XP the moment that 1-day streak starts
    // Increment Logic: If the dates are exactly 1 day apart, increase current_streak by 1 and reward 50 XP
    if (xpReward > 0) {
      // Use the updateUserXP function logic (inline here since it's in a different file)
      try {
        const { data: currentProfile } = await supabase
          .from('profiles')
          .select('xp')
          .eq('id', userId)
          .single();
        
        const currentXP = currentProfile?.xp || 0;
        const newXP = currentXP + xpReward;
        
        const { error: xpError } = await supabase
          .from('profiles')
          .update({ xp: newXP })
          .eq('id', userId);
        
        if (xpError) {
          console.error('AuthContext: Error updating XP for streak:', xpError);
        } else {
          console.log(`AuthContext: Added ${xpReward} XP for streak (${currentXP} + ${xpReward} = ${newXP})`);
          // Dispatch event to refresh XP leaderboard
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('xpUpdated'));
          }
        }
      } catch (xpErr) {
        console.error('AuthContext: Exception updating XP for streak:', xpErr);
      }
    }
    
    // Visual Feedback: Add a console.log or a small toast notification that says 'Streak Updated: X days!' so I can verify it's working
    console.log(`AuthContext: ${streakMessage}`);
    
    // Visual Feedback: Also dispatch event for potential toast notification
    if (typeof window !== 'undefined' && streakMessage) {
      window.dispatchEvent(new CustomEvent('streakUpdated', { 
        detail: { streak: newStreak, message: streakMessage } 
      }));
    }
    
    // State Sync: Return the updated streak value so we can update the user state
    return newStreak;
    
  } catch (error) {
    console.error('AuthContext: Error in checkAndUpdateStreak:', error);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  
  // Create Supabase client (credentials are hardcoded in client.ts)
  let supabase: ReturnType<typeof createClient> | null = null;
  if (typeof window !== 'undefined') {
    try {
      supabase = createClient();
    } catch (error) {
      console.error('Failed to create Supabase client:', error);
      supabase = null;
    }
  }

  useEffect(() => {
    // Check authentication status on mount
    const checkUser = async () => {
      if (!supabase) {
        setUser(null);
        setIsAuthenticated(false);
        setLoading(false);
        return;
      }

      console.log('AuthContext: Checking authentication status...');
      
      // Wrap in setTimeout to prevent deadlocks (Supabase recommendation)
      setTimeout(async () => {
        // Bypass Profile Errors: Declare supabaseUser outside try block so we can use it in catch
        let supabaseUser: any = null;
        let session: any = null;
        
        try {
          // Try getSession() first (more reliable for client-side auth)
          const sessionResult = await supabase.auth.getSession();
          session = sessionResult.data?.session || null;
          
          supabaseUser = session?.user || null;
          let authError = sessionResult.error;
          
          // Fallback to getUser() if session is null
          if (!supabaseUser) {
            const getUserResult = await supabase.auth.getUser();
            supabaseUser = getUserResult.data?.user || null;
            authError = getUserResult.error;
          }
          
          if (authError || !supabaseUser) {
            console.warn('AuthContext: No authenticated user found', { sessionError: sessionResult.error, authError });
            setUser(null);
            setIsAuthenticated(false);
            setLoading(false);
            return;
          }
          
          console.log('AuthContext: User authenticated via', session ? 'getSession()' : 'getUser()', supabaseUser.id);
          
          // Kill the Wait: Set authentication and loading state immediately after supabaseUser is found
          setIsAuthenticated(true);
          setLoading(false);
          console.log('AuthContext: Authentication state set immediately, loading disabled');
          
          console.log('AuthContext: Fetching user profile...');

          // Kill the Loop: Wrap the entire profile fetch in a try/finally block that always sets setLoading(false)
          // Fetch user profile with full_name and profile_icon from profiles table
          // Remove Database Dependency: Removed initial_handicap from .select() to avoid database dependency
          // Force: ONLY use full_name column
          // Check Academy Fetch: Log exactly what full_name strings are being returned from the database
          console.log('AuthContext: Fetching profile for user ID:', supabaseUser.id);
          
          // Make Handicap Optional: Try to fetch profile, but don't fail if profile fetch fails
          let profile: any = null;
          let profileError: any = null;
          
          try {
            // Kill the Loop: Wrap entire profile fetch section in try/finally to guarantee setLoading(false)
            try {
              // Check on Load: Fetch last_login_date and current_streak for Daily Streak system
              // The Sync Rule: In the useEffect where you fetch the profile, make sure you call setProfile(data) only after you've verified the data is not null
              const { data, error } = await supabase
                .from('profiles')
                .select('full_name, profile_icon, created_at, last_login_date, current_streak')
                .eq('id', supabaseUser.id)
                .single();
              
              // The Sync Rule: Only set profile after verifying data is not null
              if (data) {
                profile = data;
                console.log('AuthContext: Profile data verified and set:', { 
                  full_name: data.full_name, 
                  current_streak: data.current_streak,
                  last_login_date: data.last_login_date 
                });
              } else {
                profile = null;
              }
              profileError = error;
              
              if (profile) {
                console.log('AuthContext: Profile found - full_name:', profile.full_name);
                console.log('AuthContext: Profile found - profile_icon:', profile.profile_icon);
              } else {
                console.log('AuthContext: No profile found for user ID:', supabaseUser.id);
              }
              
            if (profileError) {
              console.error('AuthContext: Profile fetch error:', profileError);
              console.error('AuthContext: Error code:', profileError.code);
              console.error('AuthContext: Error message:', profileError.message);
              // Clear Storage on Failure: If profile fetch fails, clear localStorage and sessionStorage to wipe any poisoned session data
              if (typeof window !== 'undefined') {
                console.warn('AuthContext: Clearing localStorage and sessionStorage due to profile fetch failure');
                localStorage.clear();
                sessionStorage.clear();
              }
              // Make Handicap Optional: If profile fetch fails, continue anyway - don't block app load
              console.warn('AuthContext: Profile fetch failed, but continuing to load app with partial data');
            }
            } catch (fetchError) {
              // Make Handicap Optional: Catch any errors and continue - don't block app load
              // Clear Storage on Failure: If profile fetch fails, clear localStorage and sessionStorage to wipe any poisoned session data
              console.error('AuthContext: Exception during profile fetch:', fetchError);
              if (typeof window !== 'undefined') {
                console.warn('AuthContext: Clearing localStorage and sessionStorage due to profile fetch exception');
                localStorage.clear();
                sessionStorage.clear();
              }
              console.warn('AuthContext: Continuing to load app despite profile fetch error');
              profileError = fetchError;
            }

            // Auto-create profile if it doesn't exist (id matches auth.uid())
            // The Sync Rule: Only set profile after verifying data is not null
            if (profileError && (profileError.code === 'PGRST116' || profileError.message?.includes('No rows'))) {
              console.log('AuthContext: Profile not found, creating new profile with id:', supabaseUser.id);
              const { data: newProfile, error: createError } = await supabase
                .from('profiles')
                .insert({
                  id: supabaseUser.id, // This matches auth.uid() - ensures profile belongs to the right student
                  full_name: supabaseUser.email?.split('@')[0] || 'User',
                  created_at: new Date().toISOString(),
                  current_streak: 0, // Initialize streak to 0 for new profiles
                  last_login_date: null, // Initialize last_login_date to null for new profiles
                })
                .select('full_name, profile_icon, created_at, current_streak, last_login_date')
                .single();
              
              if (createError) {
                console.error('AuthContext: Error creating profile:', createError);
              } else if (newProfile) {
                // The Sync Rule: Only set profile after verifying data is not null
                profile = newProfile;
                console.log('AuthContext: Profile created successfully with id:', supabaseUser.id);
              }
            } else if (!profile && !profileError) {
              // Fallback: if profile is null but no error, try to create it
              console.log('AuthContext: Profile is null, creating new profile with id:', supabaseUser.id);
              const { data: newProfile, error: createError } = await supabase
                .from('profiles')
                .insert({
                  id: supabaseUser.id,
                  full_name: supabaseUser.email?.split('@')[0] || 'User',
                  created_at: new Date().toISOString(),
                  current_streak: 0, // Initialize streak to 0 for new profiles
                  last_login_date: null, // Initialize last_login_date to null for new profiles
                })
                .select('full_name, profile_icon, created_at, current_streak, last_login_date')
                .single();
              
              // The Sync Rule: Only set profile after verifying data is not null
              if (!createError && newProfile) {
                profile = newProfile;
                console.log('AuthContext: Profile created successfully (fallback)');
              }
            }

            // Implement a Daily Streak system
            // Add a Loading Guard: In the streak calculation function, add an if (!profileLoaded) return; guard so it doesn't run with empty data
            // Sync the State: When the profile is fetched, immediately set the current_streak in the local state to match the database value exactly
            // Console Log: Add console.log('Streak from DB:', profile.current_streak) so I can see if the app is actually reading the '1' during the refresh
            
            // Fix the State Conflict: The reason it shows 0 is likely because the profile state is being initialized to a default object with current_streak: 0 before the Supabase data arrives.
            // The Sync Rule: In the useEffect where you fetch the profile, make sure you call setProfile(data) only after you've verified the data is not null.
            // Add a Loading Guard: Don't proceed if profile is not loaded
            if (!profile || !profile.id) {
              console.warn('AuthContext: Profile not loaded, cannot set user state - waiting for profile data');
              // Fix the State Conflict: Don't set user state with default values - wait for profile data
              return;
            }
            
            // The Sync Rule: Only call setUser after verifying the data is not null
            // Console Log: Add console.log('Streak from DB:', profile.current_streak) so I can see if the app is actually reading the '1' during the refresh
            console.log('AuthContext: Streak from DB:', profile.current_streak, 'last_login_date:', profile.last_login_date);
            
            // Restore Real Name: Remove any hardcoded 'Bypassed' strings and ensure the app uses the full_name directly from the profiles table
            // Sync the State: When the profile is fetched, immediately set the current_streak in the local state to match the database value exactly
            // Priority Check: Ensure the app reads the current_streak from the database first before trying to calculate a new one
            const dbStreak = profile.current_streak ?? null; // Use null instead of 0 to distinguish between "not set" and "actually 0"
            console.log('AuthContext: Priority Check - Initial streak from database:', dbStreak, 'last_login_date:', profile.last_login_date);
            
            // The Sync Rule: Only call setUser after verifying the data is not null
            // Sync the State: When the profile is fetched, immediately set the current_streak in the local state to match the database value exactly
            // State Hydration: Set user state immediately with database value so UI shows correct streak right away
            // This prevents the banner from showing 0 while the streak check runs
            if (profile && supabaseUser.id) {
              // Sync the State: Read current_streak from database first - use it as the initial value
              let finalStreak = dbStreak ?? 0; // Will be updated if streak calculation runs
              console.log('AuthContext: Sync the State - Setting user state immediately with database streak:', finalStreak);
              
              // Compare Dates Only: Ensure the logic compares only the Date strings (YYYY-MM-DD), not the full timestamps, to avoid resets caused by time differences
              // Fix Calculation Loop: If the last_login_date is 'Today', do not run any reset logic. Just display the number from the database.
              const today = new Date();
              const todayString = today.toLocaleDateString('en-CA');
              let lastLoginDateString = profile.last_login_date;
              
              // Compare Dates Only: Extract only the date part (YYYY-MM-DD) from last_login_date, ignoring any time component
              if (lastLoginDateString && typeof lastLoginDateString === 'string') {
                // If it's a full timestamp (contains 'T' or space), extract just the date part
                if (lastLoginDateString.includes('T') || lastLoginDateString.includes(' ')) {
                  lastLoginDateString = lastLoginDateString.split('T')[0].split(' ')[0]; // Get YYYY-MM-DD only
                  console.log('AuthContext: Compare Dates Only - Extracted date from timestamp:', lastLoginDateString);
                }
              }
              
              // Fix Calculation Loop: Check if last_login_date is today BEFORE calling checkAndUpdateStreak
              if (lastLoginDateString && lastLoginDateString.trim() !== '') {
                // Compare Dates Only: Ensure we're comparing only date strings (YYYY-MM-DD), not timestamps
                let lastLoginDateFormatted = lastLoginDateString;
                if (lastLoginDateString.includes('T') || lastLoginDateString.includes(' ')) {
                  lastLoginDateFormatted = lastLoginDateString.split('T')[0].split(' ')[0];
                } else {
                  // Try to parse and reformat to ensure YYYY-MM-DD
                  const parsedDate = new Date(lastLoginDateString);
                  if (!isNaN(parsedDate.getTime())) {
                    lastLoginDateFormatted = parsedDate.toLocaleDateString('en-CA');
                  }
                }
                
                // Compare Dates Only: Compare only the date strings (YYYY-MM-DD), not timestamps
                if (todayString === lastLoginDateFormatted) {
                  // Fix Calculation Loop: If last_login_date is 'Today', do not run any reset logic. Just display the number from the database.
                  console.log('AuthContext: Compare Dates Only - last_login_date is today (today:', todayString, 'last:', lastLoginDateFormatted, '), skipping streak calculation, using database value:', finalStreak);
                  // Sync the State: Update profile object to match database value
                  profile.current_streak = finalStreak;
                  // Don't call checkAndUpdateStreak - just use the database value
                } else {
                  // Only run streak calculation if last_login_date is NOT today
                  console.log('AuthContext: Compare Dates Only - last_login_date is not today (today:', todayString, 'last:', lastLoginDateFormatted, '), running streak calculation...');
                  const streakResult = await checkAndUpdateStreak(supabase, supabaseUser.id, profile);
                  if (streakResult !== null) {
                    finalStreak = streakResult;
                    // State Sync: Update profile object with new streak value so it persists
                    profile.current_streak = finalStreak;
                    // Timezone Fix: Use toLocaleDateString('en-CA') to match database format
                    profile.last_login_date = todayString;
                    console.log('AuthContext: Streak updated to', finalStreak, 'profile.current_streak set to:', profile.current_streak);
                  } else {
                    console.warn('AuthContext: checkAndUpdateStreak returned null, keeping current streak:', finalStreak);
                  }
                }
              } else {
                // Handle First Login: If last_login_date is empty or null, run streak initialization
                console.log('AuthContext: last_login_date is empty/null, initializing streak...');
                const streakResult = await checkAndUpdateStreak(supabase, supabaseUser.id, profile);
                if (streakResult !== null) {
                  finalStreak = streakResult;
                  profile.current_streak = finalStreak;
                  profile.last_login_date = todayString;
                  console.log('AuthContext: Streak initialized to', finalStreak);
                }
              }
              
              // The Sync Rule: Call setUser only after verifying data is not null
              // Restore Real Name: Use full_name directly from profiles table, no hardcoded fallbacks
              // Sync the State: When the profile is fetched, immediately set the current_streak in the local state to match the database value exactly
              // UI Link: Ensure the Dashboard and Skills Snapshot are both pulling from this same profile state variable so they don't default to 0 while the database says 1
              setUser({
                id: supabaseUser.id,
                email: supabaseUser.email || '',
                fullName: profile.full_name || undefined, // Restore Real Name: Use full_name from profiles table, no hardcoded 'Bypassed'
                profileIcon: profile.profile_icon || undefined,
                initialHandicap: 0,
                createdAt: profile.created_at || supabaseUser.created_at,
                currentStreak: finalStreak, // UI Link: Use this same value so Dashboard and Skills Snapshot both show the correct streak
              });
            } else {
              console.warn('AuthContext: Cannot check streak - profile:', !!profile, 'supabaseUser.id:', !!supabaseUser.id);
            }
            console.log('AuthContext: Initial check complete, user loaded (even if profile fetch had errors)');
          } finally {
            // Kill the Loop: Always set loading to false in finally block so app never stays stuck
            console.log('AuthContext: Profile fetch finally block - ensuring loading is false');
            setLoading(false);
          }
        } catch (error) {
          // Bypass Profile Errors: Even if profile fetch fails, set user state so the rest of the app (like Navbar) can mount
          console.error("AuthContext: Error checking auth:", error);
          console.warn("AuthContext: Continuing to load app despite auth error");
          
          // Restore Real Name: Don't set user state with hardcoded values - only set if we have real profile data
          // Fix the State Conflict: Don't initialize with default values that include current_streak: 0
          if (supabaseUser) {
            console.warn('AuthContext: Profile fetch failed, but supabaseUser exists - setting minimal user state without streak');
            // Restore Real Name: Don't use hardcoded 'Bypassed' - use undefined or email fallback
            setUser({
              id: supabaseUser.id,
              email: supabaseUser.email || '',
              fullName: undefined, // Restore Real Name: No hardcoded fallback, will be set when profile loads
              profileIcon: undefined,
              initialHandicap: 0,
              createdAt: supabaseUser.created_at,
              currentStreak: undefined, // Fix the State Conflict: Don't default to 0, use undefined until profile loads
            });
            setIsAuthenticated(true);
            console.log('AuthContext: User state set with minimal data - app can mount');
          } else {
            // Only clear user if we couldn't get supabaseUser at all
            console.warn('AuthContext: No supabaseUser available, clearing user state');
            setUser(null);
            setIsAuthenticated(false);
          }
          // State Reset: Force authLoading to false in catch block so Navbar buttons aren't disabled
          console.log('AuthContext: Forcing loading to false in catch block');
          setLoading(false);
        } finally {
          // State Reset: Ensure loading is always set to false
          setLoading(false);
        }
      }, 0);
    };

    checkUser();

    // Listen for auth state changes
    if (!supabase) {
      setLoading(false);
      return;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('AuthContext: onAuthStateChange event:', event, 'has session:', !!session?.user);
      
      // Wrap profile fetching in setTimeout to prevent deadlocks (Supabase recommendation)
      setTimeout(async () => {
        if (session?.user) {
          console.log('AuthContext: Fetching user profile for:', session.user.id);
          
          try {
            // Fetch user profile - standardized to use full_name only
            // Remove Database Dependency: Removed initial_handicap from .select() to avoid database dependency
            let { data: profile, error: profileError } = await supabase
              .from('profiles')
              .select('full_name, profile_icon, created_at')
              .eq('id', session.user.id)
              .single();

            // Auto-create profile if it doesn't exist (id matches auth.uid())
            if (profileError && (profileError.code === 'PGRST116' || profileError.message?.includes('No rows'))) {
              console.log('AuthContext: Profile not found, creating new profile with id:', session.user.id);
              const { data: newProfile, error: createError } = await supabase
                .from('profiles')
                .insert({
                  id: session.user.id, // This matches auth.uid() - ensures profile belongs to the right student
                  full_name: session.user.email?.split('@')[0] || 'User',
                  created_at: new Date().toISOString(),
                })
                .select('full_name, profile_icon, created_at')
                .single();
              
              if (createError) {
                console.error('AuthContext: Error creating profile:', createError);
              } else {
                profile = newProfile;
                console.log('AuthContext: Profile created successfully with id:', session.user.id);
              }
            } else if (!profile && !profileError) {
              // Fallback: if profile is null but no error, try to create it
              console.log('AuthContext: Profile is null, creating new profile with id:', session.user.id);
              const { data: newProfile, error: createError } = await supabase
                .from('profiles')
                .insert({
                  id: session.user.id,
                  full_name: session.user.email?.split('@')[0] || 'User',
                  created_at: new Date().toISOString(),
                })
                .select('full_name, profile_icon, created_at')
                .single();
              
              if (!createError && newProfile) {
                profile = newProfile;
                console.log('AuthContext: Profile created successfully (fallback)');
              }
            }

            // Set user with profile data from profiles table - standardized to use full_name only
            // Hard-Code Defaults: Manually set initialHandicap: 0 instead of getting it from database
            setUser({
              id: session.user.id,
              email: session.user.email || '',
              fullName: profile?.full_name || undefined, // Force: ONLY use full_name from profiles table
              profileIcon: profile?.profile_icon, // Golf icon selected by student
              initialHandicap: 0, // Hard-Code Defaults: Manually set to 0 instead of getting from database
              createdAt: profile?.created_at || session.user.created_at,
            });
            setIsAuthenticated(true);
            console.log('AuthContext: User authenticated and profile loaded');
          } catch (error) {
            console.error('AuthContext: Error fetching profile:', error);
            // Set user with minimal data if profile fetch fails
            setUser({
              id: session.user.id,
              email: session.user.email || '',
            });
            setIsAuthenticated(true);
          }
        } else {
          console.log('AuthContext: No session, clearing user');
          setUser(null);
          setIsAuthenticated(false);
        }
        setLoading(false);
      }, 0);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  // Function to refresh user data from database
  const refreshUser = async () => {
    if (!supabase) return;
    
    try {
      const { data: { user: supabaseUser } } = await supabase.auth.getUser();
      if (!supabaseUser) return;

      // Force: ONLY use full_name column
      // Remove Database Dependency: Removed initial_handicap from .select() to avoid database dependency
      // Also fetch profile_icon for leaderboard display
      // Check Academy Fetch: Log exactly what full_name strings are being returned from the database
      console.log('refreshUser: Fetching profile for user ID:', supabaseUser.id);
      
      // Make Handicap Optional: Try to fetch profile, but don't fail if profile fetch fails
      let profile: any = null;
      let profileError: any = null;
      
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('full_name, profile_icon, created_at')
          .eq('id', supabaseUser.id)
          .single();
        
        profile = data;
        profileError = error;
        
        if (profile) {
          console.log('refreshUser: Profile found - full_name:', profile.full_name);
          console.log('refreshUser: Profile found - profile_icon:', profile.profile_icon);
        } else {
          console.log('refreshUser: No profile found for user ID:', supabaseUser.id);
        }
        
        if (profileError) {
          console.error('refreshUser: Profile fetch error:', profileError);
          console.error('refreshUser: Error code:', profileError.code);
          console.error('refreshUser: Error message:', profileError.message);
          // Make Handicap Optional: If profile fetch fails, continue anyway - don't block app load
          console.warn('refreshUser: Profile fetch failed, but continuing to load app with partial data');
        }
      } catch (fetchError) {
        // Make Handicap Optional: Catch any errors and continue - don't block app load
        console.error('refreshUser: Exception during profile fetch:', fetchError);
        console.warn('refreshUser: Continuing to load app despite profile fetch error');
        profileError = fetchError;
      }

      // Auto-create profile if it doesn't exist (id matches auth.uid())
      if (profileError && (profileError.code === 'PGRST116' || profileError.message?.includes('No rows'))) {
        console.log('refreshUser: Profile not found, creating new profile with id:', supabaseUser.id);
        const { data: newProfile, error: createError } = await supabase
          .from('profiles')
          .insert({
            id: supabaseUser.id, // This matches auth.uid() - ensures profile belongs to the right student
            full_name: supabaseUser.email?.split('@')[0] || 'User',
            created_at: new Date().toISOString(),
          })
          .select('full_name, profile_icon, created_at')
          .single();
        
        if (createError) {
          console.error('refreshUser: Error creating profile:', createError);
        } else {
          profile = newProfile;
          console.log('refreshUser: Profile created successfully with id:', supabaseUser.id);
        }
      } else if (!profile && !profileError) {
        // Fallback: if profile is null but no error, try to create it
        console.log('refreshUser: Profile is null, creating new profile with id:', supabaseUser.id);
        const { data: newProfile, error: createError } = await supabase
          .from('profiles')
          .insert({
            id: supabaseUser.id,
            full_name: supabaseUser.email?.split('@')[0] || 'User',
            created_at: new Date().toISOString(),
          })
          .select('full_name, profile_icon, created_at')
          .single();
        
        if (!createError && newProfile) {
          profile = newProfile;
          console.log('refreshUser: Profile created successfully (fallback)');
        }
      }

      // Verify Data Source: Force it to display profile?.full_name || user.email
      // Hard-Code Defaults: Manually set initialHandicap: 0 instead of getting it from database
      // Force full_name: ONLY use full_name from profiles table, no fallbacks
      // This ensures the updated name from the save function is immediately reflected
      console.log('refreshUser: Updating user with full_name:', profile?.full_name);
      setUser((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          fullName: profile?.full_name || prev.fullName || undefined,
          profileIcon: profile?.profile_icon || prev.profileIcon || undefined,
          initialHandicap: 0, // Hard-Code Defaults: Manually set to 0 instead of getting from database
        };
      });
    } catch (error) {
      console.error('Error refreshing user:', error);
    }
  };

  // Redirect to login if not authenticated (except on login page and auth callback)
  useEffect(() => {
    if (!loading && !isAuthenticated && pathname !== "/login" && !pathname.startsWith("/auth/callback")) {
      router.push("/login");
    }
  }, [isAuthenticated, loading, pathname, router]);

  const login = async (email: string, password: string) => {
    if (!supabase) {
      throw new Error('Failed to initialize Supabase client.');
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw new Error(error.message || "Invalid email or password");
    }

    if (data.user) {
      // Fetch user profile with try/catch - login should succeed even if profile fetch fails
      let profile = null;
      try {
        // Force: ONLY use full_name column
        // Also fetch profile_icon for leaderboard display
        // Remove Database Dependency: Removed initial_handicap from .select() to avoid database dependency
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('full_name, profile_icon, created_at')
          .eq('id', data.user.id)
          .single();
        
        // Auto-create profile if it doesn't exist (id matches auth.uid())
        if (profileError && (profileError.code === 'PGRST116' || profileError.message?.includes('No rows'))) {
          console.log('Login: Profile not found, creating new profile with id:', data.user.id);
          const { data: newProfile, error: createError } = await supabase
            .from('profiles')
            .insert({
              id: data.user.id, // This matches auth.uid() - ensures profile belongs to the right student
              full_name: data.user.email?.split('@')[0] || 'User',
              created_at: new Date().toISOString(),
            })
            .select('full_name, profile_icon, created_at')
            .single();
          
          if (createError) {
            console.error('Login: Error creating profile:', createError);
          } else {
            profile = newProfile;
            console.log('Login: Profile created successfully with id:', data.user.id);
          }
        } else if (!profileData && !profileError) {
          // Fallback: if profile is null but no error, try to create it
          console.log('Login: Profile is null, creating new profile with id:', data.user.id);
          const { data: newProfile, error: createError } = await supabase
            .from('profiles')
            .insert({
              id: data.user.id,
              full_name: data.user.email?.split('@')[0] || 'User',
              created_at: new Date().toISOString(),
            })
            .select('full_name, profile_icon, created_at')
            .single();
          
          if (!createError && newProfile) {
            profile = newProfile;
            console.log('Login: Profile created successfully (fallback)');
          }
        } else {
          profile = profileData;
        }
      } catch (profileError) {
        console.warn('Login: Profile fetch failed (user can still login):', profileError);
        // Continue with login even if profile fetch fails
      }

      // Force: ONLY use full_name column
      // Hard-Code Defaults: Manually set initialHandicap: 0 instead of getting it from database
      setUser({
        id: data.user.id,
        email: data.user.email || '',
        fullName: profile?.full_name, // Standardized: Only use full_name
        profileIcon: profile?.profile_icon, // Golf icon selected by student
        initialHandicap: 0, // Hard-Code Defaults: Manually set to 0 instead of getting from database
        createdAt: profile?.created_at || data.user.created_at,
      });
      setIsAuthenticated(true);
      // Note: Redirect handled by login page using window.location.assign
    }
  };

  const signup = async (email: string, password: string, fullName: string, initialHandicap: number, profileIcon?: string) => {
    if (!supabase) {
      throw new Error('Failed to initialize Supabase client.');
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      throw new Error(error.message || "Failed to create account");
    }

      if (data.user && supabase) {
        // Create user profile with fullName, initialHandicap, and profile_icon
        // Force: ONLY use full_name column
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: data.user.id,
            full_name: fullName, // Force: ONLY use full_name column
            profile_icon: profileIcon || null, // Golf icon selected by student
            initial_handicap: initialHandicap,
            created_at: new Date().toISOString(),
          });

      if (profileError) {
        console.error("Error creating profile:", profileError);
        // Continue anyway - profile can be updated later
      }

      setUser({
        id: data.user.id,
        email: data.user.email || '',
        fullName,
        profileIcon: profileIcon || undefined,
        initialHandicap,
        createdAt: data.user.created_at,
      });
      setIsAuthenticated(true);
      // Redirect to Home Dashboard after signup
      router.push("/");
    }
  };

  const logout = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    setUser(null);
    setIsAuthenticated(false);
    router.push("/login");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        login,
        signup,
        logout,
        loading,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

