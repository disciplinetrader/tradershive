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
import { DashboardSubNav } from "@/components/dashboard/v2/DashboardSubNav";
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

export function DashboardHeader({
  accountId: controlledId,
  onAccountChange,
}: {
  /** Controlled selection so the whole Dashboard reacts to the account. */
  accountId?: string | null;
  onAccountChange?: (id: string) => void;
} = {}) {
  const { profile, user } = useAuth();
  const fetchAccounts = useServerFn(listAccounts);
  const { data: accounts } = useQuery({
    queryKey: ["paper", "accounts"],
    queryFn: () => fetchAccounts(),
    staleTime: 60_000,
  });

  const [internalId, setInternalId] = useState<string | null>(null);
  const accountId = controlledId !== undefined ? controlledId : internalId;

  useEffect(() => {
    if (!accounts?.length) return;
    if (accountId) return;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(ACCOUNT_KEY);
    } catch {
      /* storage unavailable */
    }
    const valid = accounts.find((a) => a.id === stored) ?? accounts[0];
    setInternalId(valid.id);
    onAccountChange?.(valid.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts]);

  const onSelect = (id: string) => {
    setInternalId(id);
    onAccountChange?.(id);
    try {
      window.localStorage.setItem(ACCOUNT_KEY, id);
    } catch {
      /* storage unavailable */
    }
  };

  const name = profile?.display_name || profile?.username || user?.email?.split("@")[0] || "Trader";
  const dateStr = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <header className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <div className="min-w-0 space-y-3">
        <div>
          <p className="eyebrow mb-1 text-primary">{dateStr}</p>
          <PageTitle>
            {greeting()}, <span className="text-foreground/90">{name}</span>
          </PageTitle>
        </div>
        <DashboardSubNav />
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {accounts && accounts.length > 0 ? (
          <Select value={accountId ?? undefined} onValueChange={onSelect}>
            <SelectTrigger className="h-10 w-[200px] rounded-xl border-border/50 bg-card/50 text-sm backdrop-blur-sm">
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
        <MarketStatusBadge market="forex" className="h-10 rounded-xl px-4" />
      </div>
    </header>
  );
}
