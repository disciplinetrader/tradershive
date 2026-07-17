import { createFileRoute, Link, redirect, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import { AlertCircle, ArrowLeft, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GlassCard } from "@/components/ui/glass-card";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "sonner";
import { APP_NAME } from "@/lib/constants";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
      { name: "description", content: "Sign in or create your TradersHIVE Arena account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

type Mode = "login" | "register" | "forgot";

const emailPasswordSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(8, "At least 8 characters").max(72),
});

const registerSchema = emailPasswordSchema.extend({
  username: z
    .string()
    .trim()
    .min(3, "At least 3 characters")
    .max(24, "At most 24 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Only letters, numbers, and underscores"),
});

const forgotSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
});

function AuthPage() {
  const search = useSearch({ from: "/auth" });
  const [mode, setMode] = useState<Mode>((search.mode as Mode) ?? "login");

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-40" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[600px] gradient-radial-glow opacity-70" />

      <div className="relative z-10 w-full max-w-md">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to home
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <GlassCard className="p-8">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl gradient-primary text-primary-foreground shadow-elegant">
                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                  <path d="M4 17l5-5 4 4 7-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold tracking-tight">{APP_NAME}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {mode === "register"
                  ? "Create your account and enter the arena"
                  : mode === "forgot"
                    ? "Reset your password"
                    : "Sign in to continue training"}
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

            {mode === "login" ? <LoginForm /> : null}
            {mode === "register" ? <RegisterForm onSwitch={() => setMode("login")} /> : null}
            {mode === "forgot" ? <ForgotForm onSwitch={() => setMode("login")} /> : null}

            {mode === "login" ? (
              <div className="mt-4 text-center text-xs text-muted-foreground">
                <button
                  type="button"
                  className="transition hover:text-foreground"
                  onClick={() => setMode("forgot")}
                >
                  Forgot your password?
                </button>
              </div>
            ) : null}

            {mode !== "forgot" ? (
              <>
                <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
                  <div className="h-px flex-1 bg-border" />
                  or continue with
                  <div className="h-px flex-1 bg-border" />
                </div>
                <SocialButtons />
              </>
            ) : null}
          </GlassCard>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            By continuing you agree to the Terms of Service and Privacy Policy.
          </p>
        </motion.div>
      </div>
    </div>
  );
}

function LoginForm() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" });
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof emailPasswordSchema>>({
    resolver: zodResolver(emailPasswordSchema),
  });

  return (
    <form
      className="space-y-4"
      onSubmit={handleSubmit(async (values) => {
        const { error } = await supabase.auth.signInWithPassword(values);
        if (error) {
          toast.error(error.message);
          return;
        }
        toast.success("Welcome back");
        await navigate({ to: (search.redirect as any) || "/dashboard", replace: true });
      })}
    >
      <FieldWrap error={errors.email?.message}>
        <Label htmlFor="login-email">Email</Label>
        <Input id="login-email" type="email" autoComplete="email" placeholder="you@arena.io" {...register("email")} />
      </FieldWrap>
      <FieldWrap error={errors.password?.message}>
        <Label htmlFor="login-password">Password</Label>
        <Input id="login-password" type="password" autoComplete="current-password" placeholder="••••••••" {...register("password")} />
      </FieldWrap>
      <Button type="submit" disabled={isSubmitting} className="w-full gradient-primary text-primary-foreground shadow-elegant">
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
      </Button>
    </form>
  );
}

function RegisterForm({ onSwitch }: { onSwitch: () => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
  });

  return (
    <form
      className="space-y-4"
      onSubmit={handleSubmit(async (values) => {
        const { error } = await supabase.auth.signUp({
          email: values.email,
          password: values.password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { username: values.username, display_name: values.username },
          },
        });
        if (error) {
          toast.error(error.message);
          return;
        }
        toast.success("Account created — check your email if verification is required.");
        onSwitch();
      })}
    >
      <FieldWrap error={errors.username?.message}>
        <Label htmlFor="reg-username">Username</Label>
        <Input id="reg-username" placeholder="satoshi" autoComplete="username" {...register("username")} />
      </FieldWrap>
      <FieldWrap error={errors.email?.message}>
        <Label htmlFor="reg-email">Email</Label>
        <Input id="reg-email" type="email" autoComplete="email" placeholder="you@arena.io" {...register("email")} />
      </FieldWrap>
      <FieldWrap error={errors.password?.message}>
        <Label htmlFor="reg-password">Password</Label>
        <Input id="reg-password" type="password" autoComplete="new-password" placeholder="At least 8 characters" {...register("password")} />
      </FieldWrap>
      <Button type="submit" disabled={isSubmitting} className="w-full gradient-primary text-primary-foreground shadow-elegant">
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
      </Button>
    </form>
  );
}

function ForgotForm({ onSwitch }: { onSwitch: () => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof forgotSchema>>({
    resolver: zodResolver(forgotSchema),
  });

  return (
    <form
      className="space-y-4"
      onSubmit={handleSubmit(async (values) => {
        const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) {
          toast.error(error.message);
          return;
        }
        toast.success("Password reset email sent");
        onSwitch();
      })}
    >
      <FieldWrap error={errors.email?.message}>
        <Label htmlFor="forgot-email">Email</Label>
        <Input id="forgot-email" type="email" autoComplete="email" placeholder="you@arena.io" {...register("email")} />
      </FieldWrap>
      <Button type="submit" disabled={isSubmitting} className="w-full gradient-primary text-primary-foreground shadow-elegant">
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Mail className="mr-2 h-4 w-4" />Send reset link</>}
      </Button>
      <button
        type="button"
        onClick={onSwitch}
        className="block w-full text-center text-xs text-muted-foreground transition hover:text-foreground"
      >
        Back to sign in
      </button>
    </form>
  );
}

function FieldWrap({ children, error }: { children: React.ReactNode; error?: string }) {
  return (
    <div className="space-y-1.5">
      {children}
      {error ? (
        <p className="flex items-center gap-1 text-xs text-danger">
          <AlertCircle className="h-3 w-3" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

function SocialButtons() {
  const [busy, setBusy] = useState<string | null>(null);
  const handle = async (provider: "google") => {
    setBusy(provider);
    const result = await lovable.auth.signInWithOAuth(provider, {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error(result.error.message ?? "Sign-in failed");
      setBusy(null);
      return;
    }
    if (result.redirected) return;
    window.location.href = "/dashboard";
  };
  return (
    <div className="grid gap-2">
      <Button
        type="button"
        variant="outline"
        className="glass"
        disabled={busy !== null}
        onClick={() => handle("google")}
      >
        {busy === "google" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <GoogleIcon className="mr-2 h-4 w-4" />
            Continue with Google
          </>
        )}
      </Button>
    </div>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path
        fill="#EA4335"
        d="M12 10.2v3.8h5.3c-.2 1.4-1.7 4.1-5.3 4.1-3.2 0-5.8-2.7-5.8-6s2.6-6 5.8-6c1.8 0 3.1.8 3.8 1.4l2.6-2.5C16.7 3.4 14.6 2.5 12 2.5 6.8 2.5 2.6 6.7 2.6 12S6.8 21.5 12 21.5c6.9 0 9.4-4.9 9.4-7.4 0-.5 0-.9-.1-1.3H12z"
      />
    </svg>
  );
}
