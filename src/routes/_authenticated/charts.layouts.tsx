import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Trash2, Copy, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listLayouts, deleteLayout, duplicateLayout, saveLayout } from "@/lib/chart/storage";
import type { ChartLayoutRow } from "@/lib/chart/types";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/charts/layouts")({
  component: LayoutsPage,
});

function LayoutsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ChartLayoutRow[]>([]);
  const refresh = () => listLayouts().then(setRows);
  useEffect(() => { refresh(); }, []);

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Chart Layouts</h1>
          <p className="text-sm text-muted-foreground">Save, rename, duplicate and delete your saved workspace layouts. Auto-synced to the cloud.</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 p-10 text-center text-sm text-muted-foreground">
          No saved layouts. Save one from the toolbar in the chart workspace.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => (
            <div key={r.id} className="rounded-xl border border-border/60 bg-card/40 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-muted-foreground">{r.grid} · {(r.symbols ?? []).length} symbols · {(r.indicators ?? []).length} indicators</div>
                </div>
                {r.is_default ? <Star className="h-4 w-4 text-yellow-400" fill="currentColor" /> : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => navigate({ to: "/charts" })}>Open</Button>
                <Button size="sm" variant="ghost" onClick={async () => { await duplicateLayout(r); refresh(); toast.success("Duplicated"); }}>
                  <Copy className="mr-1 h-3.5 w-3.5" />Duplicate
                </Button>
                <Button size="sm" variant="ghost" onClick={async () => { await saveLayout({ id: r.id, is_default: !r.is_default } as any); refresh(); }}>
                  {r.is_default ? "Unpin" : "Set Default"}
                </Button>
                <Button size="sm" variant="ghost" className="text-rose-400" onClick={async () => { await deleteLayout(r.id); refresh(); }}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" />Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
