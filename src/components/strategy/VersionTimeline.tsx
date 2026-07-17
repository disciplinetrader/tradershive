import { motion } from "framer-motion";
import { History, RotateCcw } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { restoreVersion } from "@/lib/strategy.functions";
import { formatDistanceToNow } from "date-fns";

type V = { id: string; version: number; change_notes: string | null; created_at: string };

export function VersionTimeline({ strategyId, versions }: { strategyId: string; versions: V[] }) {
  const qc = useQueryClient();
  const restore = useServerFn(restoreVersion);
  const mut = useMutation({
    mutationFn: async (version_id: string) => restore({ data: { strategy_id: strategyId, version_id } }),
    onSuccess: () => {
      toast.success("Version restored");
      qc.invalidateQueries({ queryKey: ["strategy", strategyId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <GlassCard className="p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4 text-primary" />Version History</div>
      {versions.length === 0 ? (
        <div className="text-xs text-muted-foreground">No previous versions yet. Every save creates an immutable snapshot.</div>
      ) : (
        <ol className="relative border-l border-border/60 space-y-3 pl-4">
          {versions.map((v) => (
            <motion.li key={v.id} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} className="relative">
              <span className="absolute -left-[7px] top-1.5 h-2 w-2 rounded-full bg-primary" />
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold">v{v.version}</div>
                  <div className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(v.created_at), { addSuffix: true })}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => mut.mutate(v.id)} disabled={mut.isPending}>
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />Restore
                </Button>
              </div>
              {v.change_notes ? <div className="text-xs text-muted-foreground mt-1">{v.change_notes}</div> : null}
            </motion.li>
          ))}
        </ol>
      )}
    </GlassCard>
  );
}
