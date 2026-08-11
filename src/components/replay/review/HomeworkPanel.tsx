/**
 * Phase 8D · homework and action items for one reviewed session.
 *
 * A drill is a concrete, repeatable practice instruction — same symbol and
 * timeframe as the session that exposed the weakness, so the next attempt is
 * comparable to this one.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCreateDrill } from "@/lib/replay/review/queries";

export interface HomeworkRowLite {
  id: string;
  symbol: string;
  timeframe: string;
  status: string;
  reason: string | null;
  /** The drill's focus mistake. Column is `target_mistake` on `replay_homework`
   *  (`mistake_focus` is the equivalent on `replay_comparisons` — not this table). */
  target_mistake?: string | null;
  target_r?: number | null;
  max_trades?: number | null;
}

export function HomeworkPanel({
  sessionId,
  symbol,
  market,
  timeframe,
  rows,
  suggestions,
}: {
  sessionId: string;
  symbol: string;
  market: string;
  timeframe: string;
  rows: HomeworkRowLite[];
  suggestions: string[];
}) {
  const [reason, setReason] = useState("");
  const create = useCreateDrill(sessionId);

  return (
    <Card className="space-y-3 p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Homework</div>

      {rows.length ? (
        <ul className="space-y-2">
          {rows.map((h) => (
            <li key={h.id} className="flex items-center justify-between rounded border border-border/50 px-2 py-1.5 text-xs">
              <div>
                <div className="font-medium">{h.symbol} · {h.timeframe}</div>
                <div className="text-muted-foreground">{h.reason ?? h.target_mistake ?? "Practice drill"}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{h.status}</Badge>
                <Button asChild size="sm" variant="ghost">
                  <Link to="/replay">Practice</Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No drills yet for this session.</p>
      )}

      {suggestions.length ? (
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Suggested from this session</div>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <Button
                key={s}
                size="sm"
                variant="secondary"
                disabled={create.isPending}
                onClick={() => create.mutate({ symbol, market, timeframe, reason: s, focus: s })}
              >
                {s}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex gap-2">
        <Input
          value={reason}
          placeholder="Add your own drill…"
          onChange={(e) => setReason(e.target.value)}
          className="h-8 text-xs"
        />
        <Button
          size="sm"
          disabled={!reason.trim() || create.isPending}
          onClick={() => {
            create.mutate({ symbol, market, timeframe, reason: reason.trim(), focus: null });
            setReason("");
          }}
        >
          Add
        </Button>
      </div>
    </Card>
  );
}
