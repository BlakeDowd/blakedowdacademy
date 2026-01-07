"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { User as SupabaseUser } from "@supabase/supabase-js";

interface User {
  id: string;
  email: string;
  fullName?: string;
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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  
  // Only create Supabase client if env vars are available
  let supabase: ReturnType<typeof createClient> | null = null;
  if (typeof window !== 'undefined' && 
      process.env.NEXT_PUBLIC_SUPABASE_URL && 
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
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

      try {
        const { data: { user: supabaseUser }, error } = await supabase.auth.getUser();
        
        if (error || !supabaseUser) {
          setUser(null);
          setIsAuthenticated(false);
          setLoading(false);
          return;
        }

        // Fetch user profile with timeout and error handling
        let profileName = 'New Member'; // Default value
        let initialHandicap = null;
        let createdAt = supabaseUser.created_at;
        
        try {
          // Force stop: Set isLoading to false if fetch takes longer than 2 seconds
          const fetchPromise = supabase
            .from('profiles')
            .select('full_name, profile_icon, initial_handicap, created_at, updated_at')
            .eq('id', supabaseUser.id)
            .single();
          
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Profile fetch timeout')), 2000)
          );
          
          const result = await Promise.race([
            fetchPromise,
            timeoutPromise
          ]) as { data: any; error: any };
          
          if (result.error) {
            console.error('Error fetching profile in AuthContext:', result.error);
            profileName = 'New Member'; // Default value
          } else {
            // Default Value: If full_name is missing or null, explicitly set it to 'New Member'
            profileName = result.data?.full_name || 'New Member';
            initialHandicap = result.data?.initial_handicap;
            createdAt = result.data?.created_at || supabaseUser.created_at;
          }
        } catch (fetchError: any) {
          console.error('Profile fetch error or timeout in AuthContext:', fetchError);
          profileName = 'New Member'; // Default value
        }

        setUser({
          id: supabaseUser.id,
          email: supabaseUser.email || '',
          fullName: profileName,
          initialHandicap: initialHandicap,
          createdAt: createdAt,
        });
        setIsAuthenticated(true);
      } catch (error) {
        console.error("Error checking auth:", error);
        setUser(null);
        setIsAuthenticated(false);
      } finally {
        // Force stop: Always set loading to false
        setLoading(false);
      }
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
      if (session?.user) {
        // Fetch user profile - changing columns forces Next.js to bypass cache
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, profile_icon, initial_handicap, created_at, updated_at')
          .eq('id', session.user.id)
          .single();

        setUser({
          id: session.user.id,
          email: session.user.email || '',
          fullName: profile?.full_name,
          initialHandicap: profile?.initial_handicap,
          createdAt: profile?.created_at || session.user.created_at,
        });
        setIsAuthenticated(true);
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
      setLoading(false);
    });

    // Listen for profile updates
    const handleProfileUpdate = async () => {
      if (!supabase) return;
      
      try {
        const { data: { user: supabaseUser } } = await supabase.auth.getUser();
        if (supabaseUser) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, profile_icon, initial_handicap, created_at, updated_at')
            .eq('id', supabaseUser.id)
            .single();

          setUser({
            id: supabaseUser.id,
            email: supabaseUser.email || '',
            fullName: profile?.full_name,
            initialHandicap: profile?.initial_handicap,
            createdAt: profile?.created_at || supabaseUser.created_at,
          });
        }
      } catch (error) {
        console.error("Error refreshing profile:", error);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('profileUpdated', handleProfileUpdate);
    }

    return () => {
      subscription.unsubscribe();
      if (typeof window !== 'undefined') {
        window.removeEventListener('profileUpdated', handleProfileUpdate);
      }
    };
  }, [supabase]);

  // Redirect to login if not authenticated (except on login page)
  useEffect(() => {
    if (!loading && !isAuthenticated && pathname !== "/login") {
      router.push("/login");
    }
  }, [isAuthenticated, loading, pathname, router]);

  const login = async (email: string, password: string) => {
    if (!supabase) {
      throw new Error('Supabase is not configured. Please set environment variables.');
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw new Error(error.message || "Invalid email or password");
    }

    if (data.user) {
      // Fetch user profile - changing columns forces Next.js to bypass cache
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, profile_icon, initial_handicap, created_at, updated_at')
        .eq('id', data.user.id)
        .single();

      setUser({
        id: data.user.id,
        email: data.user.email || '',
        fullName: profile?.full_name,
        initialHandicap: profile?.initial_handicap,
        createdAt: profile?.created_at || data.user.created_at,
      });
      setIsAuthenticated(true);
      router.push("/");
    }
  };

  const signup = async (email: string, password: string, fullName: string, initialHandicap: number) => {
    if (!supabase) {
      throw new Error('Supabase is not configured. Please set environment variables.');
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      throw new Error(error.message || "Failed to create account");
    }

      if (data.user && supabase) {
        // Create user profile with full_name and initialHandicap
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
        fullName: fullName,
        initialHandicap,
        createdAt: data.user.created_at,
      });
      setIsAuthenticated(true);
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

