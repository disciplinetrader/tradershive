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
  first_name: string | null;
  last_name: string | null;
  country: string | null;
  timezone: string | null;
  experience: string | null;
  preferred_market: string | null;
  trading_style: string | null;
  preferred_markets: string[] | null;
  goals: string[] | null;
  level: number;
  xp: number;
  coins: number;
  league: string;
  streak: number;
  rank: number | null;
  onboarded: boolean;
  is_premium: boolean;
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

// Note: `email` is intentionally omitted here — column-level SELECT is revoked
// for the `authenticated` role to prevent PII leakage across users. The email
// is populated from the authenticated Supabase session below.
const PROFILE_COLUMNS =
  "id, username, display_name, avatar_url, first_name, last_name, country, timezone, experience, preferred_market, trading_style, preferred_markets, goals, level, xp, coins, league, streak, rank, onboarded, is_premium";

async function loadUserData(userId: string, email: string | null) {
  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", userId)
      .maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);
  return {
    profile: profile ? ({ ...(profile as any), email } as Profile) : null,
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
    const { profile, roles } = await loadUserData(nextSession.user.id, nextSession.user.email ?? null);
    setProfile(profile);
    setRoles(roles);
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
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
    const { profile, roles } = await loadUserData(session.user.id, session.user.email ?? null);
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
        (profile?.is_premium ?? false) ||
        roles.includes("premium") ||
        roles.includes("admin") ||
        roles.includes("moderator"),
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
