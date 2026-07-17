import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listSettings, updateSetting, settingHistory } from "@/lib/admin/settings.functions";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { History } from "lucide-react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: AdminSettings,
});

function AdminSettings() {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const isSuper = (roles ?? []).includes("super_admin" as any);
  const listFn = useServerFn(listSettings);
  const updFn = useServerFn(updateSetting);
  const q = useQuery({ queryKey: ["admin-settings"], queryFn: () => listFn({}) });
  const mut = useMutation({
    mutationFn: (v: { key: string; value: any }) => updFn({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-settings"] }); toast.success("Saved"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <div className="space-y-4">
      <GlassCard className="p-4">
        <h3 className="text-sm font-semibold">System settings</h3>
        <p className="text-xs text-muted-foreground">
          Platform-wide configuration. Every change is version-controlled.
          {!isSuper ? " (Read-only — Super Admin required to edit.)" : ""}
        </p>
      </GlassCard>

      <div className="grid gap-3 md:grid-cols-2">
        {q.isLoading
          ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)
          : (q.data ?? []).map((s: any) => (
              <SettingRow key={s.key} setting={s} canEdit={isSuper} onSave={(v) => mut.mutate({ key: s.key, value: v })} />
            ))}
      </div>
    </div>
  );
}

function SettingRow({ setting, canEdit, onSave }: { setting: any; canEdit: boolean; onSave: (v: any) => void }) {
  const [value, setValue] = useState<string>(JSON.stringify(setting.value));
  const histFn = useServerFn(settingHistory);
  const { data: hist } = useQuery({
    queryKey: ["setting-hist", setting.key],
    queryFn: () => histFn({ data: { key: setting.key } }),
    enabled: false,
    staleTime: 60_000,
  });

  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{setting.label ?? setting.key}</div>
          <div className="text-[11px] text-muted-foreground font-mono">{setting.key}</div>
        </div>
        <Popover>
          <PopoverTrigger asChild><Button size="sm" variant="ghost"><History className="h-3.5 w-3.5" /></Button></PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="text-xs font-semibold mb-2">History</div>
            <div className="max-h-64 overflow-auto space-y-1 text-[11px]">
              {(hist ?? []).map((h: any) => (
                <div key={h.id} className="rounded border border-border/60 p-1.5">
                  <div className="text-muted-foreground">{formatDistanceToNow(new Date(h.created_at), { addSuffix: true })}</div>
                  <div className="font-mono">{JSON.stringify(h.new_value)}</div>
                </div>
              ))}
              {(hist ?? []).length === 0 ? <div className="text-muted-foreground">No history yet.</div> : null}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <div className="mt-2 flex gap-2">
        <Input value={value} onChange={(e) => setValue(e.target.value)} disabled={!canEdit} className="font-mono text-xs" />
        <Button size="sm" disabled={!canEdit} onClick={() => {
          try { onSave(JSON.parse(value)); } catch { toast.error("Value must be valid JSON"); }
        }}>Save</Button>
      </div>
    </GlassCard>
  );
}
