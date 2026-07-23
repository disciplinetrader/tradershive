import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  user_id: string;
  rank?: number | null;
  previous_rank?: number | null;
  pnl?: number;
  r_multiple?: number;
  win_rate?: number;
  profit_factor?: number;
  max_drawdown?: number;
  total_trades?: number;
  consistency_score?: number;
  eligible?: boolean;
  last_trade_at?: string | null;
};

type Profile = { id: string; username?: string | null; display_name?: string | null; avatar_url?: string | null; country?: string | null };

const PAGE = 25;

/**
 * Enhanced tournament leaderboard with search, filter, pagination, top-movers,
 * and a sticky "my position" row pinned above the paginated body.
 */
export function LeaderboardTable({
  rows,
  profiles,
  currentUserId,
}: {
  rows: Row[];
  profiles: Profile[];
  currentUserId?: string | null;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "eligible" | "top10" | "top50" | "top100">("all");
  const [page, setPage] = useState(1);

  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  const filtered = useMemo(() => {
    let out = rows;
    if (status === "eligible") out = out.filter((r) => r.eligible);
    if (status === "top10") out = out.filter((r) => (r.rank ?? Infinity) <= 10);
    if (status === "top50") out = out.filter((r) => (r.rank ?? Infinity) <= 50);
    if (status === "top100") out = out.filter((r) => (r.rank ?? Infinity) <= 100);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      out = out.filter((r) => {
        const p = profileMap.get(r.user_id);
        return (
          (p?.display_name ?? "").toLowerCase().includes(needle) ||
          (p?.username ?? "").toLowerCase().includes(needle) ||
          (p?.country ?? "").toLowerCase().includes(needle)
        );
      });
    }
    return out;
  }, [rows, status, q, profileMap]);

  const movers = useMemo(() => {
    return [...rows]
      .filter((r) => r.previous_rank != null && r.rank != null)
      .map((r) => ({ ...r, delta: (r.previous_rank ?? 0) - (r.rank ?? 0) }))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 5);
  }, [rows]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const currentPage = Math.min(page, pages);
  const paged = filtered.slice((currentPage - 1) * PAGE, currentPage * PAGE);

  const myRow = currentUserId ? rows.find((r) => r.user_id === currentUserId) : null;
  const myOnPage = paged.some((r) => r.user_id === currentUserId);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-8"
            placeholder="Search trader or country…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select value={status} onValueChange={(v) => { setStatus(v as any); setPage(1); }}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All traders</SelectItem>
            <SelectItem value="top10">Top 10</SelectItem>
            <SelectItem value="top50">Top 50</SelectItem>
            <SelectItem value="top100">Top 100</SelectItem>
            <SelectItem value="eligible">Eligible only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {movers.length ? (
        <div className="rounded-lg border bg-card/60 p-3">
          <div className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">Top movers</div>
          <div className="flex flex-wrap gap-2">
            {movers.map((m) => {
              const p = profileMap.get(m.user_id);
              const up = m.delta > 0;
              return (
                <div
                  key={m.id}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
                    up ? "border-success/30 bg-success/10 text-success" : "border-danger/30 bg-danger/10 text-danger",
                  )}
                >
                  {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  <span className="font-medium">{p?.display_name ?? p?.username ?? "Trader"}</span>
                  <span className="font-mono">{up ? "+" : ""}{m.delta}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Rank</th>
              <th className="px-3 py-2 text-left">Trader</th>
              <th className="px-3 py-2 text-right">PnL</th>
              <th className="px-3 py-2 text-right">Win%</th>
              <th className="px-3 py-2 text-right">Avg RR</th>
              <th className="px-3 py-2 text-right">Trades</th>
              <th className="px-3 py-2 text-right">Consistency</th>
              <th className="px-3 py-2 text-right">DD</th>
              <th className="px-3 py-2 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {/* Sticky "my row" pinned above body when not visible on current page */}
            {myRow && !myOnPage ? (
              <RowView row={myRow} profile={profileMap.get(myRow.user_id)} isMe pinned />
            ) : null}
            {paged.map((r) => (
              <RowView
                key={r.id}
                row={r}
                profile={profileMap.get(r.user_id)}
                isMe={r.user_id === currentUserId}
              />
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 ? (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div>
            Showing {(currentPage - 1) * PAGE + 1}–{Math.min(currentPage * PAGE, filtered.length)} of {filtered.length}
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" disabled={currentPage === 1} onClick={() => setPage((p) => p - 1)}>
              Prev
            </Button>
            <div className="grid h-8 place-items-center rounded-md border px-3 font-mono">
              {currentPage} / {pages}
            </div>
            <Button size="sm" variant="outline" disabled={currentPage === pages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RowView({
  row,
  profile,
  isMe,
  pinned,
}: {
  row: Row;
  profile?: Profile;
  isMe?: boolean;
  pinned?: boolean;
}) {
  const trend =
    row.previous_rank != null && row.rank != null ? row.previous_rank - row.rank : 0;
  const consistency = Number(row.consistency_score ?? 0);
  const riskScore = Math.max(0, Math.min(100, Math.round((Number(row.max_drawdown ?? 0) / 1000) * 100)));
  return (
    <tr
      className={cn(
        "border-t transition hover:bg-muted/30",
        isMe && "bg-primary/5",
        pinned && "sticky top-0 z-10 border-y-2 border-primary/30 bg-primary/10 backdrop-blur",
      )}
    >
      <td className="px-3 py-2 font-mono font-semibold">
        {row.rank ? `#${row.rank}` : "—"}
        {trend > 0 ? (
          <TrendingUp className="ml-1 inline h-3 w-3 text-success" />
        ) : trend < 0 ? (
          <TrendingDown className="ml-1 inline h-3 w-3 text-danger" />
        ) : (
          <Minus className="ml-1 inline h-3 w-3 text-muted-foreground" />
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} loading="lazy" decoding="async" className="h-6 w-6 rounded-full" alt="" />
          ) : (
            <div className="h-6 w-6 rounded-full bg-muted" />
          )}
          <div className="min-w-0">
            <div className="truncate text-xs font-medium">
              {profile?.display_name ?? profile?.username ?? "Trader"}
              {isMe ? <span className="ml-1.5 rounded-sm bg-primary/20 px-1 text-[9px] uppercase text-primary">You</span> : null}
            </div>
            <div className="text-[10px] text-muted-foreground">{profile?.country ?? ""}</div>
          </div>
        </div>
      </td>
      <td
        className={cn(
          "px-3 py-2 text-right font-mono font-semibold",
          Number(row.pnl ?? 0) >= 0 ? "text-success" : "text-danger",
        )}
      >
        {Number(row.pnl ?? 0) >= 0 ? "+" : ""}${Number(row.pnl ?? 0).toFixed(0)}
      </td>
      <td className="px-3 py-2 text-right font-mono">{Number(row.win_rate ?? 0).toFixed(0)}%</td>
      <td className="px-3 py-2 text-right font-mono">{Number(row.r_multiple ?? 0).toFixed(2)}R</td>
      <td className="px-3 py-2 text-right font-mono">{row.total_trades ?? 0}</td>
      <td className="px-3 py-2 text-right font-mono">{consistency.toFixed(0)}</td>
      <td className="px-3 py-2 text-right font-mono text-muted-foreground">${Number(row.max_drawdown ?? 0).toFixed(0)}</td>
      <td className="px-3 py-2 text-center">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
            row.eligible ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
          )}
        >
          {row.eligible ? "Eligible" : `Risk ${riskScore}`}
        </span>
      </td>
    </tr>
  );
}
