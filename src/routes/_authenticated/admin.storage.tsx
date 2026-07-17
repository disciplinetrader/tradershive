import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listBucketObjects, deleteStorageObject } from "@/lib/admin/settings.functions";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtBytes } from "@/lib/admin/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/admin/storage")({
  component: AdminStorage,
});

const BUCKETS = ["avatars", "trade-screenshots", "trade-images", "journal-images", "journal-files", "challenge-images"];

function AdminStorage() {
  const qc = useQueryClient();
  const [bucket, setBucket] = useState(BUCKETS[0]);
  const listFn = useServerFn(listBucketObjects);
  const delFn = useServerFn(deleteStorageObject);

  const q = useQuery({
    queryKey: ["admin-bucket", bucket],
    queryFn: () => listFn({ data: { bucket, prefix: "", limit: 200 } }),
  });
  const mut = useMutation({
    mutationFn: (path: string) => delFn({ data: { bucket, path } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-bucket", bucket] }); toast.success("Deleted"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const totalBytes = (q.data ?? []).reduce((s: number, o: any) => s + (o.metadata?.size ?? 0), 0);

  return (
    <div className="space-y-4">
      <GlassCard className="p-4">
        <div className="flex flex-wrap gap-2">
          {BUCKETS.map((b) => (
            <button
              key={b}
              onClick={() => setBucket(b)}
              className={cn(
                "rounded-xl border px-3 py-1.5 text-xs transition",
                bucket === b ? "border-primary/60 bg-primary/10 text-primary" : "border-border/60 bg-surface/40 text-muted-foreground hover:text-foreground",
              )}
            >
              {b}
            </button>
          ))}
          <div className="ml-auto text-xs text-muted-foreground">
            {q.data?.length ?? 0} objects · {fmtBytes(totalBytes)}
          </div>
        </div>
      </GlassCard>

      <GlassCard className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-border/60 bg-surface/40 text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="p-3 text-left">Path</th>
                <th className="p-3 text-right">Size</th>
                <th className="p-3 text-left">Uploaded</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {q.isLoading
                ? Array.from({ length: 6 }).map((_, i) => <tr key={i}><td colSpan={4} className="p-2"><Skeleton className="h-6 w-full" /></td></tr>)
                : (q.data ?? []).map((o: any) => (
                    <tr key={o.id ?? o.name} className="border-b border-border/40">
                      <td className="p-3 font-mono text-xs">{o.name}</td>
                      <td className="p-3 text-right text-xs">{fmtBytes(o.metadata?.size ?? 0)}</td>
                      <td className="p-3 text-xs text-muted-foreground">{o.created_at ? formatDistanceToNow(new Date(o.created_at), { addSuffix: true }) : "—"}</td>
                      <td className="p-3 text-right">
                        <Button size="sm" variant="ghost" onClick={() => mut.mutate(o.name)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
