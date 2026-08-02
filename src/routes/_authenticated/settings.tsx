import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { useProductTour } from "@/components/tour/ProductTour";

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
import { AvatarUpload } from "@/components/auth/AvatarUpload";
import { PasswordStrength } from "@/components/auth/PasswordStrength";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  COUNTRIES,
  MARKETS,
  TIMEZONES,
  TRADING_STYLES,
  type Market,
} from "@/lib/constants";
import { passwordSchema, usernameSchema } from "@/lib/auth-schemas";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { QaModeSection } from "@/components/qa/QaModeSection";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — TradersHIVE Arena" }] }),
  component: SettingsPage,
});

type NotifKey =
  | "notify_weekly_report"
  | "notify_challenges"
  | "notify_rank_changes"
  | "notify_product_updates"
  | "notify_email"
  | "notify_push";
type Settings = Record<NotifKey, boolean>;

const NOTIF_ROWS: { key: NotifKey; label: string; hint: string }[] = [
  { key: "notify_weekly_report", label: "Weekly performance report", hint: "Monday morning summary" },
  { key: "notify_challenges", label: "New challenges available", hint: "As soon as they drop" },
  { key: "notify_rank_changes", label: "Rank changes", hint: "When you move up or down a league" },
  { key: "notify_product_updates", label: "Product updates", hint: "New features & seasons" },
  { key: "notify_email", label: "Email notifications", hint: "Master toggle for emails" },
  { key: "notify_push", label: "Push notifications", hint: "In-app + browser push" },
];

function SettingsPage() {
  const { profile, user, refresh } = useAuth();
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
    profile?.display_name || profile?.username || "T";
  const initials = name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const doSignOut = async () => {
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
      setSignOutOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not sign you out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  };


  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Manage your account, security, and preferences." />

      <GlassCard className="p-6">
        <h2 className="text-base font-semibold">Profile picture</h2>
        <p className="text-xs text-muted-foreground">Shown across the arena, leaderboards, and journal.</p>
        <div className="mt-5">
          <AvatarUpload fallbackText={initials} />
        </div>
      </GlassCard>

      <ProfileSection />
      <EmailVerificationNotice />
      <TradingSection />
      <SecuritySection email={user?.email ?? ""} />
      <NotificationsSection />
      <ProductTourSection />
      <QaModeSection />




      <GlassCard className="border-danger/30 p-6">
        <h2 className="text-base font-semibold text-danger">Danger zone</h2>
        <p className="text-xs text-muted-foreground">
          Deleting your account permanently removes your profile, journal, and stats.
        </p>
        <Button
          variant="destructive"
          className="mt-5"
          onClick={() => setSignOutOpen(true)}
        >
          Sign out & request deletion
        </Button>
      </GlassCard>

      <ConfirmDialog
        open={signOutOpen}
        onOpenChange={setSignOutOpen}
        title="Sign out & request deletion?"
        description="You will be signed out of this device. To permanently delete your data, please contact support after signing out."
        confirmLabel="Sign out"
        destructive
        loading={signingOut}
        onConfirm={doSignOut}
      />
    </div>
  );
}

/* ---------------- Profile ---------------- */

