import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAdminJournal, moderateJournal } from "@/lib/admin.functions";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { EyeOff, Eye, RotateCcw, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/journal")({
  component: AdminJournal,
});

function AdminJournal() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAdminJournal);
  const modFn = useServerFn(moderateJournal);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "shared" | "hidden" | "deleted">("all");
  const [page, setPage] = useState(1);

  const q = useQuery({
    queryKey: ["admin-journal", search, status, page],
    queryFn: () => listFn({ data: { search: search || null, status, page, pageSize: 25 } }),
  });

  const mut = useMutation({
    mutationFn: (v: { id: string; action: "hide" | "unhide" | "delete" | "restore" }) =>
      modFn({ data: { entryId: v.id, action: v.action } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-journal"] }); toast.success("Updated"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <div className="space-y-4">
      <GlassCard className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Input placeholder="Search symbol…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <Select value={status} onValueChange={(v: any) => setStatus(v)}>
            <SelectTrigger className="w-full sm:w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="shared">Published</SelectItem>
              <SelectItem value="hidden">Hidden</SelectItem>
              <SelectItem value="deleted">Deleted</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">{q.data?.total ?? 0} entries</span>
        </div>
      </GlassCard>

      <GlassCard className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-border/60 bg-surface/40 text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="p-3 text-left">Trader</th>
                <th className="p-3 text-left">Symbol</th>
                <th className="p-3 text-right">PnL</th>
                <th className="p-3 text-right">RR</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Opened</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {q.isLoading
                ? Array.from({ length: 6 }).map((_, i) => <tr key={i}><td colSpan={7} className="p-2"><Skeleton className="h-8 w-full" /></td></tr>)
                : (q.data?.rows ?? []).map((r: any) => (
                    <tr key={r.id} className="border-b border-border/40 hover:bg-surface/50">
                      <td className="p-3 text-xs">{r.profiles?.username ?? "—"}</td>
                      <td className="p-3 font-semibold">{r.symbol}</td>
                      <td className={"p-3 text-right font-mono " + ((r.pnl ?? 0) >= 0 ? "text-success" : "text-danger")}>
                        {(r.pnl ?? 0).toFixed(2)}
                      </td>
                      <td className="p-3 text-right font-mono">{r.rr?.toFixed?.(2) ?? "—"}</td>
                      <td className="p-3">
                        {r.deleted_at ? <Badge variant="destructive">Deleted</Badge> :
                         r.moderation_status === "hidden" ? <Badge className="bg-warning/10 text-warning">Hidden</Badge> :
                         <Badge variant="outline">{r.status}</Badge>}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">{r.opened_at ? new Date(r.opened_at).toLocaleDateString() : "—"}</td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-1">
                          {r.moderation_status === "hidden" ? (
                            <Button size="sm" variant="ghost" onClick={() => mut.mutate({ id: r.id, action: "unhide" })}><Eye className="h-3.5 w-3.5" /></Button>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => mut.mutate({ id: r.id, action: "hide" })}><EyeOff className="h-3.5 w-3.5" /></Button>
                          )}
                          {r.deleted_at ? (
                            <Button size="sm" variant="outline" onClick={() => mut.mutate({ id: r.id, action: "restore" })}><RotateCcw className="h-3.5 w-3.5" /></Button>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => mut.mutate({ id: r.id, action: "delete" })}><Trash2 className="h-3.5 w-3.5" /></Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-border/60 p-3 text-xs">
          <span>Page {page}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>
            <Button size="sm" variant="outline" disabled={(q.data?.rows?.length ?? 0) < 25} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
