import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Star } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { generateReplayAiReview, getReplayAiReview } from "@/lib/replay-studio.functions";

export function AiReviewPanel({ sessionId }: { sessionId: string }) {
  const get = useServerFn(getReplayAiReview);
  const gen = useServerFn(generateReplayAiReview);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["replay", "ai-review", sessionId],
    queryFn: () => get({ data: { session_id: sessionId } }),
  });
  const m = useMutation({
    mutationFn: () => gen({ data: { session_id: sessionId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["replay", "ai-review", sessionId] }),
  });

  const r = q.data as any;

  if (!r) {
    return (
      <GlassCard className="p-4 space-y-3">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">AI Coach Review</div>
        <p className="text-xs text-muted-foreground">
          Generate a full coaching review of your entries, exits, risk, psychology and consistency.
        </p>
        <Button className="w-full" onClick={() => m.mutate()} disabled={m.isPending}>
          <Sparkles className="mr-2 h-4 w-4" />
          {m.isPending ? "Analyzing…" : "Generate AI Review"}
        </Button>
        {m.isError ? <div className="text-[11px] text-rose-400">Review failed. Try again.</div> : null}
      </GlassCard>
    );
  }

  const sections: [string, string][] = [
    ["Entries", r.entry_analysis],
    ["Exits", r.exit_analysis],
    ["Missed Opportunities", r.missed_opportunities],
    ["Risk", r.risk_analysis],
    ["Psychology", r.psychology],
    ["Consistency", r.consistency],
    ["Suggestions", r.suggestions],
  ];

  return (
    <GlassCard className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">AI Coach Review</div>
        <div className="flex items-center gap-1 text-primary font-semibold">
          <Star className="h-4 w-4 fill-current" /> {r.overall_rating}/100
        </div>
      </div>
      <div className="space-y-2.5 max-h-72 overflow-auto pr-1">
        {sections.map(([label, body]) => body ? (
          <div key={label}>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
            <p className="text-xs text-foreground/90">{body}</p>
          </div>
        ) : null)}
      </div>
      <Button variant="ghost" size="sm" className="w-full" onClick={() => m.mutate()} disabled={m.isPending}>
        <Sparkles className="mr-2 h-3.5 w-3.5" />
        {m.isPending ? "Regenerating…" : "Regenerate Review"}
      </Button>
    </GlassCard>
  );
}
