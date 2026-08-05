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
      
      <ProfileSection />
      <TradingSection />
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

function ProfileSection() {
  return (
    <GlassCard className="p-6">
      <h2 className="text-base font-semibold mb-4">Profile</h2>
      <div className="space-y-4">
        <div className="grid gap-2">
          <Label>Username</Label>
          <Input placeholder="Username" disabled />
        </div>
      </div>
    </GlassCard>
  );
}

function TradingSection() {
  return (
    <GlassCard className="p-6">
      <h2 className="text-base font-semibold mb-4">Trading Preferences</h2>
      <div className="space-y-4">
        <div className="grid gap-2">
          <Label>Default Timezone</Label>
          <Select defaultValue="UTC">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="UTC">UTC (Universal Time)</SelectItem>
              <SelectItem value="America/New_York">New York (EST)</SelectItem>
              <SelectItem value="London">London (GMT)</SelectItem>
            </SelectContent>
          </Select>
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
