// Production build sync: 01-18-2026 - v1.0.1
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
    
    // Console Log: Use profile.currentStreak (camelCase) since the database column is "currentStreak"
    console.log('AuthContext: Streak from DB:', profile.currentStreak, 'last_login_date:', profile.last_login_date);
    
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
    
    // Update Mapping: Use profile.currentStreak (camelCase) since the database column is "currentStreak"
    const currentStreak = profile.currentStreak || 0;
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
    // Update Query: Use "currentStreak" (with double quotes) since the database column is camelCase
    // Timezone Fix: Use toLocaleDateString('en-CA') to ensure the date format in the database matches the date format in the app exactly
    console.log('AuthContext: Updating streak to', newStreak, 'with last_login_date:', todayString);
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        "currentStreak": newStreak, // Use double quotes for camelCase column name
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
        // Declare supabaseUser outside try block so we can use it in catch
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
              // Check the ID: Log the user.id right before the fetch to ensure we are actually looking for a valid UUID
              console.log('AuthContext: Fetching profile for user ID:', supabaseUser.id, '(Type:', typeof supabaseUser.id, ')');
              
              // Force the Column Name: Wrap the column in double quotes exactly like this: "currentStreak". This prevents the Supabase client or Postgres from automatically lower-casing it.
              const { data, error } = await supabase
                .from('profiles')
                .select('id, full_name, profile_icon, created_at, last_login_date, "currentStreak"')
                .eq('id', supabaseUser.id)
                .single();
              
              // Update Mapping: Ensure the code that sets the user state uses data.currentStreak instead of data.current_streak
              // The database column is "currentStreak" (camelCase), not current_streak (snake_case)
              // Fix the 'null' Profile: Set profile from data if it exists, even if there's an error (data takes precedence)
              if (data) {
                const profileData = { 
                  ...data, 
                  currentStreak: data?.currentStreak || 0 
                };
                console.log('Verify Mapping - profileData:', profileData, 'currentStreak value:', profileData.currentStreak, 'raw data.currentStreak:', data?.currentStreak);
                
                // Fix the 'null' Profile: Set profile from data to ensure profile is not null when data exists
                profile = profileData;
                console.log('AuthContext: Profile data verified and set:', { 
                  full_name: profileData.full_name, 
                  currentStreak: profileData.currentStreak,
                  'data.currentStreak (raw)': data?.currentStreak
                });
                console.log('AuthContext: Profile fetched - currentStreak value:', profileData.currentStreak);
                console.log('AuthContext: Profile found - full_name:', profile.full_name);
                console.log('AuthContext: Profile found - profile_icon:', profile.profile_icon);
              } else {
                // Kill the Fallback: Temporarily comment out the line that says keeping profile as null so the app is forced to wait for the real data.
                // profile = null;
                console.log('AuthContext: No profile data from database - waiting for real data');
              }
              
              // Fix the 'null' Profile: Only set profileError if there's an error AND no data
              // If data exists, we can still use it even if there's a warning error
              if (error && !data) {
                profileError = error;
                // Stop Partial Loading: Change the logic so that if the profile fetch fails, it logs the actual error to the console
                console.error('❌ AuthContext: PROFILE FETCH FAILED - Full Error Details:');
                console.error('   Error Code:', profileError.code);
                console.error('   Error Message:', profileError.message);
                console.error('   Error Details:', profileError.details);
                console.error('   Error Hint:', profileError.hint);
                console.error('   User ID:', supabaseUser?.id);
                console.error('   This could be a permissions error (RLS policy), missing column, or query syntax issue');
                
                // Stop Partial Loading: Don't continue with partial data - log the actual error and investigate
                // The error above will show why the fetch is failing (e.g., permissions error or missing column)
                throw new Error(`Profile fetch failed: ${profileError.message} (Code: ${profileError.code}). Check RLS policies and column names.`);
              } else if (error && data) {
                // Log warning but don't throw - we have data so we can proceed
                // Fix TypeScript: Cast error to any to avoid 'never' type inference
                console.warn('AuthContext: Profile fetch returned data but also had an error:', (error as any)?.message);
                profileError = null; // Clear error since we have data
              } else {
                profileError = null; // No error
              }
            } catch (fetchError) {
              // Stop Partial Loading: Log the actual exception so we can see what's failing
              console.error('❌ AuthContext: EXCEPTION during profile fetch:');
              console.error('   Exception:', fetchError);
              console.error('   Exception Type:', typeof fetchError);
              console.error('   Exception Message:', (fetchError as Error)?.message);
              console.error('   User ID:', supabaseUser?.id);
              
              // Stop Partial Loading: Don't silently continue - log the error details for debugging
              profileError = fetchError;
              // Don't throw here - let the calling code handle the error
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
                  "currentStreak": 0, // Initialize streak to 0 for new profiles (use double quotes for camelCase column)
                  last_login_date: null, // Initialize last_login_date to null for new profiles
                })
                .select('full_name, profile_icon, created_at, "currentStreak", last_login_date')
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
                  "currentStreak": 0, // Initialize streak to 0 for new profiles (use double quotes for camelCase column)
                  last_login_date: null, // Initialize last_login_date to null for new profiles
                })
                .select('full_name, profile_icon, created_at, "currentStreak", last_login_date')
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
            
            // Fix Race Condition: Ensure streak calculation only runs after fetchProfile has successfully returned data
            // Sync the State: Update profile state with exact currentStreak from database
            // Debug the Row: Log the profile object to see what we have
            console.log('AuthContext: Profile object before calculation:', profile);
            // Verify Mapping: Profile now has currentStreak (camelCase) instead of current_streak (snake_case)
            console.log('AuthContext: Streak from DB (before calculation):', profile.currentStreak, 'last_login_date:', (profile as any).last_login_date);
            
            // Sync the State: Use the exact database value - don't default to 0
            // This ensures the UI shows the correct streak value from the database
            // Verify Mapping: Use currentStreak (camelCase) from profile object
            const dbStreak = profile.currentStreak; // Use currentStreak (camelCase) from profile object
            console.log('AuthContext: Database streak value (raw):', dbStreak, 'type:', typeof dbStreak);
            
            // Fix Race Condition: Only proceed if profile data has been successfully fetched
            if (profile && profile.id && supabaseUser.id) {
              // Sync the State: Start with exact database value - no defaulting to 0
              // The database value will be preserved unless streak calculation runs and returns a different value
              let finalStreak: number | null | undefined = dbStreak; // Preserve exact database value (could be 1, 0, null, undefined)
              console.log('AuthContext: Sync the State - Using database streak value:', finalStreak, '(raw DB:', dbStreak, ')');
              
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
                  console.log('AuthContext: last_login_date is today - skipping streak calculation, using exact database value:', finalStreak);
                  // Sync the State: Keep exact database value - update currentStreak (camelCase)
                  profile.currentStreak = finalStreak; // Update camelCase property (database column is "currentStreak")
                  // Don't call checkAndUpdateStreak - just use the database value as-is
                } else {
                  // Fix Race Condition: Only run streak calculation if last_login_date is NOT today
                  console.log('AuthContext: last_login_date is not today - running streak calculation...');
                  const streakResult = await checkAndUpdateStreak(supabase, supabaseUser.id, profile);
                  if (streakResult !== null && streakResult !== undefined) {
                    // Only update if calculation returns a valid value
                    finalStreak = streakResult;
                    profile.currentStreak = finalStreak; // Update camelCase property (database column is "currentStreak")
                    (profile as any).last_login_date = todayString;
                    console.log('AuthContext: Streak calculation result:', finalStreak);
                  } else {
                    // If calculation fails, keep database value
                    console.warn('AuthContext: Streak calculation returned null/undefined, keeping database value:', finalStreak);
                  }
                }
              } else {
                // Handle First Login: If last_login_date is empty or null, run streak initialization
                console.log('AuthContext: last_login_date is empty/null, initializing streak...');
                const streakResult = await checkAndUpdateStreak(supabase, supabaseUser.id, profile);
                if (streakResult !== null && streakResult !== undefined) {
                  finalStreak = streakResult;
                  profile.currentStreak = finalStreak; // Update camelCase property (database column is "currentStreak")
                  (profile as any).last_login_date = todayString;
                  console.log('AuthContext: Streak initialized to', finalStreak);
                }
              }
              
              // Verify Mapping: Ensure the code says setUser with currentStreak (camelCase) from profile.currentStreak
              // Fix Race Condition: Only call setUser after fetchProfile and streak calculation have completed
              const streakForUI = finalStreak ?? 0; // Only default to 0 for UI display if value is null/undefined
              console.log('AuthContext: Setting user state with streak:', streakForUI, '(raw value:', finalStreak, ', profile.currentStreak:', profile.currentStreak, ')');
              
              // Verify Mapping: Map profile.currentStreak (camelCase) to currentStreak (camelCase in user object)
              setUser({
                id: supabaseUser.id,
                email: supabaseUser.email || '',
                fullName: profile.full_name || undefined,
                profileIcon: profile.profile_icon || undefined,
                initialHandicap: 0,
                createdAt: profile.created_at || supabaseUser.created_at,
                currentStreak: streakForUI, // Verify Mapping: Use profile.currentStreak (camelCase) from profileData
              });
              
              // Sync the State: Log the final streak value for verification
              console.log('AuthContext: UI Syncing Streak - Final value set in user state:', streakForUI, 'profile.currentStreak:', profile.currentStreak);
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
          // Even if profile fetch fails, set user state so the rest of the app (like Navbar) can mount
          console.error("AuthContext: Error checking auth:", error);
          console.warn("AuthContext: Continuing to load app despite auth error");
          
          // Fix State Initialization: Ensure the profile state is not being pre-filled with a default object containing current_streak: 0. It should be null until the database responds.
          if (supabaseUser) {
            console.warn('AuthContext: Profile fetch failed, but supabaseUser exists - setting minimal user state without streak');
            // Don't use hardcoded names - use undefined until profile loads
            setUser({
              id: supabaseUser.id,
              email: supabaseUser.email || '',
              fullName: undefined, // No hardcoded fallback, will be set when profile loads
              profileIcon: undefined,
              initialHandicap: 0,
              createdAt: supabaseUser.created_at,
              currentStreak: undefined, // Fix State Initialization: Don't default to 0, use undefined until database responds
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
            // Identify the Failure: Locate the fetchProfile call inside the Auth listener
            // Check the ID: Log the user.id right before the fetch to ensure we are actually looking for a valid UUID
            console.log('AuthContext: onAuthStateChange - Fetching profile for user ID:', session.user.id, '(Type:', typeof session.user.id, ')');
            
            // Force the Column Name: Wrap the column in double quotes exactly like this: "currentStreak". This prevents the Supabase client or Postgres from automatically lower-casing it.
            let { data: profile, error: profileError } = await supabase
              .from('profiles')
              .select('id, full_name, profile_icon, created_at, last_login_date, "currentStreak"')
              .eq('id', session.user.id) // Fix the Query: Use session.user.id which matches auth.uid()
              .single();
            
            // Fix the 'null' Profile: If profile data exists, use it even if there's an error
            // Update Mapping: Ensure we use profile.currentStreak (camelCase) from the data
            if (profile) {
              // Update Mapping: Map currentStreak from profile data
              profile = {
                ...profile,
                currentStreak: profile.currentStreak || 0
              };
              console.log('AuthContext: onAuthStateChange - Profile data loaded:', {
                full_name: profile.full_name,
                currentStreak: profile.currentStreak
              });
              // Clear error if we have data - data takes precedence
              if (profileError) {
                console.warn('AuthContext: onAuthStateChange - Profile fetch returned data but also had an error:', profileError.message);
                profileError = null;
              }
            } else if (profileError) {
              // Add Detailed Error Logging: Log the full error object from Supabase, including error.message, error.hint, and error.details
              console.error('❌ AuthContext: onAuthStateChange PROFILE FETCH ERROR:');
              console.error('   Error Code:', profileError.code);
              console.error('   Error Message:', profileError.message);
              console.error('   Error Details:', profileError.details);
              console.error('   Error Hint:', profileError.hint);
              console.error('   Full Error Object:', profileError);
              console.error('   User ID:', session.user.id);
              console.error('   This could be: RLS policy blocking access, missing column, or query syntax issue');
            }

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
              } else if (newProfile) {
                // Fix TypeScript: Ensure profile includes all required properties (id, last_login_date, currentStreak)
                profile = {
                  ...newProfile,
                  id: session.user.id,
                  currentStreak: (newProfile as any)?.currentStreak || 0,
                  last_login_date: (newProfile as any)?.last_login_date || null
                };
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
                // Fix TypeScript: Ensure profile includes all required properties (id, last_login_date, currentStreak)
                profile = {
                  ...newProfile,
                  id: session.user.id,
                  currentStreak: (newProfile as any)?.currentStreak || 0,
                  last_login_date: (newProfile as any)?.last_login_date || null
                };
                console.log('AuthContext: Profile created successfully (fallback)');
              }
            }

            // Retry Logic: Ensure that setUser isn't called with null data - verify profile exists before setting user state
            // Verify Mapping: Map profile data with currentStreak property
            if (profile) {
              // Update Mapping: Ensure the code that sets the user state uses data.currentStreak instead of data.current_streak
              // The database column is "currentStreak" (camelCase), not current_streak (snake_case)
              const profileData = { 
                ...profile, 
                currentStreak: profile.currentStreak || 0 
              };
              
              // Retry Logic: Only set user state if profile data is successfully loaded
              setUser({
                id: session.user.id,
                email: session.user.email || '',
                fullName: profileData.full_name || undefined,
                profileIcon: profileData.profile_icon,
                initialHandicap: 0,
                createdAt: profileData.created_at || session.user.created_at,
                currentStreak: profileData.currentStreak, // Verify Mapping: Include currentStreak from profile
              });
              setIsAuthenticated(true);
              console.log('AuthContext: User authenticated and profile loaded with currentStreak:', profileData.currentStreak);
            } else if (profileError) {
              // Stop Partial Loading: If profile fetch fails, don't set user state with partial data
              console.error('❌ AuthContext: Profile fetch failed in onAuthStateChange - NOT setting user state with partial data');
              console.error('   Error details logged above - investigate the actual error');
              // Don't set user state if profile fetch failed - this prevents loading with partial data
            }
          } catch (error) {
            // Stop Partial Loading: Log the actual error instead of silently continuing
            console.error('❌ AuthContext: EXCEPTION in onAuthStateChange profile fetch:');
            console.error('   Error:', error);
            console.error('   Error Message:', (error as Error)?.message);
            console.error('   User ID:', session.user.id);
            // Don't set user state with partial data - let the error propagate or retry
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


