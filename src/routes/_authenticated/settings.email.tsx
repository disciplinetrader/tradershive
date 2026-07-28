import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  getMyEmailPreferences,
  updateMyEmailPreferences,
  getMyEmailEvents,
} from "@/lib/email.functions";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/settings/email")({
  head: () => ({
    meta: [
      { title: "Email preferences — TradersHIVE" },
      { name: "description", content: "Control which emails TradersHIVE sends you." },
    ],
  }),
  component: EmailSettingsPage,
});

type PrefKey =
  | "welcome_series"
  | "weekly_report"
  | "monthly_report"
  | "achievements"
  | "product_updates"
  | "reengagement"
  | "marketing"
  | "billing";

const ROWS: { key: PrefKey; label: string; hint: string; badge?: string }[] = [
  { key: "weekly_report", label: "Weekly performance report", hint: "Monday-morning summary of your last 7 days." },
  { key: "monthly_report", label: "Monthly performance report", hint: "Deep-dive on your last 30 days of trading." },
  { key: "achievements", label: "Achievements & milestones", hint: "Celebrate badges, streaks and level-ups." },
  { key: "product_updates", label: "Product updates", hint: "New features and important changes." },
  { key: "welcome_series", label: "Onboarding series", hint: "Short tips during your first week." },
  { key: "reengagement", label: "Comeback nudges", hint: "Gentle reminders when you've been away." },
  { key: "marketing", label: "News & promotions", hint: "Occasional announcements. Off by default." },
  { key: "billing", label: "Billing & receipts", hint: "Payments and subscriptions.", badge: "Coming soon" },
];

function EmailSettingsPage() {
  const qc = useQueryClient();
  const getPrefs = useServerFn(getMyEmailPreferences);
  const updatePrefs = useServerFn(updateMyEmailPreferences);
  const getEvents = useServerFn(getMyEmailEvents);

  const prefs = useQuery({ queryKey: ["email-prefs"], queryFn: () => getPrefs({}) });
  const events = useQuery({ queryKey: ["email-events-mine"], queryFn: () => getEvents({}) });

  const mutation = useMutation({
    mutationFn: (patch: Partial<Record<string, boolean>>) => updatePrefs({ data: patch as any }),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: ["email-prefs"] });
      const prev = qc.getQueryData<any>(["email-prefs"]);
      if (prev) qc.setQueryData(["email-prefs"], { ...prev, ...patch });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["email-prefs"], ctx.prev);
      toast.error("Couldn't save. Try again.");
    },
    onSuccess: () => toast.success("Preferences saved"),
  });

  const p = prefs.data as any | undefined;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Email preferences"
        description="Choose exactly which emails you want from TradersHIVE. Security emails always send."
      />

      <GlassCard className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Master switch</h3>
            <p className="text-xs text-muted-foreground">Turn off to pause every non-security email.</p>
          </div>
          {prefs.isLoading ? (
            <Skeleton className="h-6 w-11" />
          ) : (
            <Switch
              checked={Boolean(p?.master_enabled)}
              onCheckedChange={(v) => mutation.mutate({ master_enabled: v })}
            />
          )}
        </div>

        <div className="divide-y divide-border/40">
          {ROWS.map((r) => (
            <div key={r.key} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {r.label}
                  {r.badge && <Badge variant="secondary" className="text-[10px]">{r.badge}</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">{r.hint}</div>
              </div>
              {prefs.isLoading ? (
                <Skeleton className="h-6 w-11" />
              ) : (
                <Switch
                  checked={Boolean(p?.[r.key])}
                  disabled={!p?.master_enabled}
                  onCheckedChange={(v) => mutation.mutate({ [r.key]: v })}
                />
              )}
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="p-5">
        <h3 className="mb-3 text-sm font-semibold">Recent activity</h3>
        {events.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !events.data?.length ? (
          <p className="text-xs text-muted-foreground">No emails yet. When we send you one, it'll show up here.</p>
        ) : (
          <ul className="divide-y divide-border/40 text-sm">
            {events.data.map((e: any) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="truncate font-medium">{e.subject ?? e.template}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {e.category} · {e.template}
                  </div>
                </div>
                <div className="flex flex-col items-end text-[11px]">
                  <Badge variant="outline" className="text-[10px]">{e.status}</Badge>
                  <span className="mt-1 text-muted-foreground">
                    {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </div>
  );
}
