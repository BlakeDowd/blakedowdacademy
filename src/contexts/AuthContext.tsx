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
  refreshUser: () => Promise<void>;
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

        // Fetch user profile with initialHandicap and full_name from profiles table
        const { data: profile } = await supabase
          .from('profiles')
          .select('initial_handicap, full_name, created_at')
          .eq('id', supabaseUser.id)
          .single();

        setUser({
          id: supabaseUser.id,
          email: supabaseUser.email || '',
          fullName: profile?.full_name,
          initialHandicap: profile?.initial_handicap,
          createdAt: profile?.created_at || supabaseUser.created_at,
        });
        setIsAuthenticated(true);
      } catch (error) {
        console.error("Error checking auth:", error);
        setUser(null);
        setIsAuthenticated(false);
      } finally {
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
        // Fetch user profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('initial_handicap, full_name, created_at')
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

      const { data: profile } = await supabase
        .from('profiles')
        .select('initial_handicap, full_name, created_at')
        .eq('id', supabaseUser.id)
        .single();

      setUser((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          fullName: profile?.full_name,
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
      // Fetch user profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('initial_handicap, full_name, created_at')
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

