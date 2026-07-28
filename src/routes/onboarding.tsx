import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  PartyPopper,
  Rocket,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  APP_NAME,
  EXPERIENCE_LEVELS,
  MARKETS_EXTENDED,
  MARKET_TO_PRIMARY,
  TRADING_GOALS,
  TRADING_STRATEGIES,
  TRADING_STYLES_EXTENDED,
  type ExperienceLevel,
  type MarketExtended,
  type TradingGoal,
  type TradingStrategy,
  type TradingStyleExtended,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import { trackOnboarding } from "@/lib/onboarding/analytics";
import { markChecklist } from "@/lib/onboarding/checklist";
import { createRandomReplaySession } from "@/lib/replay-studio.functions";

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

type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

const STEP_TITLES: Record<Step, string> = {
  0: "Welcome to TradersHIVE",
  1: "How experienced are you?",
  2: "Which markets do you trade?",
  3: "Pick your trading style",
  4: "Primary strategy",
  5: "Your trading goals",
  6: "Launch your first backtest",
  7: "You're officially backtesting",
};

const DB_STYLE_VALUES: TradingStyleExtended[] = [
  "scalper",
  "day_trader",
  "swing_trader",
  "position_trader",
  "algo",
];

function OnboardingPage() {
  const { profile, user, refresh } = useAuth();
  const navigate = useNavigate();
  const createRandom = useServerFn(createRandomReplaySession);

  const [step, setStep] = useState<Step>(0);
  const [saving, setSaving] = useState(false);
  const [launching, setLaunching] = useState(false);

  const [experience, setExperience] = useState<ExperienceLevel>(
    ((profile?.experience as ExperienceLevel) ?? "beginner"),
  );
  const [markets, setMarkets] = useState<MarketExtended[]>(
    (profile?.preferred_markets as MarketExtended[])?.length
      ? (profile!.preferred_markets as MarketExtended[])
      : [],
  );
  const [styles, setStyles] = useState<TradingStyleExtended[]>(
    profile?.trading_style ? [profile.trading_style as TradingStyleExtended] : [],
  );
  const [strategy, setStrategy] = useState<TradingStrategy | "">("");
  const [goals, setGoals] = useState<TradingGoal[]>(
    (profile?.goals as TradingGoal[]) ?? [],
  );

  useEffect(() => {
    trackOnboarding("onboarding_started");
  }, []);

  useEffect(() => {
    trackOnboarding("onboarding_step_viewed", { step: String(step) });
  }, [step]);

  const canNext = useMemo(() => {
    if (step === 2) return markets.length > 0;
    if (step === 3) return styles.length > 0;
    if (step === 5) return goals.length > 0;
    return true;
  }, [step, markets, styles, goals]);

  const persistPreferences = async (skipped = false) => {
    if (!user) return;
    const primaryDbStyle = (styles.find((s) => DB_STYLE_VALUES.includes(s)) ??
      "day_trader") as TradingStyleExtended;
    const payload = skipped
      ? { onboarded: true }
      : {
          onboarded: true,
          experience_level: experience,
          preferred_markets: markets,
          preferred_market: markets[0]
            ? (MARKET_TO_PRIMARY[markets[0]] as "forex" | "crypto" | "stocks" | "futures" | "indices")
            : null,
          trading_style: primaryDbStyle as
            | "scalper"
            | "day_trader"
            | "swing_trader"
            | "position_trader"
            | "algo",
          goals,
        };
    const { error } = await supabase.from("profiles").update(payload as never).eq("id", user.id);
    if (!skipped) {
      await supabase.from("user_preferences").upsert(
        {
          user_id: user.id,
          primary_goal: goals[0] ?? null,
        },
        { onConflict: "user_id" },
      );
    }
    if (error) throw error;
    await refresh();
  };

  const finish = async (skipped = false) => {
    if (!user) return;
    setSaving(true);
    try {
      await persistPreferences(skipped);
      if (skipped) {
        trackOnboarding("onboarding_skipped");
        toast.success("Onboarding skipped — update anytime in Settings");
        await navigate({ to: "/dashboard", replace: true });
      } else {
        trackOnboarding("onboarding_completed", {
          meta: { markets: markets.length, styles: styles.length, goals: goals.length, strategy },
        });
        markChecklist("complete_onboarding", true);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const launchFirstBacktest = async () => {
    if (!user) return;
    setLaunching(true);
    try {
      await persistPreferences(false);
      trackOnboarding("onboarding_completed", {
        meta: { markets: markets.length, styles: styles.length, goals: goals.length, strategy },
      });
      markChecklist("complete_onboarding", true);
      const row = (await createRandom()) as { id: string } | null;
      trackOnboarding("first_backtest_launched");
      markChecklist("create_first_backtest", true);
      if (row?.id) {
        toast.success("🎉 First backtest ready — enjoy the arena");
        await navigate({ to: "/replay/session", search: { id: row.id } as never });
      } else {
        await navigate({ to: "/replay", replace: true });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not launch backtest";
      toast.error(msg);
      setLaunching(false);
    }
  };

  const goNext = () => setStep((s) => (Math.min(7, s + 1) as Step));
  const goBack = () => setStep((s) => (Math.max(0, s - 1) as Step));

  const stepIndex = step;
  const totalSteps = 8;

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-40" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[600px] gradient-radial-glow opacity-70" />

      <div className="relative z-10 w-full max-w-2xl">
        <div className="mb-6 flex items-center justify-between text-xs text-muted-foreground">
          <span className="uppercase tracking-widest">
            Step {stepIndex + 1} of {totalSteps} · ≈ 2–3 min
          </span>
          {step < 7 ? (
            <button
              type="button"
              onClick={() => finish(true)}
              className="rounded transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Skip setup
            </button>
          ) : null}
        </div>

        <div className="mb-6 flex gap-1.5" role="progressbar" aria-valuemin={0} aria-valuemax={totalSteps} aria-valuenow={stepIndex + 1}>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={cn("h-1 flex-1 rounded-full transition-colors", i <= stepIndex ? "bg-primary" : "bg-border")}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.22 }}
          >
            <GlassCard className="p-8">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                {step === 0 ? (
                  <span className="inline-flex items-center gap-2">
                    {STEP_TITLES[step]} <span aria-hidden>👋</span>
                  </span>
                ) : (
                  STEP_TITLES[step]
                )}
              </h1>

              {step === 0 ? (
                <div className="mt-4 space-y-4 text-sm text-muted-foreground">
                  <p>
                    Welcome{profile?.first_name ? `, ${profile.first_name}` : ""}. Let's personalise
                    your workspace and get your first backtest running in a few minutes.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      { title: "Practice", body: "Replay real markets, risk-free." },
                      { title: "Improve", body: "Journal, review, and coach in one place." },
                      { title: "Compete", body: "Tournaments and leaderboards when you're ready." },
                    ].map((c) => (
                      <div key={c.title} className="rounded-xl border border-border/60 bg-card/40 p-4">
                        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
                          <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
                          {c.title}
                        </div>
                        <p className="text-xs">{c.body}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {step === 1 ? (
                <ChoiceGrid
                  hint="This tunes future recommendations. You can change it anytime."
                  items={EXPERIENCE_LEVELS.map((e) => ({ value: e.value, label: e.label, hint: e.hint }))}
                  value={experience}
                  onChange={(v) => setExperience(v as ExperienceLevel)}
                  columns={2}
                />
              ) : null}

              {step === 2 ? (
                <MultiGrid
                  hint="Pick every market you want to train on."
                  items={MARKETS_EXTENDED.map((m) => ({ value: m.value, label: m.label, emoji: m.emoji }))}
                  selected={markets}
                  onToggle={(v) =>
                    setMarkets((prev) =>
                      prev.includes(v as MarketExtended)
                        ? prev.filter((x) => x !== v)
                        : [...prev, v as MarketExtended],
                    )
                  }
                  columns={4}
                />
              ) : null}

              {step === 3 ? (
                <MultiGrid
                  hint="Choose every style that fits — we personalise analytics and coaching."
                  items={TRADING_STYLES_EXTENDED.map((s) => ({ value: s.value, label: s.label, hint: s.hint }))}
                  selected={styles}
                  onToggle={(v) =>
                    setStyles((prev) =>
                      prev.includes(v as TradingStyleExtended)
                        ? prev.filter((x) => x !== v)
                        : [...prev, v as TradingStyleExtended],
                    )
                  }
                  columns={2}
                />
              ) : null}

              {step === 4 ? (
                <div className="mt-4">
                  <p className="text-sm text-muted-foreground">
                    Optional — helps the AI Coach ground its feedback in your framework.
                  </p>
                  <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {TRADING_STRATEGIES.map((s) => {
                      const active = strategy === s.value;
                      return (
                        <button
                          key={s.value}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setStrategy(active ? "" : s.value)}
                          className={cn(
                            "min-h-11 rounded-xl border px-3 py-2 text-sm transition",
                            active
                              ? "border-primary bg-primary/10 text-primary shadow-elegant"
                              : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                          )}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {step === 5 ? (
                <div className="mt-4">
                  <p className="text-sm text-muted-foreground">
                    What do you want to achieve? Pick everything that resonates.
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
                            {selected ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {step === 6 ? (
                <div className="mt-4 space-y-5 text-sm text-muted-foreground">
                  <p>
                    We'll open a ready-to-play replay with a $10,000 balance on a random historical
                    day so you can hit the ground running.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Fact k="Balance" v="$10,000" />
                    <Fact k="Timeframe" v="15m" />
                    <Fact k="Market" v={markets[0] ? MARKETS_EXTENDED.find((m) => m.value === markets[0])?.label ?? "Auto" : "Auto"} />
                    <Fact k="Date" v="Surprise historical day" />
                  </div>
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs text-foreground">
                    Prefer to explore first? Click <em>Skip &amp; go to dashboard</em>. You can start a
                    backtest anytime from Replay Studio.
                  </div>
                </div>
              ) : null}

              {step === 7 ? (
                <div className="mt-6 space-y-4 text-center">
                  <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-success/10 text-success">
                    <PartyPopper className="h-8 w-8" aria-hidden />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Take your first trade, review your session, and ask the AI Coach for feedback.
                  </p>
                </div>
              ) : null}

              <div className="mt-8 flex items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={step === 0}
                  onClick={goBack}
                  className={cn("min-h-11", step === 0 && "invisible")}
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden />
                  Back
                </Button>

                {step < 6 ? (
                  <Button
                    type="button"
                    disabled={!canNext}
                    onClick={() => {
                      trackOnboarding("onboarding_step_completed", { step: String(step) });
                      goNext();
                    }}
                    className="h-11 min-w-32 gradient-primary text-primary-foreground shadow-elegant"
                  >
                    Continue
                    <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
                  </Button>
                ) : null}

                {step === 6 ? (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={saving || launching}
                      onClick={() => finish(false).then(() => navigate({ to: "/dashboard", replace: true }))}
                      className="min-h-11"
                    >
                      Skip &amp; go to dashboard
                    </Button>
                    <Button
                      type="button"
                      disabled={launching || saving}
                      onClick={launchFirstBacktest}
                      className="h-11 min-w-40 gradient-primary text-primary-foreground shadow-elegant"
                    >
                      {launching ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <>
                          <Rocket className="mr-1 h-4 w-4" aria-hidden />
                          Start First Backtest
                        </>
                      )}
                    </Button>
                  </div>
                ) : null}

                {step === 7 ? (
                  <Button
                    type="button"
                    onClick={() => navigate({ to: "/dashboard", replace: true })}
                    className="h-11 min-w-32 gradient-primary text-primary-foreground shadow-elegant"
                  >
                    Enter the arena
                  </Button>
                ) : null}
              </div>
            </GlassCard>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- primitives */

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{k}</p>
      <p className="text-sm text-foreground">{v}</p>
    </div>
  );
}

function ChoiceGrid({
  items,
  value,
  onChange,
  hint,
  columns = 2,
}: {
  items: { value: string; label: string; hint?: string }[];
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  columns?: 2 | 3 | 4;
}) {
  return (
    <div className="mt-4">
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
      <div
        className={cn(
          "mt-5 grid gap-3",
          columns === 2 && "sm:grid-cols-2",
          columns === 3 && "sm:grid-cols-3",
          columns === 4 && "grid-cols-2 sm:grid-cols-4",
        )}
      >
        {items.map((it) => {
          const active = value === it.value;
          return (
            <button
              key={it.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(it.value)}
              className={cn(
                "flex min-h-11 flex-col items-start gap-1 rounded-2xl border p-4 text-left transition",
                active
                  ? "border-primary bg-primary/10 text-primary shadow-elegant"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              <span className="text-sm font-semibold">{it.label}</span>
              {it.hint ? <span className="text-xs">{it.hint}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MultiGrid({
  items,
  selected,
  onToggle,
  hint,
  columns = 4,
}: {
  items: { value: string; label: string; emoji?: string; hint?: string }[];
  selected: string[];
  onToggle: (v: string) => void;
  hint?: string;
  columns?: 2 | 3 | 4;
}) {
  return (
    <div className="mt-4">
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
      <div
        className={cn(
          "mt-5 grid gap-3",
          columns === 2 && "sm:grid-cols-2",
          columns === 3 && "sm:grid-cols-3",
          columns === 4 && "grid-cols-2 sm:grid-cols-4",
        )}
      >
        {items.map((it) => {
          const active = selected.includes(it.value);
          return (
            <button
              key={it.value}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(it.value)}
              className={cn(
                "flex min-h-11 flex-col items-start gap-1 rounded-2xl border p-4 text-left transition",
                active
                  ? "border-primary bg-primary/10 text-primary shadow-elegant"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                {it.emoji ? <span aria-hidden>{it.emoji}</span> : null}
                {it.label}
              </span>
              {it.hint ? <span className="text-xs">{it.hint}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
