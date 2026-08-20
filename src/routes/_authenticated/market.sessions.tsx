import { createFileRoute } from "@tanstack/react-router";
import { GlassCard } from "@/components/ui/glass-card";
import { PageHeader } from "@/components/ui/page-header";
import { SessionsBar } from "@/components/market/SessionsBar";
import { DEFAULT_SESSIONS } from "@/lib/market-data/sessions";

export const Route = createFileRoute("/_authenticated/market/sessions")({
  component: SessionsPage,
});

function fmt(min: number) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} UTC`;
}

function SessionsPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Market Sessions" description="Sydney, Tokyo, London and New York — with overlap detection and next-open countdown." />
      <GlassCard className="p-4"><SessionsBar /></GlassCard>
      <GlassCard className="p-4">
        <div className="grid gap-3 md:grid-cols-2">
          {DEFAULT_SESSIONS.map((s) => (
            <div key={s.code} className="rounded-lg border border-border/60 bg-card/40 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: s.color ?? "#888" }} />
                  <div className="font-semibold">{s.name}</div>
                </div>
                <div className="text-xs text-muted-foreground">{s.market.toUpperCase()}</div>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Opens <span className="text-foreground/80 font-mono">{fmt(s.openUtcMinute)}</span> · Closes <span className="text-foreground/80 font-mono">{fmt(s.closeUtcMinute)}</span>
                <span className="ml-1 opacity-70">local{s.zone ? ` · ${s.zone}` : ""}</span>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
