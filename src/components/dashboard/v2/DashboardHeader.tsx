/**
 * Dashboard header — title, greeting, account selector and market status.
 *
 * Notifications and the profile menu live in the global topbar; they are not
 * duplicated here.
 */

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { PageTitle } from "@/components/dashboard/v2/primitives";
import { MarketStatusBadge } from "@/components/market/MarketStatusBadge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { listAccounts } from "@/lib/paper-trading.functions";

const ACCOUNT_KEY = "th_paper_account";

function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function DashboardHeader() {
  const { profile, user } = useAuth();
  const fetchAccounts = useServerFn(listAccounts);
  const { data: accounts } = useQuery({
    queryKey: ["paper", "accounts"],
    queryFn: () => fetchAccounts(),
    staleTime: 60_000,
  });

  const [accountId, setAccountId] = useState<string | null>(null);
  useEffect(() => {
    if (!accounts?.length) return;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(ACCOUNT_KEY);
    } catch {
      /* storage unavailable */
    }
    const valid = accounts.find((a) => a.id === stored) ?? accounts[0];
    setAccountId(valid.id);
  }, [accounts]);

  const onSelect = (id: string) => {
    setAccountId(id);
    try {
      window.localStorage.setItem(ACCOUNT_KEY, id);
    } catch {
      /* storage unavailable */
    }
  };

  const name = profile?.display_name || profile?.username || user?.email?.split("@")[0] || "Trader";

  return (
    <header className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <PageTitle>Dashboard</PageTitle>
        <p className="mt-1 truncate text-sm text-muted-foreground">
          {greeting()}, {name}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {accounts && accounts.length > 0 ? (
          <Select value={accountId ?? undefined} onValueChange={onSelect}>
            <SelectTrigger className="h-9 w-[190px] rounded-xl border-border/50 bg-card text-sm">
              <SelectValue placeholder="Select account" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <MarketStatusBadge market="forex" className="h-9 rounded-xl px-3" />
      </div>
    </header>
  );
}
