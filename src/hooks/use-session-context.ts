import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAccounts } from "@/lib/paper-trading.functions";
import { listReplaySessions } from "@/lib/replay.functions";
import { listPropChallenges } from "@/lib/prop-challenges.functions";
import { listBattles } from "@/lib/battle-arena.functions";

export type SessionContextType = "paper" | "replay" | "prop" | "arena";

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
    if (typeof window === "undefined") return { type: "paper", id: null };
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    return { type: "paper", id: null };
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

  // Set default account if none selected for paper
  useEffect(() => {
    if (context.type === "paper" && !context.id && accounts.data?.length) {
      setContext({ type: "paper", id: accounts.data[0].id, label: accounts.data[0].name });
    }
  }, [accounts.data, context.type, context.id]);

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
