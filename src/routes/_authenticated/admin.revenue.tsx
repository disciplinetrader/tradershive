import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRevenueOverview } from "@/lib/admin/console.functions";
import { GlassCard } from "@/components/ui/glass-card";
import { KpiCard } from "@/components/admin/KpiCard";
import { DollarSign, TrendingUp, CreditCard, Users, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/revenue")({
  component: AdminRevenue,
});

function AdminRevenue() {
  const fn = useServerFn(getRevenueOverview);
  const q = useQuery({ queryKey: ["admin-revenue"], queryFn: () => fn({}) });
  const r = q.data ?? ({} as any);

  const usd = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents ?? 0) / 100);

  return (
    <div className="space-y-5">
      {r.stripeConnected === false ? (
        <GlassCard className="flex items-start gap-3 border-warning/40 bg-warning/5 p-3 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 text-warning shrink-0" />
          <div>
            <div className="font-medium">Payments not connected yet</div>
            <p className="text-xs text-muted-foreground">
              Revenue figures below are computed from local subscription events. Connect a payment processor to populate real invoice data.
            </p>
          </div>
        </GlassCard>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="MRR" value={usd(r.mrrCents)} icon={DollarSign} tone="positive" />
        <KpiCard label="ARR" value={usd(r.arrCents)} icon={TrendingUp} />
        <KpiCard label="ARPU" value={usd(r.arpuCents)} icon={CreditCard} />
        <KpiCard label="Active + Lifetime" value={String(r.activeSubs ?? 0)} icon={Users} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <GlassCard className="p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Trialing</div>
          <div className="mt-1 text-2xl font-semibold">{r.trialSubs ?? 0}</div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Canceled</div>
          <div className="mt-1 text-2xl font-semibold">{r.canceledSubs ?? 0}</div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Paid this month</div>
          <div className="mt-1 text-2xl font-semibold">{usd(r.mrrCents)}</div>
        </GlassCard>
      </div>
    </div>
  );
}
