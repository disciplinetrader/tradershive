/**
 * Phase 8D · Original versus Replay.
 *
 * The comparison maths is NOT reimplemented: canonical replay trades are
 * adapted to the compare layer's `Side` and handed to `improvementDelta`,
 * `outcomeRows` and `processVsOutcome` — the exact functions the Journal's
 * attempt view uses. This file only fetches, renders, and persists the
 * resulting attempt row.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { ClosedTrade } from "@/lib/chart/orders/closed-trade";
import type { ReplayEvent } from "@/lib/replay/session/events";
import { replayTradeLikesFrom, telemetryFromEvents } from "@/lib/replay/review/adapter";
import { useSaveComparison } from "@/lib/replay/review/queries";
import {
  improvementDelta, intentAdherence, outcomeRows, processVsOutcome, sideFromEntry, sideFromReplay,
} from "@/lib/journal/replay-compare";
import { planVsReality, storyMetrics } from "@/lib/journal/story";

const num = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(d));

export function ComparisonPanel({
  sessionId,
  originalEntryId,
  trades,
  events,
  startingBalance,
}: {
  sessionId: string;
  originalEntryId: string | null;
  trades: ClosedTrade[];
  events: readonly ReplayEvent[];
  startingBalance: number | null;
}) {
  const [reflection, setReflection] = useState({ done_better: "", still_wrong: "" });
  const save = useSaveComparison(sessionId);

  const originalQuery = useQuery({
    queryKey: ["journal-entry", originalEntryId],
    enabled: !!originalEntryId,
    queryFn: async () => {
      const { data } = await supabase.from("journal_entries").select("*").eq("id", originalEntryId!).maybeSingle();
      return data;
    },
  });

  const model = useMemo(() => {
    const entry = originalQuery.data as never;
    const telemetry = telemetryFromEvents(events, trades);
    const replaySide = sideFromReplay(
      replayTradeLikesFrom(trades, { startingBalance }),
      {},
      { done_better: reflection.done_better, still_wrong: reflection.still_wrong },
      telemetry,
    );
    if (!entry) return { replaySide, originalSide: null, rows: [], outcome: [], verdictBlock: null, telemetry };

    const metrics = storyMetrics(entry, []);
    const { adherence } = planVsReality(entry, metrics);
    const originalSide = sideFromEntry(entry, metrics, adherence);
    const withAdherence = { ...replaySide, adherence: intentAdherence({}, replaySide).score };
    const rows = improvementDelta(originalSide, withAdherence);
    return {
      replaySide: withAdherence,
      originalSide,
      rows,
      outcome: outcomeRows(originalSide, withAdherence),
      verdictBlock: processVsOutcome(rows, originalSide, withAdherence),
      telemetry,
    };
  }, [originalQuery.data, trades, events, startingBalance, reflection]);

  if (!originalEntryId) {
    return (
      <Card className="space-y-2 p-4">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Original versus replay</div>
        <p className="text-xs text-muted-foreground">
          This session is not linked to an original trade, so there is nothing to compare against. Start a replay
          from a journal trade to unlock the improvement delta.
        </p>
      </Card>
    );
  }

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Original versus replay</div>
        {model.verdictBlock ? (
          <Badge variant={model.verdictBlock.tone === "up" ? "default" : "outline"}>
            {model.verdictBlock.headline}
          </Badge>
        ) : null}
      </div>

      {model.rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Not enough shared data between the original trade and this replay to measure a delta yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border/60">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                {["Dimension", "Original", "Replay", "Delta"].map((h) => (
                  <th key={h} className="px-2 py-1.5 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {model.rows.map((r) => (
                <tr key={r.key} className="border-t border-border/40">
                  <td className="px-2 py-1.5">{r.label}</td>
                  <td className="px-2 py-1.5 font-mono">{num(r.original, 0)}</td>
                  <td className="px-2 py-1.5 font-mono">{num(r.replay, 0)}</td>
                  <td
                    className={`px-2 py-1.5 font-mono ${
                      (r.delta ?? 0) > 0 ? "text-emerald-500" : (r.delta ?? 0) < 0 ? "text-destructive" : ""
                    }`}
                  >
                    {num(r.delta, 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {model.outcome.length ? (
        <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
          {model.outcome.map((o) => (
            <div key={o.key} className="rounded border border-border/50 px-2 py-1">
              <div className="text-[10px] uppercase text-muted-foreground">{o.label}</div>
              <div className="font-mono">{num(o.original)} → {num(o.replay)}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-2 md:grid-cols-2">
        <Textarea
          placeholder="What did you do better this time?"
          value={reflection.done_better}
          onChange={(e) => setReflection((s) => ({ ...s, done_better: e.target.value }))}
          rows={2}
        />
        <Textarea
          placeholder="What still went wrong?"
          value={reflection.still_wrong}
          onChange={(e) => setReflection((s) => ({ ...s, still_wrong: e.target.value }))}
          rows={2}
        />
      </div>

      <Button
        size="sm"
        disabled={save.isPending}
        onClick={() =>
          save.mutate({
            original_entry_id: originalEntryId,
            reflection,
            telemetry: model.telemetry as unknown as Record<string, unknown>,
            breakdown: { rows: model.rows, outcome: model.outcome },
            process_delta: model.verdictBlock?.processDelta ?? null,
            outcome_delta: model.verdictBlock?.outcomeDelta ?? null,
            verdict: model.verdictBlock?.tone ?? null,
          })
        }
      >
        {save.isPending ? "Saving…" : "Save comparison"}
      </Button>
    </Card>
  );
}