function ProfileSection() {
  const { profile, user, refresh } = useAuth();
  const [firstName, setFirstName] = useState(profile?.first_name ?? "");
  const [lastName, setLastName] = useState(profile?.last_name ?? "");
  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [username, setUsername] = useState(profile?.username ?? "");
  const [country, setCountry] = useState(profile?.country ?? "United States");
  const [timezone, setTimezone] = useState(profile?.timezone ?? "UTC");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFirstName(profile?.first_name ?? "");
    setLastName(profile?.last_name ?? "");
    setDisplayName(profile?.display_name ?? "");
    setUsername(profile?.username ?? "");
    setCountry(profile?.country ?? "United States");
    setTimezone(profile?.timezone ?? "UTC");
  }, [profile]);

  const save = async () => {
    if (!user) return;
    const parsedUsername = usernameSchema.safeParse(username);
    if (!parsedUsername.success) {
      toast.error(parsedUsername.error.issues[0].message);
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        display_name: displayName.trim() || null,
        username: parsedUsername.data,
        country,
        timezone,
      })
      .eq("id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    await refresh();
    toast.success("Profile updated");
  };

  return (
    <GlassCard className="p-6">
      <h2 className="text-base font-semibold">Profile</h2>
      <p className="text-xs text-muted-foreground">This is how other traders see you.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="first-name">First name</Label>
          <Input id="first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={40} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="last-name">Last name</Label>
          <Input id="last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={40} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="username">Username</Label>
          <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={24} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="display-name">Display name</Label>
          <Input id="display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} />
        </div>
        <div className="space-y-1.5">
          <Label>Country</Label>
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-[280px]">
              {COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Timezone</Label>
          {/* Options are pre-sorted by UTC offset and labelled "UTC+X · Zone"
              so long names stay readable inside the trigger. */}
          <SearchableSelect
            value={timezone}
            onChange={setTimezone}
            options={getTimezoneOptions()}
            ariaLabel="Timezone"
            placeholder="Select timezone"
            searchPlaceholder="Search city or UTC offset…"
            className="text-xs [&_*]:text-xs"
          />
        </div>

      </div>
      <div className="mt-5 flex justify-end">
        <Button onClick={save} disabled={saving} className="gradient-primary text-primary-foreground">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
        </Button>
      </div>
    </GlassCard>
  );
}

/* ---------------- Trading prefs ---------------- */

function TradingSection() {
  const { profile, user, refresh } = useAuth();
  const [markets, setMarkets] = useState<Market[]>(
    (profile?.preferred_markets as Market[]) ?? [],
  );
  const [style, setStyle] = useState<string>(profile?.trading_style ?? "day_trader");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMarkets((profile?.preferred_markets as Market[]) ?? []);
    setStyle(profile?.trading_style ?? "day_trader");
  }, [profile]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        preferred_markets: markets,
        preferred_market: (markets[0] ?? null) as any,
        trading_style: style as any,
      })
      .eq("id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    await refresh();
    toast.success("Trading preferences saved");
  };

  return (
    <GlassCard className="p-6">
      <h2 className="text-base font-semibold">Trading preferences</h2>
      <p className="text-xs text-muted-foreground">Tune your dashboards, challenges, and coach.</p>
      <div className="mt-5 space-y-5">
        <div>
          <Label className="mb-2 block text-sm">Preferred markets</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {MARKETS.map((m) => {
              const selected = markets.includes(m.value);
              return (
                <button
                  type="button"
                  key={m.value}
                  onClick={() =>
                    setMarkets((prev) =>
                      selected ? prev.filter((v) => v !== m.value) : [...prev, m.value],
                    )
                  }
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-xl border px-3 py-3 text-sm font-medium transition",
                    selected
                      ? "border-primary bg-primary/10 text-primary shadow-elegant"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                  )}
                  aria-pressed={selected}
                >
                  <span className="text-lg">{m.emoji}</span>
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Trading style</Label>
          <Select value={style} onValueChange={setStyle}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TRADING_STYLES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label} · {s.hint}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="mt-5 flex justify-end">
        <Button onClick={save} disabled={saving} className="gradient-primary text-primary-foreground">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save preferences"}
        </Button>
      </div>
    </GlassCard>
  );
}

/* ---------------- Security ---------------- */

