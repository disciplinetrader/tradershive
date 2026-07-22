import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAuditLogs } from "@/lib/admin.functions";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { downloadBlob, toCSV } from "@/lib/admin/format";
import { Download, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/logs")({
  component: AdminLogs,
});

function AdminLogs() {
  const listFn = useServerFn(listAuditLogs);
  const [search, setSearch] = useState("");
  const [resource, setResource] = useState("");
  const [page, setPage] = useState(1);

  const q = useQuery({
    queryKey: ["admin-logs", search, resource, page],
    queryFn: () => listFn({ data: { search: search || null, resource: resource || null, page, pageSize: 50 } }),
  });

  return (
    <div className="space-y-4">
      <GlassCard className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 sm:min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search action…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
          </div>
          <Input placeholder="Resource (user, trade, …)" value={resource} onChange={(e) => setResource(e.target.value)} className="max-w-[220px]" />
          <span className="text-xs text-muted-foreground">{q.data?.total ?? 0} entries</span>
          <div className="ml-auto">
            <Button size="sm" variant="outline" onClick={() => downloadBlob(toCSV(q.data?.rows ?? []), `audit-${Date.now()}.csv`)}>
              <Download className="mr-1 h-3.5 w-3.5" /> Export
            </Button>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-border/60 bg-surface/40 text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="p-3 text-left">When</th>
                <th className="p-3 text-left">Admin</th>
                <th className="p-3 text-left">Action</th>
                <th className="p-3 text-left">Resource</th>
                <th className="p-3 text-left">Meta</th>
              </tr>
            </thead>
            <tbody>
              {q.isLoading
                ? Array.from({ length: 10 }).map((_, i) => <tr key={i}><td colSpan={5} className="p-2"><Skeleton className="h-6 w-full" /></td></tr>)
                : (q.data?.rows ?? []).map((l: any) => (
                    <tr key={l.id} className="border-b border-border/40">
                      <td className="p-3 text-xs text-muted-foreground">{formatDistanceToNow(new Date(l.created_at), { addSuffix: true })}</td>
                      <td className="p-3 text-xs">{l.profiles?.username ?? l.admin_id?.slice(0, 8)}</td>
                      <td className="p-3"><Badge variant="outline" className="font-mono text-[10px]">{l.action}</Badge></td>
                      <td className="p-3 text-xs">{l.resource}{l.resource_id ? ` · ${String(l.resource_id).slice(0, 8)}` : ""}</td>
                      <td className="p-3 text-[10px] font-mono text-muted-foreground max-w-md truncate">{JSON.stringify(l.meta)}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-border/60 p-3 text-xs">
          <span>Page {page}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>
            <Button size="sm" variant="outline" disabled={(q.data?.rows?.length ?? 0) < 50} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
