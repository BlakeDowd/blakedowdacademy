"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";

interface User {
  email: string;
  initialHandicap: number;
  createdAt: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, initialHandicap: number) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Check authentication status on mount
    if (typeof window !== "undefined") {
      const authStatus = localStorage.getItem("isAuthenticated");
      const userData = localStorage.getItem("user");

      if (authStatus === "true" && userData) {
        try {
          setUser(JSON.parse(userData));
          setIsAuthenticated(true);
        } catch (e) {
          console.error("Error parsing user data:", e);
          localStorage.removeItem("user");
          localStorage.removeItem("isAuthenticated");
        }
      }
      setLoading(false);
    }
  }, []);

  // Redirect to login if not authenticated (except on login page)
  useEffect(() => {
    if (!loading && !isAuthenticated && pathname !== "/login") {
      router.push("/login");
    }
  }, [isAuthenticated, loading, pathname, router]);

  const login = async (email: string, password: string) => {
    // In a real app, you'd make an API call here
    const savedUser = localStorage.getItem("user");
    if (!savedUser) {
      throw new Error("No account found. Please sign up first.");
    }

    const userData = JSON.parse(savedUser);
    if (userData.email !== email) {
      throw new Error("Invalid email or password");
    }

    // In a real app, verify password here
    localStorage.setItem("isAuthenticated", "true");
    setUser(userData);
    setIsAuthenticated(true);
    router.push("/");
  };

  const signup = async (email: string, password: string, initialHandicap: number) => {
    // In a real app, you'd make an API call here
    const userData: User = {
      email,
      initialHandicap,
      createdAt: new Date().toISOString(),
    };

    localStorage.setItem("user", JSON.stringify(userData));
    localStorage.setItem("isAuthenticated", "true");
    localStorage.setItem("initialHandicap", initialHandicap.toString());
    
    setUser(userData);
    setIsAuthenticated(true);
    router.push("/");
  };

  const logout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("isAuthenticated");
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

