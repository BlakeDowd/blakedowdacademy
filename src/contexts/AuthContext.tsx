"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { User as SupabaseUser } from "@supabase/supabase-js";

interface User {
  id: string;
  email: string;
  fullName?: string;
  display_name?: string;
  name?: string;
  initialHandicap?: number;
  createdAt?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, fullName: string, initialHandicap: number) => Promise<void>;
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
        try {
          // Try getSession() first (more reliable for client-side auth)
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();
          
          let supabaseUser = session?.user || null;
          let authError = sessionError;
          
          // Fallback to getUser() if session is null
          if (!supabaseUser) {
            const { data: { user: getUserResult }, error: getUserError } = await supabase.auth.getUser();
            supabaseUser = getUserResult;
            authError = getUserError;
          }
          
          if (authError || !supabaseUser) {
            console.warn('AuthContext: No authenticated user found', { sessionError, authError });
            setUser(null);
            setIsAuthenticated(false);
            setLoading(false);
            return;
          }
          
          console.log('AuthContext: User authenticated via', session ? 'getSession()' : 'getUser()', supabaseUser.id);
          console.log('AuthContext: Fetching user profile...');

          // Fetch user profile with initialHandicap and full_name from profiles table
          let { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('initial_handicap, full_name, display_name, name, created_at')
            .eq('id', supabaseUser.id)
            .single();

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
              .select('initial_handicap, full_name, display_name, name, created_at')
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
              .select('initial_handicap, full_name, display_name, name, created_at')
              .single();
            
            if (!createError && newProfile) {
              profile = newProfile;
              console.log('AuthContext: Profile created successfully (fallback)');
            }
          }

          // Set user with profile data from profiles table
          setUser({
            id: supabaseUser.id,
            email: supabaseUser.email || '',
            fullName: profile?.full_name, // Fetch from profiles.full_name
            display_name: profile?.display_name,
            name: profile?.name,
            initialHandicap: profile?.initial_handicap,
            createdAt: profile?.created_at || supabaseUser.created_at,
          });
          setIsAuthenticated(true);
          console.log('AuthContext: Initial check complete, user loaded');
        } catch (error) {
          console.error("AuthContext: Error checking auth:", error);
          setUser(null);
          setIsAuthenticated(false);
        } finally {
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
            // Fetch user profile
            let { data: profile, error: profileError } = await supabase
              .from('profiles')
              .select('initial_handicap, full_name, display_name, name, created_at')
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
                .select('initial_handicap, full_name, display_name, name, created_at')
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
                .select('initial_handicap, full_name, display_name, name, created_at')
                .single();
              
              if (!createError && newProfile) {
                profile = newProfile;
                console.log('AuthContext: Profile created successfully (fallback)');
              }
            }

            // Set user with profile data from profiles table
            setUser({
              id: session.user.id,
              email: session.user.email || '',
              fullName: profile?.full_name, // Fetch from profiles.full_name
              display_name: profile?.display_name,
              name: profile?.name,
              initialHandicap: profile?.initial_handicap,
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

      let { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('initial_handicap, full_name, display_name, name, created_at')
        .eq('id', supabaseUser.id)
        .single();

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
          .select('initial_handicap, full_name, display_name, name, created_at')
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
          .select('initial_handicap, full_name, display_name, name, created_at')
          .single();
        
        if (!createError && newProfile) {
          profile = newProfile;
          console.log('refreshUser: Profile created successfully (fallback)');
        }
      }

      setUser((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          fullName: profile?.full_name,
          display_name: profile?.display_name,
          name: profile?.name,
          initialHandicap: profile?.initial_handicap,
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
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('initial_handicap, full_name, display_name, name, created_at')
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
            .select('initial_handicap, full_name, display_name, name, created_at')
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
            .select('initial_handicap, full_name, display_name, name, created_at')
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

      setUser({
        id: data.user.id,
        email: data.user.email || '',
        fullName: profile?.full_name,
        display_name: profile?.display_name,
        name: profile?.name,
        initialHandicap: profile?.initial_handicap,
        createdAt: profile?.created_at || data.user.created_at,
      });
      setIsAuthenticated(true);
      // Note: Redirect handled by login page using window.location.assign
    }
  };

  const signup = async (email: string, password: string, fullName: string, initialHandicap: number) => {
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
        // Create user profile with fullName and initialHandicap
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: data.user.id,
            full_name: fullName,
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

