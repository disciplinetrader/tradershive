import { createFileRoute, Link, redirect, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
  ExternalLink,
  Loader2,
  Mail,
  Pencil,
  RefreshCw,
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { BrandPanel } from "@/components/auth/BrandPanel";
import { PasswordStrength, PasswordMatchIndicator } from "@/components/auth/PasswordStrength";

import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";
import {
  APP_NAME,
  COUNTRIES,
  EXPERIENCE_LEVELS,
  MARKETS,
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
import { friendlyAuthError, inboxUrlForEmail } from "@/lib/auth/error-messages";
import {
  clearSignupDraft,
  loadSignupDraft,
  useSignupDraftPersistence,
} from "@/lib/auth/draft-storage";
import { detectTimezone, getTimezoneOptions } from "@/lib/timezones";

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
        content:
          "Sign in or create your TradersHIVE account to train, journal your trades, and level up faster.",
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            className="mb-6 inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-xs text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
              transition={{ duration: 0.22 }}
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
                      ? "Free forever plan. No credit card required."
                      : mode === "forgot"
                        ? "Enter your email and we'll send a secure reset link."
                        : "Sign in to pick up where you left off."}
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
                  <div className="mt-6">
                    <div className="relative mb-4">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-border/60" />
                      </div>
                      <div className="relative flex justify-center text-xs">
                        <span className="bg-card px-2 text-muted-foreground">or continue with</span>
                      </div>
                    </div>
                    <GoogleButton />
                  </div>
                ) : null}

                <p className="mt-6 text-center text-xs text-muted-foreground">
                  {mode === "register" ? (
                    <>
                      Already have an account?{" "}
                      <button
                        className="rounded font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        onClick={() => setMode("login")}
                      >
                        Sign in
                      </button>
                    </>
                  ) : mode === "login" ? (
                    <>
                      Don't have an account?{" "}
                      <button
                        className="rounded font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        onClick={() => setMode("register")}
                      >
                        Create account
                      </button>
                    </>
                  ) : (
                    <button
                      className="rounded font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      onClick={() => setMode("login")}
                    >
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
  const [formError, setFormError] = useState<string | null>(null);
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
        setFormError(null);
        const { data, error } = await supabase.auth.signInWithPassword({
          email: values.email,
          password: values.password,
        });
        if (error) {
          setFormError(friendlyAuthError(error, "signin"));
          return;
        }
        toast.success("Welcome back");
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
      {formError ? <FormError message={formError} /> : null}

      <Field label="Email" htmlFor="login-email" error={errors.email?.message}>
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          {...register("email")}
        />
      </Field>
      <Field label="Password" htmlFor="login-password" error={errors.password?.message}>
        <PasswordInput
          id="login-password"
          autoComplete="current-password"
          show={showPw}
          onToggle={() => setShowPw((v) => !v)}
          {...register("password")}
        />
      </Field>
      <div className="flex items-center justify-between text-xs">
        <label className="inline-flex cursor-pointer items-center gap-2">
          <Checkbox defaultChecked {...(register("remember") as any)} />
          <span className="text-muted-foreground">Remember me</span>
        </label>
        <button
          type="button"
          onClick={onForgot}
          className="rounded font-medium text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Forgot password?
        </button>
      </div>
      <SubmitButton loading={isSubmitting} loadingText="Signing you in…">
        Sign in
      </SubmitButton>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/*  Register (2-step, draft-persisted)                                */
/* ------------------------------------------------------------------ */

type SignupSuccess = { email: string };

function RegisterForm() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [showPw, setShowPw] = useState(false);
  const [success, setSuccess] = useState<SignupSuccess | null>(null);
  const [formError, setFormError] = useState<string | null>(null);


  const detectedTz = detectTimezone();
  const timezoneOptions = useMemo(() => getTimezoneOptions(), []);
  const countryOptions = useMemo(
    () => COUNTRIES.map((c) => ({ value: c, label: c, search: c.toLowerCase() })),
    [],
  );

  // Load persisted draft (excluding passwords).
  const draft = useMemo(() => loadSignupDraft() ?? {}, []);

  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    mode: "onChange",
    defaultValues: {
      first_name: (draft.first_name as string) ?? "",
      last_name: (draft.last_name as string) ?? "",
      username: (draft.username as string) ?? "",
      email: (draft.email as string) ?? "",
      password: "",
      confirm_password: "",
      country: (draft.country as any) ?? "United States",
      timezone: (draft.timezone as any) ?? (detectedTz as any),
      experience: (draft.experience as any) ?? "beginner",
      preferred_markets: (draft.preferred_markets as any) ?? [],
      trading_style: (draft.trading_style as any) ?? "day_trader",
      accept_terms: undefined as unknown as true,
    },
  });

  const {
    register,
    handleSubmit,
    control,
    trigger,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = form;

  const allValues = watch();
  useSignupDraftPersistence(allValues, !success);

  const pwValue = watch("password") ?? "";
  const confirmValue = watch("confirm_password") ?? "";
  const emailValue = watch("email") ?? "";

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
    setFormError(null);
    const { data, error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        emailRedirectTo: `${window.location.origin}/verify-email`,
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
      setFormError(friendlyAuthError(error, "signup"));
      return;
    }
    clearSignupDraft();
    // Beta: email confirmation is disabled, so signUp returns an active session.
    // Auto-login the user straight into onboarding and skip the "check your inbox" screen.
    if (data?.session || data?.user) {
      toast.success(`Welcome to ${APP_NAME}`);
      await navigate({ to: "/onboarding", replace: true });
      return;
    }
    // Fallback (should not happen while auto-confirm is on): show the legacy verify screen.
    setSuccess({ email: values.email });
  });


  if (success) {
    return (
      <SignupSuccessScreen
        email={success.email}
        onEdit={() => {
          setSuccess(null);
          setStep(1);
        }}
      />
    );
  }

  return (
    <form className="space-y-4" noValidate onSubmit={onSubmit}>
      <StepDots active={step} />

      {formError ? <FormError message={formError} /> : null}

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
            <Input
              id="reg-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
              {...register("email")}
            />
          </Field>
          <Field label="Password" htmlFor="reg-password" error={errors.password?.message}>
            <PasswordInput
              id="reg-password"
              autoComplete="new-password"
              show={showPw}
              onToggle={() => setShowPw((v) => !v)}
              {...register("password")}
            />
            <PasswordStrength password={pwValue} />
          </Field>
          <Field
            label="Confirm password"
            htmlFor="reg-confirm"
            error={errors.confirm_password?.message}
          >
            <PasswordInput
              id="reg-confirm"
              autoComplete="new-password"
              show={showPw}
              onToggle={() => setShowPw((v) => !v)}
              {...register("confirm_password")}
            />
            <PasswordMatchIndicator password={pwValue} confirm={confirmValue} />
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
            <Field label="Country" htmlFor="reg-country" error={errors.country?.message}>
              <Controller
                name="country"
                control={control}
                render={({ field }) => (
                  <SearchableSelect
                    id="reg-country"
                    value={field.value}
                    onChange={field.onChange}
                    options={countryOptions}
                    placeholder="Select country"
                    searchPlaceholder="Search countries…"
                    ariaLabel="Country"
                  />
                )}
              />
            </Field>
            <Field label="Timezone" htmlFor="reg-timezone" error={errors.timezone?.message}>
              <Controller
                name="timezone"
                control={control}
                render={({ field }) => (
                  <SearchableSelect
                    id="reg-timezone"
                    value={field.value}
                    onChange={field.onChange}
                    options={timezoneOptions}
                    placeholder="Select timezone"
                    searchPlaceholder="Search e.g. Tokyo, +9…"
                    ariaLabel="Timezone"
                    className="text-xs"
                  />
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
                        <span className="flex items-center gap-1.5 leading-none">
                          <span className="text-sm">{e.label}</span>
                          <span className="text-[11px] text-muted-foreground">— {e.hint}</span>
                        </span>
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
                          "flex flex-col items-center gap-1 rounded-xl border px-3 py-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
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
                        <span className="flex items-center gap-1.5 leading-none">
                          <span className="text-sm">{s.label}</span>
                          <span className="text-[11px] text-muted-foreground">— {s.hint}</span>
                        </span>
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
            <SubmitButton
              loading={isSubmitting}
              loadingText="Creating your account…"
              className="flex-1"
            >
              Create account
            </SubmitButton>
          </div>
          <p className="text-center text-[11px] text-muted-foreground">
            We'll never spam you. Your progress is saved as you type.
          </p>
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
              active >= n ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
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
/*  Signup success                                                    */
/* ------------------------------------------------------------------ */

function SignupSuccessScreen({ email, onEdit }: { email: string; onEdit: () => void }) {
  const [cooldown, setCooldown] = useState(30);
  const [resending, setResending] = useState(false);
  const inbox = inboxUrlForEmail(email);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const resend = async () => {
    setResending(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/onboarding` },
    });
    setResending(false);
    if (error) {
      toast.error(friendlyAuthError(error, "signup"));
      return;
    }
    toast.success("Verification email sent");
    setCooldown(30);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-5 text-center"
    >
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-success/10 text-success">
        <Mail className="h-6 w-6" />
      </div>
      <div>
        <h2 className="text-xl font-bold">Welcome to {APP_NAME}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          We sent a verification email to{" "}
          <span className="font-semibold text-foreground">{email}</span>. Open it to activate your account.
        </p>
      </div>

      <div className="space-y-2">
        {inbox ? (
          <Button
            asChild
            className="h-11 w-full gradient-primary text-primary-foreground shadow-elegant"
          >
            <a href={inbox.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              {inbox.label}
            </a>
          </Button>
        ) : null}

        <Button
          type="button"
          variant="outline"
          className="glass h-11 w-full"
          onClick={resend}
          disabled={resending || cooldown > 0}
        >
          {resending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sending…
            </>
          ) : cooldown > 0 ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Resend in {cooldown}s
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Resend email
            </>
          )}
        </Button>

        <Button
          type="button"
          variant="ghost"
          className="h-10 w-full text-muted-foreground hover:text-foreground"
          onClick={onEdit}
        >
          <Pencil className="mr-2 h-3.5 w-3.5" />
          Wrong email? Edit
        </Button>
      </div>

      <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-left text-[11px] text-muted-foreground">
        <p className="font-semibold text-foreground">Didn't get the email?</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>Check your spam or promotions folder.</li>
          <li>Make sure {email} is spelled correctly.</li>
          <li>Give it a minute — mail delivery can be slow.</li>
        </ul>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Forgot password                                                   */
/* ------------------------------------------------------------------ */

function ForgotForm({ onSwitch }: { onSwitch: () => void }) {
  const [sent, setSent] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotValues>({ resolver: zodResolver(forgotSchema) });

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (sent) {
    const inbox = inboxUrlForEmail(sent);
    const resend = async () => {
      setResending(true);
      const { error } = await supabase.auth.resetPasswordForEmail(sent, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setResending(false);
      if (error) {
        toast.error(friendlyAuthError(error, "forgot"));
        return;
      }
      toast.success("Reset link sent again");
      setCooldown(30);
    };

    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-success/10 text-success">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm font-semibold">Check your inbox</p>
          <p className="mt-1 text-xs text-muted-foreground">
            We sent a password reset link to <span className="text-foreground">{sent}</span>.
            The link expires in 1 hour.
          </p>
        </div>
        <div className="space-y-2">
          {inbox ? (
            <Button
              asChild
              className="h-11 w-full gradient-primary text-primary-foreground shadow-elegant"
            >
              <a href={inbox.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />
                {inbox.label}
              </a>
            </Button>
          ) : null}
          <Button
            variant="outline"
            className="glass h-11 w-full"
            onClick={resend}
            disabled={resending || cooldown > 0}
          >
            {resending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending…
              </>
            ) : cooldown > 0 ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Resend in {cooldown}s
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Resend email
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            className="h-10 w-full text-muted-foreground hover:text-foreground"
            onClick={() => setSent(null)}
          >
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Wrong email? Edit
          </Button>
        </div>
        <Button variant="link" className="w-full text-xs" onClick={onSwitch}>
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
        setFormError(null);
        const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) {
          setFormError(friendlyAuthError(error, "forgot"));
          return;
        }
        setSent(values.email);
        setCooldown(30);
      })}
    >
      {formError ? <FormError message={formError} /> : null}
      <Field label="Email" htmlFor="fp-email" error={errors.email?.message}>
        <Input
          id="fp-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          {...register("email")}
        />
      </Field>
      <SubmitButton loading={isSubmitting} loadingText="Sending reset link…">
        <Mail className="mr-2 h-4 w-4" />
        Send reset link
      </SubmitButton>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared building blocks                                            */
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
        <p className="flex items-center gap-1 text-xs text-danger" role="alert">
          <AlertCircle className="h-3 w-3" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

const PasswordInput = ({
  id,
  autoComplete,
  show,
  onToggle,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  show: boolean;
  onToggle: () => void;
}) => (
  <div className="relative">
    <Input
      id={id}
      type={show ? "text" : "password"}
      autoComplete={autoComplete}
      className="pr-10"
      {...rest}
    />
    <button
      type="button"
      aria-label={show ? "Hide password" : "Show password"}
      aria-pressed={show}
      onClick={onToggle}
      className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      tabIndex={-1}
    >
      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  </div>
);

function SubmitButton({
  loading,
  loadingText,
  children,
  className,
}: {
  loading: boolean;
  loadingText: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Button
      type="submit"
      aria-busy={loading}
      disabled={loading}
      className={cn(
        "h-11 w-full gradient-primary text-primary-foreground shadow-elegant",
        className,
      )}
    >
      {loading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {loadingText}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger"
    >
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function GoogleButton() {
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error("Google sign-in failed. Please try again or continue using email.");
        return;
      }
      if (result.redirected) {
        return;
      }
    } catch (error) {
      toast.error("Google sign-in failed. Please try again or continue using email.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      aria-busy={loading}
      disabled={loading}
      onClick={handleSignIn}
      className="h-11 w-full border-border/60 bg-card text-foreground hover:bg-muted"
    >
      {loading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <GoogleIcon className="mr-2 h-4 w-4" />
      )}
      Continue with Google
    </Button>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}
