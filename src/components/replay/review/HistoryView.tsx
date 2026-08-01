/**
 * Phase 8D · Replay history.
 *
 * Filters live in the URL so a filtered history is shareable and survives
 * refresh. The list is windowed: only the visible page of rows is fetched,
 * with per-session aggregates joined server-side (never N+1).
 */
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useReplayHistory, type HistoryParams } from "@/lib/replay/review/queries";
import type { HistoryRow } from "@/lib/replay/review/derive.server";

const STATUSES = ["all", "active", "paused", "completed", "abandoned"];

export function HistoryView({
  params,
  onChange,
}: {
  params: HistoryParams;
  onChange: (patch: Partial<HistoryParams>) => void;
}) {
  const q = useReplayHistory(params);
  const data = q.data as { rows: HistoryRow[]; total: number } | undefined;
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const page = Math.floor(params.offset / params.limit) + 1;
  const pages = Math.max(1, Math.ceil(total / params.limit));

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Replay history</h1>
          <p className="text-xs text-muted-foreground">Every session you have run, with its result and score.</p>
        </div>
        <Button asChild size="sm"><Link to="/replay">New replay</Link></Button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={params.search ?? ""}
          onChange={(e) => onChange({ search: e.target.value || null, offset: 0 })}
          placeholder="Search titles…"
          className="h-8 w-52 text-xs"
          aria-label="Search replay sessions"
        />
        <div className="flex gap-1">
          {STATUSES.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={(params.status ?? "all") === s ? "secondary" : "ghost"}
              onClick={() => onChange({ status: s === "all" ? null : s, offset: 0 })}
            >
              {s}
            </Button>
          ))}
        </div>
      </div>

      {q.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading history…</div>
      ) : rows.length === 0 ? (
        <Card className="space-y-3 p-8 text-center">
          <div className="font-medium">No replays match this view</div>
          <p className="text-sm text-muted-foreground">
            Run a replay session to build your practice history and unlock improvement tracking.
          </p>
          <div className="flex justify-center gap-2">
            <Button asChild><Link to="/replay">Start a replay</Link></Button>
            <Button asChild variant="secondary"><Link to="/replay/library">Browse library</Link></Button>
          </div>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border/60">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                {["Session", "Symbol", "Status", "Trades", "Net P/L", "Score", ""].map((h) => (
                  <th key={h} className="px-2 py-1.5 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border/40">
                  <td className="px-2 py-1.5">
                    <div className="font-medium">{r.title}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-2 py-1.5">{r.symbol} · {r.timeframe}</td>
                  <td className="px-2 py-1.5"><Badge variant="outline">{r.status}</Badge></td>
                  <td className="px-2 py-1.5 font-mono">{r.trade_count}</td>
                  <td className={`px-2 py-1.5 font-mono ${r.net_pnl >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                    {r.net_pnl.toFixed(2)}
                  </td>
                  <td className="px-2 py-1.5 font-mono">{r.score ?? "—"}</td>
                  <td className="px-2 py-1.5 text-right">
                    <Button asChild size="sm" variant="ghost">
                      <Link to="/replay/review" search={{ id: r.id }}>Review</Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 ? (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Page {page} of {pages}</span>
          <div className="flex gap-2">
            <Button
              size="sm" variant="secondary" disabled={params.offset === 0}
              onClick={() => onChange({ offset: Math.max(0, params.offset - params.limit) })}
            >
              Previous
            </Button>
            <Button
              size="sm" variant="secondary" disabled={page >= pages}
              onClick={() => onChange({ offset: params.offset + params.limit })}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
