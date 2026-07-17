import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { generateReport } from "@/lib/admin/settings.functions";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { downloadBlob, toCSV } from "@/lib/admin/format";
import { toast } from "sonner";
import { FileJson, FileSpreadsheet, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/reports")({
  component: AdminReports,
});

const KINDS = [
  { key: "users", label: "Users report", desc: "All user profiles with core fields." },
  { key: "trades", label: "Trades report", desc: "All paper trades." },
  { key: "journal", label: "Journal report", desc: "All journal entries." },
  { key: "challenges", label: "Challenge progress", desc: "User challenge participation." },
  { key: "achievements", label: "Achievement unlocks", desc: "User achievement grants." },
  { key: "activity", label: "Admin activity", desc: "Recent admin audit trail." },
] as const;

function AdminReports() {
  const fn = useServerFn(generateReport);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (kind: (typeof KINDS)[number]["key"], format: "csv" | "json") => {
    try {
      setBusy(kind + format);
      const r = await fn({ data: { kind } });
      const rows = r.rows ?? [];
      if (rows.length === 0) { toast.info("No rows"); return; }
      if (format === "csv") downloadBlob(toCSV(rows), `${kind}-${Date.now()}.csv`);
      else downloadBlob(JSON.stringify(rows, null, 2), `${kind}-${Date.now()}.json`, "application/json");
      toast.success(`Exported ${rows.length} rows`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <GlassCard className="p-4">
        <h3 className="text-sm font-semibold">Reports</h3>
        <p className="mt-1 text-xs text-muted-foreground">Generate on-demand CSV / JSON exports for auditing and analysis.</p>
      </GlassCard>
      <div className="grid gap-3 sm:grid-cols-2">
        {KINDS.map((k) => (
          <GlassCard key={k.key} className="p-4">
            <div className="text-sm font-semibold">{k.label}</div>
            <p className="text-[11px] text-muted-foreground">{k.desc}</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run(k.key, "csv")}>
                {busy === k.key + "csv" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="mr-1 h-3.5 w-3.5" />} CSV
              </Button>
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run(k.key, "json")}>
                {busy === k.key + "json" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <FileJson className="mr-1 h-3.5 w-3.5" />} JSON
              </Button>
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
