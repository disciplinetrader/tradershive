import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useCallback } from "react";
import { 
  User, Shield, Bell, CreditCard, Mail, 
  Loader2, Play, LineChart as TradingChart,
  Search, Globe, Clock
} from "lucide-react";
import { toast } from "sonner";
import { useProductTour } from "@/components/tour/ProductTour";
import { TIMEZONES } from "@/lib/constants";
import { getLocalTime, getTimezoneOffset } from "@/lib/utils/date";

import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { user, profile, refresh } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  const handleUpdateProfile = async (data: any) => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("profiles").update(data).eq("id", user.id);
      if (error) throw error;
      toast.success("Settings updated");
      await refresh();
    } catch (err) {
      toast.error("Failed to update settings");
    } finally {
      setSaving(false);
    }
  };
  
  return (
    <div className="space-y-6">
      <PageHeader 
        title="Settings" 
        description="Manage your account, preferences and security."
      />
      
      <ProfileSection profile={profile} onSave={handleUpdateProfile} saving={saving} />
      <TradingSection profile={profile} onSave={handleUpdateProfile} saving={saving} />
      <SecuritySection email={user?.email ?? ""} />
      <EmailSection />
      <NotificationsSection />
      
      <GlassCard className="p-6 border-danger/20 bg-danger/5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-danger">Danger Zone</h2>
            <p className="text-xs text-muted-foreground">Permanently delete your account and all associated data.</p>
          </div>
          <Button variant="destructive" size="sm">
            Delete Account
          </Button>
        </div>
      </GlassCard>
    </div>
  );
}

function ProfileSection({ profile, onSave, saving }: { profile: any, onSave: any, saving: boolean }) {
  const [displayName, setDisplayName] = useState(profile?.display_name || "");

  useEffect(() => {
    if (profile?.display_name) setDisplayName(profile.display_name);
  }, [profile?.display_name]);

  return (
    <GlassCard className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold">Profile</h2>
        <Button 
          size="sm" 
          onClick={() => onSave({ display_name: displayName })}
          disabled={saving || displayName === profile?.display_name}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
        </Button>
      </div>
      <div className="space-y-4">
        <div className="grid gap-2">
          <Label>Display Name</Label>
          <Input 
            value={displayName} 
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="How other traders see you" 
          />
        </div>
        <div className="grid gap-2">
          <Label>Username</Label>
          <Input value={profile?.username || ""} disabled className="bg-muted/30" />
        </div>
      </div>
    </GlassCard>
  );
}

function TradingSection({ profile, onSave, saving }: { profile: any, onSave: any, saving: boolean }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const filteredTimezones = useMemo(() => {
    if (!searchQuery) return TIMEZONES;
    return TIMEZONES.filter(tz => tz.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [searchQuery]);

  const currentTz = profile?.timezone || "UTC";

  return (
    <GlassCard className="p-6">
      <h2 className="text-base font-semibold mb-4">Trading Preferences</h2>
      <div className="space-y-6">
        <div className="grid gap-3">
          <Label className="text-sm font-medium">Platform Timezone</Label>
          <p className="text-xs text-muted-foreground">This affects your journal charts and replay session times.</p>
          
          <Select 
            value={currentTz} 
            onValueChange={(val) => onSave({ timezone: val })}
            open={isOpen}
            onOpenChange={setIsOpen}
          >
            <SelectTrigger className="w-full sm:w-[350px]">
              <SelectValue>
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-primary" />
                  <span>{currentTz}</span>
                </div>
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="glass-strong">
              <div className="flex items-center border-b border-border/40 px-3 py-2">
                <Search className="mr-2 h-4 w-4 text-muted-foreground" />
                <input
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  placeholder="Search timezones..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </div>
              <div className="max-h-[300px] overflow-y-auto">
                {filteredTimezones.length > 0 ? (
                  filteredTimezones.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      <div className="flex items-center justify-between w-full min-w-[300px]">
                        <span>{tz.replace(/_/g, ' ')}</span>
                        <span className="text-[10px] text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded ml-auto">
                          {getTimezoneOffset(tz)}
                        </span>
                      </div>
                    </SelectItem>
                  ))
                ) : (
                  <div className="p-4 text-center text-sm text-muted-foreground">No matches found</div>
                )}
              </div>
            </SelectContent>
          </Select>
          
          <div className="flex items-center gap-4 mt-2 p-3 rounded-lg bg-surface/40 border border-border/40 w-fit">
            <div className="flex items-center gap-2 text-xs">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Local Time:</span>
              <span className="font-mono font-medium">{getLocalTime(currentTz)}</span>
            </div>
            <div className="h-3 w-px bg-border/60" />
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Offset:</span>
              <span className="font-mono font-medium">{getTimezoneOffset(currentTz)}</span>
            </div>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

function SecuritySection({ email }: { email: string }) {
  return (
    <GlassCard className="p-6">
      <h2 className="text-base font-semibold mb-4">Security</h2>
      <div className="space-y-4">
        <div className="grid gap-2">
          <Label>Email</Label>
          <Input value={email} disabled />
        </div>
      </div>
    </GlassCard>
  );
}

function EmailSection() {
  const navigate = useNavigate();
  return (
    <GlassCard className="p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Email preferences</h2>
          <p className="text-xs text-muted-foreground">Manage reports, notifications and product updates.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate({ to: "/settings/email" })}>
          Configure emails
        </Button>
      </div>
    </GlassCard>
  );
}

function NotificationsSection() {
  return (
    <GlassCard className="p-6">
      <h2 className="text-base font-semibold mb-4">Notifications</h2>
      <div className="flex items-center justify-between">
        <Label>Push Notifications</Label>
        <Switch />
      </div>
    </GlassCard>
  );
}
