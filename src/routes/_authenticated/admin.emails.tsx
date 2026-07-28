import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Mail, Send, RefreshCw, Ban, Clock, AlertTriangle } from "lucide-react";

import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { KpiCard } from "@/components/admin/KpiCard";
import { StatusPill } from "@/components/admin/StatusPill";
import {
  adminListEmailEvents,
  adminListEmailQueue,
  adminEmailStats,
  adminRetryQueueJob,
  adminCancelQueueJob,
  adminSendTestEmail,
  adminListEmailTemplates,
  adminEmailProviderInfo,
} from "@/lib/email.functions";

export const Route = createFileRoute("/_authenticated/admin/emails")({
  component: AdminEmails,
});

function AdminEmails() {
  const qc = useQueryClient();

  const statsFn = useServerFn(adminEmailStats);
  const providerFn = useServerFn(adminEmailProviderInfo);
  const templatesFn = useServerFn(adminListEmailTemplates);
  const eventsFn = useServerFn(adminListEmailEvents);
  const queueFn = useServerFn(adminListEmailQueue);
  const retryFn = useServerFn(adminRetryQueueJob);
  const cancelFn = useServerFn(adminCancelQueueJob);
  const testFn = useServerFn(adminSendTestEmail);

  const [status, setStatus] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [search, setSearch] = useState<string>("");

  const stats = useQuery({ queryKey: ["email-stats"], queryFn: () => statsFn({}), refetchInterval: 60_000 });
  const provider = useQuery({ queryKey: ["email-provider"], queryFn: () => providerFn({}) });
  const templates = useQuery({ queryKey: ["email-templates"], queryFn: () => templatesFn({}) });
  const events = useQuery({
    queryKey: ["email-events", status, category, search],
    queryFn: () =>
      eventsFn({
        data: {
          status: status === "all" ? undefined : status,
          category: category === "all" ? undefined : category,
          search: search || undefined,
          limit: 100,
        },
      }),
  });
  const queue = useQuery({ queryKey: ["email-queue"], queryFn: () => queueFn({}), refetchInterval: 30_000 });

  const retry = useMutation({
    mutationFn: (id: string) => retryFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Job requeued");
      qc.invalidateQueries({ queryKey: ["email-queue"] });
    },
  });
  const cancel = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Job cancelled");
      qc.invalidateQueries({ queryKey: ["email-queue"] });
    },
  });

  const [testTemplate, setTestTemplate] = useState<string>("welcome");
  const [testEmail, setTestEmail] = useState("");
  const test = useMutation({
    mutationFn: () => testFn({ data: { template: testTemplate, toEmail: testEmail } }),
    onSuccess: (r: any) => {
      toast.success(`Test dispatched (${r?.status ?? "ok"})`);
      qc.invalidateQueries({ queryKey: ["email-events"] });
      qc.invalidateQueries({ queryKey: ["email-stats"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Test failed"),
  });

  const s = stats.data as any;
  const totals = s?.totals ?? {};
  const sent = totals.sent ?? 0;
  const queued = totals.queued ?? 0;
  const failed = totals.failed ?? 0;
  const skipped = (totals.skipped ?? 0) + (totals.suppressed ?? 0);

  return (
    <div className="space-y-5">
      <GlassCard className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Mail className="h-4 w-4" /> Email infrastructure
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Active provider:{" "}
            <span className="font-medium text-foreground">{provider.data?.active ?? "…"}</span>
            {" · "}
            {provider.data?.isProduction ? "production" : "development"}
            {provider.data?.billingEnabled ? " · billing enabled" : " · billing scaffolded (disabled)"}
          </div>
        </div>
        <Badge variant="secondary">Providers: {provider.data?.registered?.join(", ") ?? "…"}</Badge>
      </GlassCard>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Sent (30d)" value={sent} icon={Send} tone="positive" />
        <KpiCard label="Queued (30d)" value={queued} icon={Clock} />
        <KpiCard label="Failed (30d)" value={failed} icon={AlertTriangle} tone={failed ? "negative" : "default"} />
        <KpiCard label="Skipped/suppressed" value={skipped} icon={Ban} tone="warning" />
      </div>

      <Tabs defaultValue="events" className="space-y-4">
        <TabsList>
          <TabsTrigger value="events">Event log</TabsTrigger>
          <TabsTrigger value="queue">Queue ({queue.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="test">Send test</TabsTrigger>
        </TabsList>

        <TabsContent value="events" className="space-y-3">
          <GlassCard className="flex flex-wrap items-center gap-2 p-3">
            <Input
              placeholder="Search recipient…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 max-w-[220px]"
            />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-8 w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                {["all", "sent", "queued", "failed", "skipped", "suppressed"].map((v) => (
                  <SelectItem key={v} value={v}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-8 w-[170px]"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                {["all", "transactional", "security", "product", "engagement", "marketing", "billing"].map((v) => (
                  <SelectItem key={v} value={v}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </GlassCard>

          <GlassCard className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">When</th>
                  <th className="px-3 py-2 text-left">Recipient</th>
                  <th className="px-3 py-2 text-left">Template</th>
                  <th className="px-3 py-2 text-left">Subject</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {(events.data ?? []).map((e: any) => (
                  <tr key={e.id} className="hover:bg-muted/20">
                    <td className="whitespace-nowrap px-3 py-2 text-[11px] text-muted-foreground">
                      {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                    </td>
                    <td className="px-3 py-2">{e.to_email}</td>
                    <td className="px-3 py-2 text-xs">
                      <div className="font-medium">{e.template}</div>
                      <div className="text-[10px] text-muted-foreground">{e.category}</div>
                    </td>
                    <td className="max-w-[280px] truncate px-3 py-2">{e.subject ?? "—"}</td>
                    <td className="px-3 py-2"><StatusPill value={e.status} /></td>
                  </tr>
                ))}
                {!events.isLoading && (events.data ?? []).length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-xs text-muted-foreground">No events match those filters.</td></tr>
                )}
              </tbody>
            </table>
          </GlassCard>
        </TabsContent>

        <TabsContent value="queue" className="space-y-3">
          <GlassCard className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Scheduled</th>
                  <th className="px-3 py-2 text-left">Recipient</th>
                  <th className="px-3 py-2 text-left">Template</th>
                  <th className="px-3 py-2 text-left">Attempts</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {(queue.data ?? []).map((q: any) => (
                  <tr key={q.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2 text-[11px] text-muted-foreground">
                      {formatDistanceToNow(new Date(q.scheduled_for), { addSuffix: true })}
                    </td>
                    <td className="px-3 py-2">{q.to_email}</td>
                    <td className="px-3 py-2 text-xs">
                      <div className="font-medium">{q.template}</div>
                      <div className="text-[10px] text-muted-foreground">{q.category}</div>
                    </td>
                    <td className="px-3 py-2 text-xs">{q.attempts}/{q.max_attempts}</td>
                    <td className="px-3 py-2"><StatusPill value={q.status} /></td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => retry.mutate(q.id)}>
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => cancel.mutate(q.id)}>
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!queue.isLoading && (queue.data ?? []).length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-xs text-muted-foreground">Queue is empty.</td></tr>
                )}
              </tbody>
            </table>
          </GlassCard>
        </TabsContent>

        <TabsContent value="test">
          <GlassCard className="max-w-xl space-y-3 p-5">
            <h3 className="text-sm font-semibold">Send a test email</h3>
            <p className="text-xs text-muted-foreground">
              Delivers via the active provider ({provider.data?.active ?? "…"}). In development this writes to server logs; production
              sends real mail when a provider is wired in.
            </p>
            <div className="space-y-2">
              <label className="text-xs font-medium">Template</label>
              <Select value={testTemplate} onValueChange={setTestTemplate}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(templates.data ?? []).map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.id} <span className="ml-1 text-[10px] text-muted-foreground">({t.category})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">Recipient email</label>
              <Input placeholder="you@example.com" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} />
            </div>
            <Button disabled={!testEmail || test.isPending} onClick={() => test.mutate()}>
              <Send className="mr-1.5 h-3.5 w-3.5" /> Dispatch test
            </Button>
          </GlassCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
