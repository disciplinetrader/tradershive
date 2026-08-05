import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAccounts } from "@/lib/paper-trading.functions";
import { listReplaySessions } from "@/lib/replay.functions";
import { listPropChallenges } from "@/lib/prop-challenges.functions";
import { listBattles } from "@/lib/battle-arena.functions";

export type SessionContextType = "all" | "paper" | "replay" | "prop" | "arena";

export interface SessionContext {
  type: SessionContextType;
  id: string | null;
  label?: string;
}

const STORAGE_KEY = "th_session_context_v2";

export function useSessionContext() {
  const fetchAccounts = useServerFn(listAccounts);
  const fetchReplays = useServerFn(listReplaySessions);
  const fetchProps = useServerFn(listPropChallenges);
  const fetchBattles = useServerFn(listBattles);

  const [context, setContext] = useState<SessionContext>(() => {
    if (typeof window === "undefined") return { type: "all", id: null, label: "All Accounts" };
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    return { type: "all", id: null, label: "All Accounts" };
  });

  const accounts = useQuery({ queryKey: ["paper", "accounts"], queryFn: () => fetchAccounts() });
  const replays = useQuery({ queryKey: ["replay", "sessions"], queryFn: () => fetchReplays() });
  const props = useQuery({ queryKey: ["prop", "challenges"], queryFn: () => fetchProps() });
  const battles = useQuery({ queryKey: ["arena", "matches", "mine"], queryFn: () => fetchBattles({ data: { scope: "mine" } }) });

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(context));
    }
  }, [context]);

  // Handle default selection: Last valid -> Most recent active -> All Accounts
  useEffect(() => {
    // If we have a context loaded from localStorage, we're good
    if (context.type !== "all" && context.id) return;
    
    // If context is "all", we stay on "all" unless it was just the default initialization
    // and we want to find the most recent active account instead.
    
    if (!accounts.isPending && accounts.data && accounts.data.length > 0 && !context.id && context.type === "all") {
        // Only auto-select if there's no stored context at all
        const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
        if (!stored) {
          const recent = accounts.data[0];
          setContext({ type: "paper", id: recent.id, label: recent.name });
        }
    }
  }, [accounts.isPending, accounts.data]);

  // Priority: Most recent active -> All Accounts
  useEffect(() => {
    if (context.type === "all") return; // Keep "all" if user selected it

    // If we have no ID but we are in a specific type, or if the current ID is stale/missing
    if (!context.id && !accounts.isPending && !replays.isPending && !props.isPending && !battles.isPending) {
       // Logic for default: last valid is handled by localStorage.
       // If no localStorage, we start with "all".
    }
  }, [accounts.isPending, replays.isPending, props.isPending, battles.isPending, context.id, context.type]);

  const selectContext = (type: SessionContextType, id: string | null, label?: string) => {
    setContext({ type, id, label });
  };

  return {
    context,
    selectContext,
    accounts: accounts.data ?? [],
    replays: replays.data ?? [],
    props: props.data ?? [],
    battles: battles.data ?? [],
    isLoading: accounts.isPending || replays.isPending || props.isPending || battles.isPending,
  };
}