function SecuritySection({ email }: { email: string }) {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const change = async () => {
    if (!current) return toast.error("Enter your current password");
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    if (password !== confirm) return toast.error("Passwords do not match");
    if (password === current) return toast.error("New password must be different from your current password");
    setSaving(true);
    // Re-verify identity with the provider before allowing a password change.
    const { error: reauthError } = await supabase.auth.signInWithPassword({ email, password: current });
    if (reauthError) {
      setSaving(false);
      return toast.error("Current password is incorrect");
    }
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) return toast.error(error.message);
    setCurrent(""); setPassword(""); setConfirm("");
    toast.success("Password updated");
  };

  return (
    <GlassCard className="p-6">
      <h2 className="text-base font-semibold">Security</h2>
      <p className="text-xs text-muted-foreground">Signed in as <span className="text-foreground">{email}</span>.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="current-pw">Current password</Label>
          <Input id="current-pw" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          <p className="text-[11px] text-muted-foreground">Required to confirm it&apos;s really you before changing your password.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-pw">New password</Label>
          <Input id="new-pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <PasswordStrength password={password} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-pw">Confirm password</Label>
          <Input id="confirm-pw" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
      </div>
      <div className="mt-5 flex justify-end">
        <Button onClick={change} disabled={saving || !current || !password} className="gradient-primary text-primary-foreground">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update password"}
        </Button>
      </div>

    </GlassCard>
  );
}

/* ---------------- Notifications ---------------- */

function NotificationsSection() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data } = await supabase
        .from("user_settings")
        .select("notify_weekly_report, notify_challenges, notify_rank_changes, notify_product_updates, notify_email, notify_push")
        .eq("user_id", user.id)
        .maybeSingle();
      setSettings(
        (data as Settings) ?? {
          notify_weekly_report: true,
          notify_challenges: true,
          notify_rank_changes: false,
          notify_product_updates: true,
          notify_email: true,
          notify_push: true,
        },
      );
      setLoading(false);
    })();
  }, [user]);

  const toggle = async (key: NotifKey) => {
    if (!user || !settings) return;
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next);
    const { error } = await supabase
      .from("user_settings")
      .upsert({ user_id: user.id, ...next }, { onConflict: "user_id" });
    if (error) {
      setSettings(settings);
      toast.error(error.message);
    }
  };

  return (
    <GlassCard className="p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Notifications</h2>
          <p className="text-xs text-muted-foreground">Choose when we should ping you.</p>
        </div>
        <div className="flex flex-col items-end gap-1 text-xs">
          <a
            href="/settings/email"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Manage email preferences →
          </a>
          <a
            href="/feedback"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Send feedback / report a bug →
          </a>
        </div>
      </div>
      <div className="mt-5 space-y-4">
        {loading || !settings ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-4">
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-2.5 w-64 max-w-full" />
                </div>
                <Skeleton className="h-5 w-9 rounded-full" />
              </div>
            ))}
          </div>
        ) : (
          NOTIF_ROWS.map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm">{row.label}</p>
                <p className="text-[11px] text-muted-foreground">{row.hint}</p>
              </div>
              <Switch checked={settings[row.key]} onCheckedChange={() => toggle(row.key)} />
            </div>
          ))
        )}
      </div>
    </GlassCard>
  );
}

/* ---------------- Product Tour ---------------- */

function ProductTourSection() {
  const { start } = useProductTour();
  return (
    <GlassCard className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Onboarding</h2>
          <p className="text-xs text-muted-foreground">
            Replay the guided product tour to revisit the core features of TradersHIVE.
          </p>
        </div>
        <Button variant="outline" onClick={start} className="gap-2">
          <Play className="h-4 w-4" />
          Replay Product Tour
        </Button>
      </div>
    </GlassCard>
  );
}

/* ---------------- Email verification (optional, non-blocking) ---------------- */

function EmailVerificationNotice() {
  const { user } = useAuth();
  const verified = Boolean(user?.email_confirmed_at);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (!user?.email || verified) return null;

  const resend = async () => {
    setSending(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: user.email!,
      options: { emailRedirectTo: `${window.location.origin}/verify-email` },
    });
    setSending(false);
    if (error) return toast.error(error.message);
    toast.success("Verification email sent");
    setCooldown(30);
  };

  return (
    <GlassCard className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">Verify your email</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Optional during beta. Verifying{" "}
            <span className="font-medium text-foreground">{user.email}</span> helps us
            recover your account and keeps notifications flowing.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={resend}
          disabled={sending || cooldown > 0}
          className="gap-2"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : cooldown > 0 ? (
            `Resend in ${cooldown}s`
          ) : (
            "Send verification email"
          )}
        </Button>
      </div>
    </GlassCard>
  );
}

