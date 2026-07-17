import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAiSettings, updateAiSettings, listProviders } from "@/lib/ai.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ANALYSIS_DEPTHS } from "@/lib/ai/constants";

export const Route = createFileRoute("/_authenticated/ai/settings")({ component: SettingsPage });

function SettingsPage() {
  const qc = useQueryClient();
  const getFn = useServerFn(getAiSettings);
  const updateFn = useServerFn(updateAiSettings);
  const provFn = useServerFn(listProviders);

  const s = useQuery({ queryKey: ["ai", "settings"], queryFn: () => getFn() });
  const providers = useQuery({ queryKey: ["ai", "providers"], queryFn: () => provFn() });

  const save = useMutation({
    mutationFn: (patch: any) => updateFn({ data: patch }),
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["ai", "settings"] }); },
    onError: (e) => toast.error((e as Error).message),
  });

  const set = (patch: any) => save.mutate(patch);
  const settings: any = s.data ?? {};
  const modelsForProvider = (providers.data?.models ?? []).filter(
    (m: any) => providers.data?.providers.find((p: any) => p.id === m.provider_id)?.key === settings.preferred_provider,
  );

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card className="bg-card/60 backdrop-blur-md">
        <CardHeader><CardTitle>Model &amp; provider</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Preferred provider</Label>
            <Select value={settings.preferred_provider ?? "lovable"} onValueChange={(v) => set({ preferred_provider: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(providers.data?.providers ?? []).map((p: any) => (
                  <SelectItem key={p.id} value={p.key} disabled={!p.enabled}>
                    <span className="inline-flex items-center gap-2">{p.name}{!p.enabled && <Badge variant="outline">disabled</Badge>}{p.experimental && <Badge variant="secondary">experimental</Badge>}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">Lovable AI Gateway is enabled by default with no API key required.</p>
          </div>
          <div>
            <Label>Preferred model</Label>
            <Select value={settings.preferred_model ?? "openai/gpt-5.5"} onValueChange={(v) => set({ preferred_model: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {modelsForProvider.map((m: any) => (
                  <SelectItem key={m.id} value={m.model_key}>{m.name} · {m.model_key}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Analysis depth</Label>
            <Select value={settings.analysis_depth ?? "standard"} onValueChange={(v) => set({ analysis_depth: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ANALYSIS_DEPTHS.map((d) => <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/60 backdrop-blur-md">
        <CardHeader><CardTitle>Automations</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <SettingRow label="Auto-analyze new closed trades" checked={!!settings.auto_analyze_trades} onChange={(v) => set({ auto_analyze_trades: v })} />
          <SettingRow label="Auto-review new journal entries" checked={!!settings.auto_journal_review} onChange={(v) => set({ auto_journal_review: v })} />
          <SettingRow label="Auto weekly report" checked={!!settings.auto_weekly_report} onChange={(v) => set({ auto_weekly_report: v })} />
          <SettingRow label="Auto monthly report" checked={!!settings.auto_monthly_report} onChange={(v) => set({ auto_monthly_report: v })} />
          <SettingRow label="Smart alerts" checked={!!settings.smart_alerts} onChange={(v) => set({ smart_alerts: v })} />
        </CardContent>
      </Card>

      <Card className="bg-card/60 backdrop-blur-md md:col-span-2">
        <CardHeader><CardTitle>Privacy</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <SettingRow label="Share my trading data with AI Coach" checked={!!settings.share_data_with_ai} onChange={(v) => set({ share_data_with_ai: v })} />
          <SettingRow label="Opt out of AI Coach entirely" checked={!!settings.opt_out} onChange={(v) => set({ opt_out: v })} />
          <p className="text-xs text-muted-foreground">You can delete all AI-generated analyses at any time from the History tab.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function SettingRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border/60 bg-background/40 p-3">
      <Label className="text-sm">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
