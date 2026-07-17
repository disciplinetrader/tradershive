import { createFileRoute, Link, redirect, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Mail,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GlassCard } from "@/components/ui/glass-card";
import { BrandPanel } from "@/components/auth/BrandPanel";
import { PasswordStrength } from "@/components/auth/PasswordStrength";
import { SocialButtons } from "@/components/auth/SocialButtons";
import { supabase } from "@/integrations/supabase/client";
import {
  APP_NAME,
  COUNTRIES,
  EXPERIENCE_LEVELS,
  MARKETS,
  TIMEZONES,
  TRADING_STYLES,
} from "@/lib/constants";
import {
  loginSchema,
  registerSchema,
  forgotSchema,
  type LoginValues,
  type RegisterValues,
  type ForgotValues,
} from "@/lib/auth-schemas";
import { cn } from "@/lib/utils";

const authSearchSchema = z.object({
  mode: z.enum(["login", "register", "forgot"]).optional(),
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: authSearchSchema,
  beforeLoad: async ({ search }) => {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      throw redirect({ to: (search.redirect as any) || "/dashboard" });
    }
  },
  head: () => ({
    meta: [
      { title: `Sign in — ${APP_NAME}` },
      {
        name: "description",
        content: "Sign in or create your TradersHIVE Arena account to train, compete, and climb the global leaderboard.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

type Mode = "login" | "register" | "forgot";

function AuthPage() {
  const searchParams = useSearch({ from: "/auth" });
  const [mode, setMode] = useState<Mode>((searchParams.mode as Mode) ?? "login");

  useEffect(() => {
    if (searchParams.mode && searchParams.mode !== mode) setMode(searchParams.mode as Mode);
     
  }, [searchParams.mode]);

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <BrandPanel />

      <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 sm:px-8">
        <div className="pointer-events-none absolute inset-0 grid-bg opacity-30 lg:hidden" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[500px] gradient-radial-glow opacity-60 lg:hidden" />

        <div className="relative z-10 w-full max-w-lg">
          <Link
            to="/"
            className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to home
          </Link>

          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              <GlassCard className="p-6 sm:p-8">
                <div className="mb-6">
                  <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                    {mode === "register"
                      ? "Create your account"
                      : mode === "forgot"
                        ? "Reset your password"
                        : "Welcome back"}
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {mode === "register"
                      ? "Enter the arena and start training risk-free."
                      : mode === "forgot"
                        ? "We'll email you a secure link to reset."
                        : "Sign in to continue your season."}
                  </p>
                </div>

                {mode !== "forgot" ? (
                  <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)} className="mb-6">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="login">Sign in</TabsTrigger>
                      <TabsTrigger value="register">Create account</TabsTrigger>
                    </TabsList>
                  </Tabs>
                ) : null}

                {mode === "login" ? <LoginForm onForgot={() => setMode("forgot")} /> : null}
                {mode === "register" ? <RegisterForm /> : null}
                {mode === "forgot" ? <ForgotForm onSwitch={() => setMode("login")} /> : null}

                {mode !== "forgot" ? (
                  <>
                    <div className="my-6 flex items-center gap-3 text-[11px] uppercase tracking-widest text-muted-foreground">
                      <div className="h-px flex-1 bg-border" />
                      or
                      <div className="h-px flex-1 bg-border" />
                    </div>
                    <SocialButtons mode={mode === "register" ? "signup" : "signin"} />
                  </>
                ) : null}

                <p className="mt-6 text-center text-xs text-muted-foreground">
                  {mode === "register" ? (
                    <>Already have an account?{" "}
                      <button className="font-semibold text-primary hover:underline" onClick={() => setMode("login")}>
                        Sign in
                      </button>
                    </>
                  ) : mode === "login" ? (
                    <>Don't have an account?{" "}
                      <button className="font-semibold text-primary hover:underline" onClick={() => setMode("register")}>
                        Create account
                      </button>
                    </>
                  ) : (
                    <button className="font-semibold text-primary hover:underline" onClick={() => setMode("login")}>
                      Back to sign in
                    </button>
                  )}
                </p>
              </GlassCard>
            </motion.div>
          </AnimatePresence>

          <p className="mt-6 text-center text-[11px] text-muted-foreground">
            By continuing you agree to the Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Login                                                             */
/* ------------------------------------------------------------------ */

function LoginForm({ onForgot }: { onForgot: () => void }) {
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" });
  const [showPw, setShowPw] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", remember: true },
  });

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={handleSubmit(async (values) => {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: values.email,
          password: values.password,
        });
        if (error) {
          toast.error(error.message);
          return;
        }
        toast.success("Welcome back");
        // Route based on onboarded flag
        const uid = data.user?.id;
        if (uid) {
          const { data: p } = await supabase
            .from("profiles")
            .select("onboarded")
            .eq("id", uid)
            .maybeSingle();
          if (p && !p.onboarded) {
            await navigate({ to: "/onboarding", replace: true });
            return;
          }
        }
        await navigate({ to: (search.redirect as any) || "/dashboard", replace: true });
      })}
    >
      <Field label="Email" htmlFor="login-email" error={errors.email?.message}>
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
          placeholder="you@arena.io"
          {...register("email")}
        />
      </Field>
      <Field label="Password" htmlFor="login-password" error={errors.password?.message}>
        <div className="relative">
          <Input
            id="login-password"
            type={showPw ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••"
            {...register("password")}
          />
          <button
            type="button"
            aria-label={showPw ? "Hide password" : "Show password"}
            onClick={() => setShowPw((v) => !v)}
            className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition hover:text-foreground"
          >
            {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </Field>
      <div className="flex items-center justify-between text-xs">
        <label className="inline-flex cursor-pointer items-center gap-2">
          <Checkbox defaultChecked {...(register("remember") as any)} />
          <span className="text-muted-foreground">Remember me</span>
        </label>
        <button
          type="button"
          onClick={onForgot}
          className="font-medium text-muted-foreground transition hover:text-foreground"
        >
          Forgot password?
        </button>
      </div>
      <Button
        type="submit"
        disabled={isSubmitting}
        className="h-11 w-full gradient-primary text-primary-foreground shadow-elegant"
      >
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
      </Button>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/*  Register (2-step)                                                 */
/* ------------------------------------------------------------------ */

function RegisterForm() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [showPw, setShowPw] = useState(false);

  const detectedTz =
    (typeof Intl !== "undefined" && Intl.DateTimeFormat().resolvedOptions().timeZone) || "UTC";
  const tzDefault = (TIMEZONES as readonly string[]).includes(detectedTz) ? detectedTz : "UTC";

  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    mode: "onBlur",
    defaultValues: {
      first_name: "",
      last_name: "",
      username: "",
      email: "",
      password: "",
      confirm_password: "",
      country: "United States",
      timezone: tzDefault as any,
      experience: "beginner",
      preferred_markets: [],
      trading_style: "intraday",
      accept_terms: undefined as unknown as true,
    },
  });

  const {
    register,
    handleSubmit,
    control,
    trigger,
    watch,
    formState: { errors, isSubmitting },
  } = form;

  const pwValue = watch("password");

  const goNext = async () => {
    const ok = await trigger([
      "first_name",
      "last_name",
      "username",
      "email",
      "password",
      "confirm_password",
    ]);
    if (ok) setStep(2);
  };

  const onSubmit = handleSubmit(async (values) => {
    const { error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        emailRedirectTo: `${window.location.origin}/onboarding`,
        data: {
          username: values.username,
          display_name: `${values.first_name} ${values.last_name}`.trim(),
          first_name: values.first_name,
          last_name: values.last_name,
          country: values.country,
          timezone: values.timezone,
          experience: values.experience,
          preferred_market: values.preferred_markets[0] ?? null,
          trading_style: values.trading_style,
          preferred_markets: values.preferred_markets,
          accepted_terms: true,
        },
      },
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Account created — check your email to verify.");
    await navigate({ to: "/verify-email", search: { email: values.email }, replace: true });
  });

  return (
    <form className="space-y-4" noValidate onSubmit={onSubmit}>
      <StepDots active={step} />

      {step === 1 ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" htmlFor="reg-first" error={errors.first_name?.message}>
              <Input id="reg-first" autoComplete="given-name" {...register("first_name")} />
            </Field>
            <Field label="Last name" htmlFor="reg-last" error={errors.last_name?.message}>
              <Input id="reg-last" autoComplete="family-name" {...register("last_name")} />
            </Field>
          </div>
          <Field
            label="Username"
            htmlFor="reg-username"
            error={errors.username?.message}
            hint="Public handle. Letters, numbers, and underscores."
          >
            <Input id="reg-username" autoComplete="username" placeholder="satoshi" {...register("username")} />
          </Field>
          <Field label="Email" htmlFor="reg-email" error={errors.email?.message}>
            <Input id="reg-email" type="email" autoComplete="email" placeholder="you@arena.io" {...register("email")} />
          </Field>
          <Field label="Password" htmlFor="reg-password" error={errors.password?.message}>
            <div className="relative">
              <Input
                id="reg-password"
                type={showPw ? "text" : "password"}
                autoComplete="new-password"
                {...register("password")}
              />
              <button
                type="button"
                aria-label={showPw ? "Hide password" : "Show password"}
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition hover:text-foreground"
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <PasswordStrength password={pwValue ?? ""} />
          </Field>
          <Field label="Confirm password" htmlFor="reg-confirm" error={errors.confirm_password?.message}>
            <Input
              id="reg-confirm"
              type={showPw ? "text" : "password"}
              autoComplete="new-password"
              {...register("confirm_password")}
            />
          </Field>
          <Button
            type="button"
            onClick={goNext}
            className="h-11 w-full gradient-primary text-primary-foreground shadow-elegant"
          >
            Continue
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Country" error={errors.country?.message}>
              <Controller
                name="country"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-[280px]">
                      {COUNTRIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label="Timezone" error={errors.timezone?.message}>
              <Controller
                name="timezone"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-[280px]">
                      {TIMEZONES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </div>

          <Field label="Trading experience" error={errors.experience?.message}>
            <Controller
              name="experience"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXPERIENCE_LEVELS.map((e) => (
                      <SelectItem key={e.value} value={e.value}>
                        <div className="flex flex-col">
                          <span>{e.label}</span>
                          <span className="text-[11px] text-muted-foreground">{e.hint}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          <div>
            <Label className="mb-2 block text-sm">Preferred markets</Label>
            <Controller
              name="preferred_markets"
              control={control}
              render={({ field }) => (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {MARKETS.map((m) => {
                    const selected = field.value.includes(m.value);
                    return (
                      <button
                        type="button"
                        key={m.value}
                        onClick={() => {
                          const next = selected
                            ? field.value.filter((v) => v !== m.value)
                            : [...field.value, m.value];
                          field.onChange(next);
                        }}
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
              )}
            />
            {errors.preferred_markets ? (
              <p className="mt-1 flex items-center gap-1 text-xs text-danger">
                <AlertCircle className="h-3 w-3" />
                {errors.preferred_markets.message as string}
              </p>
            ) : null}
          </div>

          <Field label="Trading style" error={errors.trading_style?.message}>
            <Controller
              name="trading_style"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRADING_STYLES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        <div className="flex items-center gap-2">
                          <span>{s.label}</span>
                          <span className="text-[11px] text-muted-foreground">· {s.hint}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          <Controller
            name="accept_terms"
            control={control}
            render={({ field }) => (
              <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-border/60 bg-card/40 p-3 text-xs text-muted-foreground">
                <Checkbox
                  checked={!!field.value}
                  onCheckedChange={(v) => field.onChange(v === true ? true : undefined)}
                  className="mt-0.5"
                />
                <span>
                  I accept the <a href="#" className="text-primary underline">Terms of Service</a>{" "}
                  and <a href="#" className="text-primary underline">Privacy Policy</a>.
                </span>
              </label>
            )}
          />
          {errors.accept_terms ? (
            <p className="-mt-2 flex items-center gap-1 text-xs text-danger">
              <AlertCircle className="h-3 w-3" />
              {errors.accept_terms.message as string}
            </p>
          ) : null}

          <div className="flex gap-2">
            <Button type="button" variant="outline" className="glass h-11 flex-1" onClick={() => setStep(1)}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="h-11 flex-1 gradient-primary text-primary-foreground shadow-elegant"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
            </Button>
          </div>
        </>
      )}
    </form>
  );
}

function StepDots({ active }: { active: 1 | 2 }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      {[1, 2].map((n) => (
        <div key={n} className="flex items-center gap-2">
          <div
            className={cn(
              "grid h-6 w-6 place-items-center rounded-full text-[11px] font-semibold transition",
              active >= n
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground",
            )}
          >
            {active > n ? <CheckCircle2 className="h-3.5 w-3.5" /> : n}
          </div>
          {n === 1 ? (
            <div
              className={cn(
                "h-0.5 w-8 rounded-full transition",
                active > 1 ? "bg-primary" : "bg-muted",
              )}
            />
          ) : null}
        </div>
      ))}
      <span className="ml-2 text-[11px] uppercase tracking-widest text-muted-foreground">
        Step {active} of 2
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Forgot                                                            */
/* ------------------------------------------------------------------ */

function ForgotForm({ onSwitch }: { onSwitch: () => void }) {
  const [sent, setSent] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotValues>({ resolver: zodResolver(forgotSchema) });

  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-success/10 text-success">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm font-semibold">Check your inbox</p>
          <p className="mt-1 text-xs text-muted-foreground">
            We sent a password reset link to <span className="text-foreground">{sent}</span>.
          </p>
        </div>
        <Button variant="outline" className="glass w-full" onClick={onSwitch}>
          Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={handleSubmit(async (values) => {
        const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) {
          toast.error(error.message);
          return;
        }
        setSent(values.email);
        toast.success("Password reset email sent");
      })}
    >
      <Field label="Email" htmlFor="fp-email" error={errors.email?.message}>
        <Input id="fp-email" type="email" autoComplete="email" placeholder="you@arena.io" {...register("email")} />
      </Field>
      <Button
        type="submit"
        disabled={isSubmitting}
        className="h-11 w-full gradient-primary text-primary-foreground shadow-elegant"
      >
        {isSubmitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <Mail className="mr-2 h-4 w-4" />
            Send reset link
          </>
        )}
      </Button>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/*  Field wrapper                                                     */
/* ------------------------------------------------------------------ */

function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
      {error ? (
        <p className="flex items-center gap-1 text-xs text-danger">
          <AlertCircle className="h-3 w-3" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
