import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { getMyPrivacy, updateCustomization, updatePrivacy } from "@/lib/social.functions";
import { toast } from "sonner";

export function CustomizeProfileDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getMyPrivacy);
  const upCust = useServerFn(updateCustomization);
  const upPriv = useServerFn(updatePrivacy);

  const { data, isLoading } = useQuery({
    queryKey: ["my-privacy"],
    queryFn: () => getFn({}),
    enabled: open,
  });

  const c = data?.customization ?? {};
  const p = data?.privacy ?? {};
  const [form, setForm] = useState<any>({});
  const [priv, setPriv] = useState<any>({});

  const merged = { ...c, ...form };
  const mergedPriv = { hide_profile: false, hide_stats: false, hide_journal: true, hide_activity: false, show_country: true, show_league: true, eligible_for_leaderboard: true, ...p, ...priv };

  const cust = useMutation({
    mutationFn: async () => {
      await upCust({ data: {
        banner_url: merged.banner_url ?? null,
        headline: merged.headline ?? null,
        favorite_pair: merged.favorite_pair ?? null,
        website: merged.website ?? null,
        discord_handle: merged.discord_handle ?? null,
        x_handle: merged.x_handle ?? null,
        telegram_handle: merged.telegram_handle ?? null,
        youtube_url: merged.youtube_url ?? null,
      }});
      await upPriv({ data: mergedPriv });
    },
    onSuccess: () => {
      toast.success("Profile updated");
      qc.invalidateQueries({ queryKey: ["my-privacy"] });
      qc.invalidateQueries({ queryKey: ["public-profile"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Customize public profile</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-4 py-2" aria-busy="true">
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-9 w-full rounded-md" />
                </div>
              ))}
            </div>
            <Skeleton className="h-24 w-full rounded-md" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Headline" placeholder="Prop-firm scalper. XAU/USD only." value={merged.headline ?? ""} onChange={(v) => setForm((f: any) => ({ ...f, headline: v }))} />
              <Field label="Favorite pair" placeholder="XAU/USD" value={merged.favorite_pair ?? ""} onChange={(v) => setForm((f: any) => ({ ...f, favorite_pair: v }))} />
              <Field label="Banner image URL" placeholder="https://…" value={merged.banner_url ?? ""} onChange={(v) => setForm((f: any) => ({ ...f, banner_url: v }))} className="sm:col-span-2" />
              <Field label="Website" placeholder="https://your.site" value={merged.website ?? ""} onChange={(v) => setForm((f: any) => ({ ...f, website: v }))} />
              <Field label="X (Twitter) handle" placeholder="@handle" value={merged.x_handle ?? ""} onChange={(v) => setForm((f: any) => ({ ...f, x_handle: v }))} />
              <Field label="Discord handle" placeholder="you#0001" value={merged.discord_handle ?? ""} onChange={(v) => setForm((f: any) => ({ ...f, discord_handle: v }))} />
              <Field label="Telegram handle" placeholder="@handle" value={merged.telegram_handle ?? ""} onChange={(v) => setForm((f: any) => ({ ...f, telegram_handle: v }))} />
              <Field label="YouTube URL" placeholder="https://youtube.com/@…" value={merged.youtube_url ?? ""} onChange={(v) => setForm((f: any) => ({ ...f, youtube_url: v }))} className="sm:col-span-2" />
            </div>

            <Separator />
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Privacy</h3>
              {[
                { k: "hide_profile", label: "Hide public profile", desc: "Only you can see your profile page." },
                { k: "hide_stats", label: "Hide statistics", desc: "Hide win rate, R, PF." },
                { k: "hide_journal", label: "Hide journal", desc: "Public journal entries stay private." },
                { k: "hide_activity", label: "Hide activity feed", desc: "Hide recent achievements/trades." },
                { k: "show_country", label: "Show country" },
                { k: "show_league", label: "Show league" },
                { k: "eligible_for_leaderboard", label: "Appear on leaderboards" },
              ].map((row) => (
                <div key={row.k} className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-surface/40 px-3 py-2">
                  <div>
                    <div className="text-sm font-medium">{row.label}</div>
                    {row.desc ? <div className="text-xs text-muted-foreground">{row.desc}</div> : null}
                  </div>
                  <Switch
                    checked={!!mergedPriv[row.k]}
                    onCheckedChange={(v) => setPriv((s: any) => ({ ...s, [row.k]: v }))}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => cust.mutate()} disabled={cust.isPending}>
            {cust.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, onChange, placeholder, className, textarea }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; className?: string; textarea?: boolean;
}) {
  return (
    <div className={className}>
      <Label className="text-xs">{label}</Label>
      {textarea ? (
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="mt-1" />
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="mt-1" />
      )}
    </div>
  );
}
