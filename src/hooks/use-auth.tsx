import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/constants";

export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  level: number;
  xp: number;
  coins: number;
  league: string;
  streak: number;
  rank: number | null;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  roles: AppRole[];
  loading: boolean;
  isAdmin: boolean;
  isModerator: boolean;
  isPremium: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function loadUserData(userId: string) {
  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, display_name, email, avatar_url, level, xp, coins, league, streak, rank")
      .eq("id", userId)
      .maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);
  return {
    profile: (profile ?? null) as Profile | null,
    roles: (roles?.map((r) => r.role) ?? []) as AppRole[],
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  const hydrate = useCallback(async (nextSession: Session | null) => {
    setSession(nextSession);
    if (!nextSession?.user) {
      setProfile(null);
      setRoles([]);
      return;
    }
    const { profile, roles } = await loadUserData(nextSession.user.id);
    setProfile(profile);
    setRoles(roles);
  }, []);

  useEffect(() => {
    // 1) subscribe first
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      // Only react to identity changes; ignore token refreshes / init.
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        // Defer supabase calls to avoid deadlocks in listener
        setTimeout(() => {
          void hydrate(next);
        }, 0);
        if (event === "SIGNED_OUT") {
          queryClient.clear();
        } else {
          queryClient.invalidateQueries();
        }
      }
    });

    // 2) then read existing session
    void supabase.auth.getSession().then(async ({ data }) => {
      await hydrate(data.session);
      setLoading(false);
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [hydrate, queryClient]);

  const refresh = useCallback(async () => {
    if (!session?.user) return;
    const { profile, roles } = await loadUserData(session.user.id);
    setProfile(profile);
    setRoles(roles);
  }, [session?.user]);

  const signOut = useCallback(async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      roles,
      loading,
      isAdmin: roles.includes("admin"),
      isModerator: roles.includes("moderator") || roles.includes("admin"),
      isPremium:
        roles.includes("premium") || roles.includes("admin") || roles.includes("moderator"),
      signOut,
      refresh,
    }),
    [session, profile, roles, loading, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
