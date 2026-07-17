import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CHART_TYPES, TIMEFRAMES } from "@/lib/chart/constants";
import { loadPreferences, savePreferences } from "@/lib/chart/storage";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/charts/settings")({
  component: ChartsSettingsPage,
});

function ChartsSettingsPage() {
  const [prefs, setPrefs] = useState<any>({
    default_chart_type: "candles", default_timeframe: "1H", default_symbol: "BTC/USDT",
    theme: "dark", crosshair: "normal", show_grid: true, timezone: "UTC",
    price_format: "auto", session_shading: false, auto_scale: true, log_scale: false,
  });
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    loadPreferences().then((p) => { if (p) setPrefs((prev: any) => ({ ...prev, ...p })); });
  }, []);

  const set = (k: string, v: unknown) => setPrefs((p: any) => ({ ...p, [k]: v }));
  async function save() {
    if (!userId) return;
    await savePreferences(userId, prefs);
    toast.success("Chart preferences saved");
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <h1 className="text-xl font-semibold">Chart Settings</h1>
      <p className="mb-6 text-sm text-muted-foreground">Defaults applied to every new chart. Synced across devices.</p>
      <div className="grid max-w-2xl gap-4">
        <Field label="Default Symbol"><Input value={prefs.default_symbol} onChange={(e) => set("default_symbol", e.target.value)} /></Field>
        <Field label="Default Timeframe">
          <Select value={prefs.default_timeframe} onValueChange={(v) => set("default_timeframe", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TIMEFRAMES.map((tf) => <SelectItem key={tf} value={tf}>{tf}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Default Chart Type">
          <Select value={prefs.default_chart_type} onValueChange={(v) => set("default_chart_type", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{CHART_TYPES.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Crosshair">
          <Select value={prefs.crosshair} onValueChange={(v) => set("crosshair", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="magnet">Magnet</SelectItem>
              <SelectItem value="hidden">Hidden</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Timezone"><Input value={prefs.timezone} onChange={(e) => set("timezone", e.target.value)} /></Field>
        <Toggle label="Show Grid" v={prefs.show_grid} on={(v) => set("show_grid", v)} />
        <Toggle label="Session Shading" v={prefs.session_shading} on={(v) => set("session_shading", v)} />
        <Toggle label="Auto Scale" v={prefs.auto_scale} on={(v) => set("auto_scale", v)} />
        <Toggle label="Log Scale" v={prefs.log_scale} on={(v) => set("log_scale", v)} />
        <div><Button onClick={save}>Save Preferences</Button></div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
function Toggle({ label, v, on }: { label: string; v: boolean; on: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/60 bg-card/40 p-3">
      <span className="text-sm">{label}</span>
      <Switch checked={v} onCheckedChange={on} />
    </div>
  );
}
