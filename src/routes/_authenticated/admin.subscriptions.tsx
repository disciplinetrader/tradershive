import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  listSubscriptions,
  listSubscriptionPlans,
  grantSubscription,
  cancelSubscription,
  extendSubscription,
} from "@/lib/admin/console.functions";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/admin/StatusPill";
import { CreditCard, Gift, Ban, Clock } from "lucide-react";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/subscriptions")({
  component: AdminSubscriptions,
});

function AdminSubscriptions() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<string>("");
  const [page, setPage] = useState(1);
  const [grantOpen, setGrantOpen] = useState(false);
  const [grantUserId, setGrantUserId] = useState("");
  const [grantPlan, setGrantPlan] = useState("");
  const [grantDays, setGrantDays] = useState("30");
  const [grantStatus, setGrantStatus] = useState<"trialing" | "active" | "lifetime">("active");
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);

  const listFn = useServerFn(listSubscriptions);
  const plansFn = useServerFn(listSubscriptionPlans);
  const grantFn = useServerFn(grantSubscription);
  const cancelFn = useServerFn(cancelSubscription);
  const extendFn = useServerFn(extendSubscription);

  const q = useQuery({
    queryKey: ["admin-subs", status, page],
    queryFn: () => listFn({ data: { status: status || undefined, page, pageSize: 25 } }),
  });
  const plans = useQuery({ queryKey: ["admin-plans"], queryFn: () => plansFn({}) });

  const grantMut = useMutation({
    mutationFn: (data: { userId: string; planCode: string; days: number; status: "trialing" | "active" | "lifetime" }) =>
      grantFn({ data }),
    onSuccess: () => {
      toast.success("Subscription granted");
      setGrantOpen(false);
      setGrantUserId("");
      qc.invalidateQueries({ queryKey: ["admin-subs"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to grant"),
  });
  const cancelMut = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { subscriptionId: id, immediate: false } }),
    onSuccess: () => {
      toast.success("Subscription canceled at period end");
      setConfirmCancel(null);
      qc.invalidateQueries({ queryKey: ["admin-subs"] });
    },
  });
  const extendMut = useMutation({
    mutationFn: (data: { id: string; days: number }) => extendFn({ data: { subscriptionId: data.id, days: data.days } }),
    onSuccess: () => {
      toast.success("Extended");
      qc.invalidateQueries({ queryKey: ["admin-subs"] });
    },
  });

  const rows: any[] = q.data?.rows ?? [];
  const total = q.data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Subscriptions</h2>
          <p className="text-xs text-muted-foreground">{total.toLocaleString()} total · manage plans and grants.</p>
        </div>
        <Button size="sm" onClick={() => setGrantOpen(true)}>
          <Gift className="mr-1.5 h-3.5 w-3.5" /> Grant subscription
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="h-8 rounded-md border border-border/60 bg-surface px-2 text-xs"
        >
          <option value="">All statuses</option>
          {["active", "trialing", "past_due", "canceled", "expired", "paused", "lifetime"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <GlassCard className="divide-y divide-border/40 p-0">
        {q.isLoading ? (
          <div className="p-6 text-center text-xs text-muted-foreground">Loading…</div>
        ) : !rows.length ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            No subscriptions yet. Grant a plan to start.
          </div>
        ) : (
          rows.map((s: any) => {
            const plan = s.subscription_plans;
            return (
              <div key={s.id} className="flex items-center justify-between gap-3 p-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <CreditCard className="h-4 w-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate font-mono">{String(s.user_id).slice(0, 8)}…</div>
                    <div className="text-[11px] text-muted-foreground">
                      plan {plan?.name ?? plan?.code ?? s.plan_id ?? "—"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill value={s.status} />
                  {s.current_period_end ? (
                    <span className="text-[11px] text-muted-foreground">
                      renews {formatDistanceToNow(new Date(s.current_period_end), { addSuffix: true })}
                    </span>
                  ) : null}
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => extendMut.mutate({ id: s.id, days: 30 })}>
                    <Clock className="mr-1 h-3 w-3" /> +30d
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px] text-danger hover:text-danger"
                    onClick={() => setConfirmCancel(s.id)}
                  >
                    <Ban className="mr-1 h-3 w-3" /> Cancel
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </GlassCard>

      {total > 25 ? (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
          <Button size="sm" variant="outline" disabled={page * 25 >= total} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={grantOpen}
        onOpenChange={setGrantOpen}
        title="Grant subscription"
        description="Grant a plan directly to a user. Useful for comps, team, and beta partners."
        confirmLabel={grantMut.isPending ? "Granting…" : "Grant"}
        onConfirm={() => {
          if (!grantUserId || !grantPlan) {
            toast.error("User ID and plan required");
            return;
          }
          grantMut.mutate({
            userId: grantUserId,
            planCode: grantPlan,
            days: Number(grantDays) || 30,
            status: grantStatus,
          });
        }}
      >
        <div className="space-y-3">
          <div>
            <label className="text-[11px] uppercase tracking-widest text-muted-foreground">User ID (UUID)</label>
            <Input value={grantUserId} onChange={(e) => setGrantUserId(e.target.value)} placeholder="00000000-0000-…" className="mt-1 h-9 text-sm font-mono" />
            <p className="mt-1 text-[10px] text-muted-foreground">Find this in the Users panel.</p>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-widest text-muted-foreground">Plan</label>
            <select
              value={grantPlan}
              onChange={(e) => setGrantPlan(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-border/60 bg-surface px-2 text-sm"
            >
              <option value="">Select a plan…</option>
              {(plans.data ?? []).map((p: any) => (
                <option key={p.id} value={p.code}>{p.name} ({p.interval})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] uppercase tracking-widest text-muted-foreground">Status</label>
              <select
                value={grantStatus}
                onChange={(e) => setGrantStatus(e.target.value as any)}
                className="mt-1 h-9 w-full rounded-md border border-border/60 bg-surface px-2 text-sm"
              >
                <option value="active">Active</option>
                <option value="trialing">Trialing</option>
                <option value="lifetime">Lifetime</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-widest text-muted-foreground">Days</label>
              <Input value={grantDays} onChange={(e) => setGrantDays(e.target.value)} className="mt-1 h-9 text-sm" />
            </div>
          </div>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={!!confirmCancel}
        onOpenChange={(o) => !o && setConfirmCancel(null)}
        title="Cancel subscription?"
        description="The user keeps paid features until the end of the current period, then loses access."
        confirmLabel="Cancel at period end"
        destructive
        onConfirm={() => {
          if (confirmCancel) cancelMut.mutate(confirmCancel);
        }}
      />
    </div>
  );
}
