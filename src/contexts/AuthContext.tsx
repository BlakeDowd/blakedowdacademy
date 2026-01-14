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

          // Fetch user profile with full_name and profile_icon from profiles table
          // Remove Database Dependency: Removed initial_handicap from .select() to avoid database dependency
          // Force: ONLY use full_name column
          // Check Academy Fetch: Log exactly what full_name strings are being returned from the database
          console.log('AuthContext: Fetching profile for user ID:', supabaseUser.id);
          
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
              console.log('AuthContext: Profile found - full_name:', profile.full_name);
              console.log('AuthContext: Profile found - profile_icon:', profile.profile_icon);
            } else {
              console.log('AuthContext: No profile found for user ID:', supabaseUser.id);
            }
            
            if (profileError) {
              console.error('AuthContext: Profile fetch error:', profileError);
              console.error('AuthContext: Error code:', profileError.code);
              console.error('AuthContext: Error message:', profileError.message);
              // Make Handicap Optional: If profile fetch fails, continue anyway - don't block app load
              console.warn('AuthContext: Profile fetch failed, but continuing to load app with partial data');
            }
          } catch (fetchError) {
            // Make Handicap Optional: Catch any errors and continue - don't block app load
            console.error('AuthContext: Exception during profile fetch:', fetchError);
            console.warn('AuthContext: Continuing to load app despite profile fetch error');
            profileError = fetchError;
          }

          // Auto-create profile if it doesn't exist (id matches auth.uid())
          if (profileError && (profileError.code === 'PGRST116' || profileError.message?.includes('No rows'))) {
            console.log('AuthContext: Profile not found, creating new profile with id:', supabaseUser.id);
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
              console.error('AuthContext: Error creating profile:', createError);
            } else {
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
              })
              .select('full_name, profile_icon, created_at')
              .single();
            
            if (!createError && newProfile) {
              profile = newProfile;
              console.log('AuthContext: Profile created successfully (fallback)');
            }
          }

          // Verify Data Source: Force it to display profile?.full_name || user.email
          // Hard-Code Defaults: Manually set initialHandicap: 0 instead of getting it from database
          // Force full_name: Set user with profile data from profiles table
          // ONLY use full_name column, no fallbacks to email or other columns
          // Hard-Code Profile: If profile fetch fails, use hard-coded values
          console.log('AuthContext: Setting user with full_name:', profile?.full_name);
          setUser({
            id: supabaseUser.id,
            email: supabaseUser.email || '',
            fullName: profile?.full_name || 'Blake (Bypassed)', // Hard-Code Profile: Set hard-coded name if profile fetch fails
            profileIcon: profile?.profile_icon || undefined, // Golf icon selected by student
            initialHandicap: 0, // Hard-Code Defaults: Manually set to 0 instead of getting from database
            createdAt: profile?.created_at || supabaseUser.created_at,
          });
          console.log('AuthContext: Initial check complete, user loaded (even if profile fetch had errors)');
        } catch (error) {
          // Bypass Profile Errors: Even if profile fetch fails, set user state so the rest of the app (like Navbar) can mount
          console.error("AuthContext: Error checking auth:", error);
          console.warn("AuthContext: Continuing to load app despite auth error");
          
          // Bypass Profile Errors: If we got supabaseUser before the error, set user with minimal data
          // Hard-Code Profile: If profile fetch fails, manually set user.fullName to 'Blake (Bypassed)' and initialHandicap to 0
          if (supabaseUser) {
            console.log('AuthContext: Setting user with hard-coded profile data (bypassed) despite error');
            setUser({
              id: supabaseUser.id,
              email: supabaseUser.email || '',
              fullName: 'Blake (Bypassed)', // Hard-Code Profile: Set hard-coded name if profile fetch fails
              profileIcon: undefined,
              initialHandicap: 0, // Hard-Code Profile: Set to 0 if profile fetch fails
              createdAt: supabaseUser.created_at,
            });
            setIsAuthenticated(true);
            console.log('AuthContext: User state set with hard-coded profile data - app can mount');
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

