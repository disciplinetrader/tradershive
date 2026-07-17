import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — TradersHIVE Arena" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { profile, refresh } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName.trim() || null })
      .eq("id", profile.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    await refresh();
    toast.success("Profile updated");
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Manage your account and preferences." />

      <GlassCard className="p-6">
        <h2 className="text-base font-semibold">Profile</h2>
        <p className="text-xs text-muted-foreground">This is how other traders see you.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Username</Label>
            <Input value={profile?.username ?? ""} disabled />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="display-name">Display name</Label>
            <Input
              id="display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={40}
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <Button onClick={save} disabled={saving} className="gradient-primary text-primary-foreground">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
          </Button>
        </div>
      </GlassCard>

      <GlassCard className="p-6">
        <h2 className="text-base font-semibold">Notifications</h2>
        <p className="text-xs text-muted-foreground">Choose when we should ping you.</p>
        <div className="mt-5 space-y-4">
          {[
            ["Weekly performance report", true],
            ["New challenges available", true],
            ["Rank changes", false],
            ["Product updates", true],
          ].map(([label, enabled]) => (
            <div key={label as string} className="flex items-center justify-between">
              <span className="text-sm">{label}</span>
              <Switch defaultChecked={enabled as boolean} />
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="border-danger/30 p-6">
        <h2 className="text-base font-semibold text-danger">Danger zone</h2>
        <p className="text-xs text-muted-foreground">Deleting your account is permanent.</p>
        <Button variant="destructive" className="mt-5">
          Delete account
        </Button>
      </GlassCard>
    </div>
  );
}
