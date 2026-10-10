/**
 * Supabase Auth & Real-Time Identity Provider for RIFT
 *
 * Provides shared authentication across RIFT and RIFT Bank:
 * - Supabase Auth session management (login, signup, logout)
 * - User profile & Trust score synchronization
 * - Live real-time stream of security findings attributed to the user
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { User, Session } from "@supabase/supabase-js";
import {
  getSupabaseClient,
  getUserTrustProfile,
  fetchUserSecurityFindings,
  type SupabaseSecurityFinding,
  type SupabaseTrustProfile,
} from "./supabase";

export interface AuthContextType {
  user: User | null;
  session: Session | null;
  trustProfile: SupabaseTrustProfile | null;
  securityFindings: SupabaseSecurityFinding[];
  unreadFindingsCount: number;
  isLoading: boolean;
  signIn: (email: string, password?: string) => Promise<{ error?: string }>;
  signUp: (email: string, password?: string, fullName?: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  quickLogin: (email: string) => Promise<{ error?: string }>;
  refreshFindings: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Default demo users present in the shared database
export const DEMO_USERS = [
  {
    id: "1ca32bb1-839a-4d04-9e06-1ed9cc5432c8",
    email: "vishwafaldu119@gmail.com",
    name: "Vishwa Faldu (Sender)",
    role: "Institutional Officer",
  },
  {
    id: "cf1c80fb-1a06-4a9f-9a03-e76f44c92878",
    email: "ritesh2445m@gmail.com",
    name: "Ritesh M (Receiver)",
    role: "Liquidity Provider",
  },
  {
    id: "b7115c66-da8b-4d61-b802-0c42451632e6",
    email: "shrutikaughade2606@gmail.com",
    name: "Shrutika Ughade",
    role: "Risk Analyst",
  },
];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [trustProfile, setTrustProfile] = useState<SupabaseTrustProfile | null>(null);
  const [securityFindings, setSecurityFindings] = useState<SupabaseSecurityFinding[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const supabase = getSupabaseClient();

  const loadUserData = useCallback(async (userId: string) => {
    try {
      // 1. Fetch trust profile
      const tp = await getUserTrustProfile(userId);
      if (tp) setTrustProfile(tp);

      // 2. Fetch security findings attributed to this user
      const findings = await fetchUserSecurityFindings(userId);
      setSecurityFindings(findings);
    } catch (err) {
      console.warn("[Auth] Error loading user data:", err);
    }
  }, []);

  const refreshFindings = useCallback(async () => {
    if (!user) return;
    try {
      const findings = await fetchUserSecurityFindings(user.id);
      setSecurityFindings(findings);
    } catch {
      // Ignore
    }
  }, [user]);

  // Initialize and check current session
  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        if (data.session) {
          setSession(data.session);
          setUser(data.session.user);
          await loadUserData(data.session.user.id);
        } else {
          // If no active session, auto-select the primary demo user for seamless demonstration
          const savedUserId = typeof window !== "undefined" ? window.localStorage.getItem("rift-demo-user-id") : null;
          const target = DEMO_USERS.find((u) => u.id === savedUserId) || DEMO_USERS[0]!;
          const mockUser: User = {
            id: target.id,
            email: target.email,
            app_metadata: {},
            user_metadata: { full_name: target.name, role: target.role },
            aud: "authenticated",
            created_at: new Date().toISOString(),
          };
          setUser(mockUser);
          await loadUserData(target.id);
        }
      } catch (e) {
        console.warn("[Auth] Failed to initialize auth session:", e);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    initAuth();

    // Listen to Supabase Auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!mounted) return;
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        await loadUserData(newSession.user.id);
      }
    });

    return () => {
      mounted = false;
      authListener?.subscription.unsubscribe();
    };
  }, [loadUserData, supabase]);

  // Periodic polling for new security findings (real-time alert stream)
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      refreshFindings();
    }, 5000);
    return () => clearInterval(interval);
  }, [user, refreshFindings]);

  // Sign In with email & password
  const signIn = async (email: string, password = "password123"): Promise<{ error?: string }> => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        // If password login fails, check if email matches a demo user
        const demo = DEMO_USERS.find((u) => u.email.toLowerCase() === email.toLowerCase());
        if (demo) {
          return quickLogin(demo.email);
        }
        return { error: error.message };
      }
      setSession(data.session);
      setUser(data.user);
      if (data.user) {
        await loadUserData(data.user.id);
      }
      return {};
    } catch (err: unknown) {
      return { error: err instanceof Error ? err.message : "Sign in failed" };
    } finally {
      setIsLoading(false);
    }
  };

  // Sign Up with email & password
  const signUp = async (
    email: string,
    password = "password123",
    fullName = "RIFT User",
  ): Promise<{ error?: string }> => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
        },
      });
      if (error) return { error: error.message };
      if (data.user) {
        setUser(data.user);
        setSession(data.session);
        await loadUserData(data.user.id);
      }
      return {};
    } catch (err: unknown) {
      return { error: err instanceof Error ? err.message : "Sign up failed" };
    } finally {
      setIsLoading(false);
    }
  };

  // Quick Login / Switch to any demo user (Vishwa, Ritesh, Shrutika)
  const quickLogin = async (email: string): Promise<{ error?: string }> => {
    const target = DEMO_USERS.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!target) return { error: "User not found in demo directory" };

    if (typeof window !== "undefined") {
      window.localStorage.setItem("rift-demo-user-id", target.id);
    }

    const mockUser: User = {
      id: target.id,
      email: target.email,
      app_metadata: {},
      user_metadata: { full_name: target.name, role: target.role },
      aud: "authenticated",
      created_at: new Date().toISOString(),
    };
    setUser(mockUser);
    await loadUserData(target.id);
    return {};
  };

  // Sign out
  const signOut = async () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("rift-demo-user-id");
    }
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setTrustProfile(null);
    setSecurityFindings([]);
  };

  const unreadFindingsCount = securityFindings.filter((f) => f.status === "OPEN").length;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        trustProfile,
        securityFindings,
        unreadFindingsCount,
        isLoading,
        signIn,
        signUp,
        signOut,
        quickLogin,
        refreshFindings,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
