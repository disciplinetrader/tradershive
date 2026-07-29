import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, ArrowLeft, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GlassCard } from "@/components/ui/glass-card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { APP_NAME } from "@/lib/constants";
import { resetPasswordSchema } from "@/lib/auth-schemas";
import { PasswordStrength, PasswordMatchIndicator } from "@/components/auth/PasswordStrength";
import { friendlyAuthError } from "@/lib/auth/error-messages";
import type { z } from "zod";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: `Reset password — ${APP_NAME}` },
      {
        name: "description",
        content: "Set a new password for your TradersHIVE account.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

type Values = z.infer<typeof resetPasswordSchema>;

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(resetPasswordSchema),
    mode: "onChange",
    defaultValues: { password: "", confirm_password: "" },
  });

  const pw = watch("password") ?? "";
  const confirm = watch("confirm_password") ?? "";

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    // If after a short wait we still don't have a session, the link is likely invalid/expired
    const t = setTimeout(() => {
      if (!ready) {
        void supabase.auth.getSession().then(({ data }) => {
          if (!data.session) {
            setLinkError(
              "This reset link is invalid or has expired. Request a new one to continue.",
            );
          }
        });
      }
    }, 1500);
    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[600px] gradient-radial-glow opacity-70" />
      <div className="relative z-10 w-full max-w-md">
        <Link
          to="/auth"
          search={{ mode: "login" }}
          className="mb-6 inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-xs text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to sign in
        </Link>

        <GlassCard className="p-8">
          <div className="mb-6 flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Set a new password</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose a strong password you don't use anywhere else.
              </p>
            </div>
          </div>

          {linkError ? (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {linkError}{" "}
                <Link
                  to="/auth"
                  search={{ mode: "forgot" }}
                  className="font-semibold underline"
                >
                  Request a new link
                </Link>
                .
              </span>
            </div>
          ) : null}

          <form
            className="space-y-4"
            noValidate
            onSubmit={handleSubmit(async (values) => {
              setFormError(null);
              if (!ready) {
                setFormError(
                  "Reset link not detected. Open the link from your email again.",
                );
                return;
              }
              const { error } = await supabase.auth.updateUser({
                password: values.password,
              });
              if (error) {
                setFormError(friendlyAuthError(error, "reset"));
                return;
              }
              toast.success("Password updated");
              await navigate({ to: "/dashboard", replace: true });
            })}
          >
            {formError ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger"
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{formError}</span>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="new-password">New password</Label>
              <PasswordInput
                id="new-password"
                autoComplete="new-password"
                show={showPw}
                onToggle={() => setShowPw((v) => !v)}
                {...register("password")}
              />
              {errors.password ? (
                <p className="flex items-center gap-1 text-xs text-danger" role="alert">
                  <AlertCircle className="h-3 w-3" />
                  {errors.password.message}
                </p>
              ) : null}
              <PasswordStrength password={pw} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <PasswordInput
                id="confirm-password"
                autoComplete="new-password"
                show={showPw}
                onToggle={() => setShowPw((v) => !v)}
                {...register("confirm_password")}
              />
              {errors.confirm_password ? (
                <p className="flex items-center gap-1 text-xs text-danger" role="alert">
                  <AlertCircle className="h-3 w-3" />
                  {errors.confirm_password.message}
                </p>
              ) : null}
              <PasswordMatchIndicator password={pw} confirm={confirm} />
            </div>

            <Button
              type="submit"
              aria-busy={isSubmitting}
              disabled={isSubmitting || !ready || !!linkError}
              className={cn(
                "h-11 w-full gradient-primary text-primary-foreground shadow-elegant",
              )}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating password…
                </>
              ) : (
                "Update password"
              )}
            </Button>
          </form>
        </GlassCard>
      </div>
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
      tabIndex={-1}
      className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  </div>
);
