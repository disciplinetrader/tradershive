import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  APP_NAME,
  MARKETS,
  TRADING_GOALS,
  TRADING_STYLES,
  type Market,
  type TradingGoal,
  type TradingStyle,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/onboarding")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      throw redirect({ to: "/auth", search: { redirect: location.href } });
    }
  },
  head: () => ({
    meta: [
      { title: `Welcome to ${APP_NAME}` },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OnboardingPage,
});

type Step = 0 | 1 | 2 | 3 | 4;
const STEP_TITLES = [
  "Welcome to the arena",
  "Choose your markets",
  "Pick your style",
  "Set your goals",
  "You're all set",
];

function OnboardingPage() {
  const { profile, user, refresh } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(0);
  const [saving, setSaving] = useState(false);

  const [markets, setMarkets] = useState<Market[]>(
    (profile?.preferred_markets as Market[]) ?? [],
  );
  const [style, setStyle] = useState<TradingStyle>(
    ((profile?.trading_style as TradingStyle) ?? "day_trader"),
  );
  const [goals, setGoals] = useState<TradingGoal[]>(
    (profile?.goals as TradingGoal[]) ?? [],
  );

  const canNext = useMemo(() => {
    if (step === 1) return markets.length > 0;
    if (step === 3) return goals.length > 0;
    return true;
  }, [step, markets, goals]);

  const finish = async (skipped = false) => {
    if (!user) return;
    setSaving(true);
    const payload = skipped
      ? { onboarded: true }
      : {
          onboarded: true,
          preferred_markets: markets,
          preferred_market: (markets[0] ?? null) as Market | null,
          trading_style: style,
          goals,
        };
    const { error } = await supabase.from("profiles").update(payload as any).eq("id", user.id);
    if (goals[0] && !skipped) {
      await supabase.from("user_preferences").upsert(
        { user_id: user.id, primary_goal: goals[0] },
        { onConflict: "user_id" },
      );
    }
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await refresh();
    toast.success(skipped ? "Onboarding skipped — you can update anytime" : "You're in. Welcome!");
    await navigate({ to: "/dashboard", replace: true });
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-40" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[600px] gradient-radial-glow opacity-70" />

      <div className="relative z-10 w-full max-w-2xl">
        <div className="mb-6 flex items-center justify-between text-xs text-muted-foreground">
          <span className="uppercase tracking-widest">Step {step + 1} of 5</span>
          <button
            type="button"
            onClick={() => finish(true)}
            className="transition hover:text-foreground"
          >
            Skip for now
          </button>
        </div>

        <div className="mb-6 flex gap-1.5">
          {STEP_TITLES.map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                i <= step ? "bg-primary" : "bg-border",
              )}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
          >
            <GlassCard className="p-8">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                {STEP_TITLES[step]}
              </h1>

              {step === 0 ? (
                <div className="mt-4 space-y-4 text-sm text-muted-foreground">
                  <p>
                    Welcome{profile?.first_name ? `, ${profile.first_name}` : ""}. In the next
                    minute we'll tune the arena around how you trade — markets, style, and goals.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      { title: "Practice", body: "Live-data paper trading, zero risk." },
                      { title: "Compete", body: "Daily & weekly ladders + seasons." },
                      { title: "Improve", body: "Journal, analytics, and coach reviews." },
                    ].map((c) => (
                      <div key={c.title} className="rounded-xl border border-border/60 bg-card/40 p-4">
                        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
                          <Sparkles className="h-3.5 w-3.5 text-primary" />
                          {c.title}
                        </div>
                        <p className="text-xs">{c.body}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {step === 1 ? (
                <div className="mt-4">
                  <p className="text-sm text-muted-foreground">
                    Which markets do you want to train on? Pick one or more.
                  </p>
                  <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {MARKETS.map((m) => {
                      const selected = markets.includes(m.value);
                      return (
                        <button
                          key={m.value}
                          type="button"
                          onClick={() =>
                            setMarkets((prev) =>
                              selected ? prev.filter((v) => v !== m.value) : [...prev, m.value],
                            )
                          }
                          aria-pressed={selected}
                          className={cn(
                            "flex flex-col items-center gap-2 rounded-2xl border p-5 text-sm font-medium transition",
                            selected
                              ? "border-primary bg-primary/10 text-primary shadow-elegant"
                              : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                          )}
                        >
                          <span className="text-2xl">{m.emoji}</span>
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {step === 2 ? (
                <div className="mt-4">
                  <p className="text-sm text-muted-foreground">
                    What's your primary trading style?
                  </p>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {TRADING_STYLES.map((s) => {
                      const selected = style === s.value;
                      return (
                        <button
                          key={s.value}
                          type="button"
                          onClick={() => setStyle(s.value)}
                          aria-pressed={selected}
                          className={cn(
                            "flex items-start gap-3 rounded-2xl border p-4 text-left transition",
                            selected
                              ? "border-primary bg-primary/10 text-primary shadow-elegant"
                              : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                          )}
                        >
                          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                            <Sparkles className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">{s.label}</p>
                            <p className="text-xs">{s.hint}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {step === 3 ? (
                <div className="mt-4">
                  <p className="text-sm text-muted-foreground">
                    What do you want to accomplish here? Pick everything that resonates.
                  </p>
                  <div className="mt-5 grid gap-3">
                    {TRADING_GOALS.map((g) => {
                      const selected = goals.includes(g.value);
                      return (
                        <button
                          key={g.value}
                          type="button"
                          onClick={() =>
                            setGoals((prev) =>
                              selected ? prev.filter((v) => v !== g.value) : [...prev, g.value],
                            )
                          }
                          aria-pressed={selected}
                          className={cn(
                            "flex items-center justify-between gap-3 rounded-2xl border p-4 text-left transition",
                            selected
                              ? "border-primary bg-primary/10 text-primary shadow-elegant"
                              : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                          )}
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">{g.label}</p>
                            <p className="text-xs">{g.hint}</p>
                          </div>
                          <div
                            className={cn(
                              "grid h-6 w-6 place-items-center rounded-full border transition",
                              selected ? "border-primary bg-primary text-primary-foreground" : "border-border",
                            )}
                          >
                            {selected ? <CheckCircle2 className="h-4 w-4" /> : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {step === 4 ? (
                <div className="mt-6 space-y-4 text-center">
                  <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-success/10 text-success">
                    <CheckCircle2 className="h-8 w-8" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Your arena is tuned. Time to make your first trade, log your first setup, or
                    join today's challenge.
                  </p>
                  <div className="mx-auto grid max-w-md gap-2 pt-2 text-left sm:grid-cols-2">
                    <SummaryRow label="Markets" value={markets.map((m) => MARKETS.find((x) => x.value === m)?.label).join(", ") || "—"} />
                    <SummaryRow label="Style" value={TRADING_STYLES.find((s) => s.value === style)?.label ?? "—"} />
                    <SummaryRow label="Goals" value={goals.map((g) => TRADING_GOALS.find((x) => x.value === g)?.label).join(", ") || "—"} className="sm:col-span-2" />
                  </div>
                </div>
              ) : null}

              <div className="mt-8 flex items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={step === 0}
                  onClick={() => setStep((s) => (s - 1) as Step)}
                  className={cn(step === 0 && "invisible")}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                {step < 4 ? (
                  <Button
                    type="button"
                    disabled={!canNext}
                    onClick={() => setStep((s) => (s + 1) as Step)}
                    className="h-11 min-w-32 gradient-primary text-primary-foreground shadow-elegant"
                  >
                    Continue
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    disabled={saving}
                    onClick={() => finish(false)}
                    className="h-11 min-w-32 gradient-primary text-primary-foreground shadow-elegant"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enter the arena"}
                  </Button>
                )}
              </div>
            </GlassCard>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border/60 bg-card/40 px-3 py-2", className)}>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}
