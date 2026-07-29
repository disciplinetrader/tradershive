import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Loader2,
  MailCheck,
  Pencil,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { supabase } from "@/integrations/supabase/client";
import { APP_NAME } from "@/lib/constants";
import { friendlyAuthError, inboxUrlForEmail } from "@/lib/auth/error-messages";

const search = z.object({ email: z.string().email().optional() });

export const Route = createFileRoute("/verify-email")({
  ssr: false,
  validateSearch: search,
  head: () => ({
    meta: [
      { title: `Verify your email — ${APP_NAME}` },
      {
        name: "description",
        content: "Confirm your email address to activate your TradersHIVE account.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const { email } = useSearch({ from: "/verify-email" });
  const navigate = useNavigate();
  const [verified, setVerified] = useState(false);
  const [cooldown, setCooldown] = useState(30);
  const [sending, setSending] = useState(false);
  const inbox = inboxUrlForEmail(email);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user?.email_confirmed_at) setVerified(true);
      if (event === "SIGNED_IN" && session?.user) setVerified(true);
    });
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email_confirmed_at) setVerified(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Once verified (or the session confirms email is already good), bounce the user
  // straight into the app — no manual "Continue" click needed.
  useEffect(() => {
    if (!verified) return;
    const t = setTimeout(async () => {
      const { data: p } = await supabase.auth.getUser();
      const uid = p.user?.id;
      if (!uid) {
        await navigate({ to: "/auth", search: { mode: "login" }, replace: true });
        return;
      }
      const { data: prof } = await supabase
        .from("profiles")
        .select("onboarded")
        .eq("id", uid)
        .maybeSingle();
      await navigate({
        to: prof && !prof.onboarded ? "/onboarding" : "/dashboard",
        replace: true,
      });
    }, 600);
    return () => clearTimeout(t);
  }, [verified, navigate]);


  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const resend = async () => {
    if (!email) {
      toast.error("Open the verify link from your registration email, or sign up again.");
      return;
    }
    setSending(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/onboarding` },
    });
    setSending(false);
    if (error) {
      toast.error(friendlyAuthError(error, "signup"));
      return;
    }
    toast.success("Verification email sent");
    setCooldown(30);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-40" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[600px] gradient-radial-glow opacity-70" />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative z-10 w-full max-w-md"
      >
        <Link
          to="/auth"
          search={{ mode: "login" }}
          className="mb-6 inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-xs text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to sign in
        </Link>

        <GlassCard className="p-8 text-center">
          <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 text-primary shadow-elegant">
            {verified ? <CheckCircle2 className="h-7 w-7 text-success" /> : <MailCheck className="h-7 w-7" />}
          </div>
          {verified ? (
            <>
              <h1 className="text-2xl font-bold">You're verified</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Your account is ready. Let's finish setting up your profile.
              </p>
              <Link to="/onboarding">
                <Button className="mt-6 w-full gradient-primary text-primary-foreground shadow-elegant">
                  Continue to onboarding
                </Button>
              </Link>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold">Check your inbox</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {email ? (
                  <>
                    We sent a verification link to{" "}
                    <span className="font-semibold text-foreground">{email}</span>. Open it to activate your account.
                  </>
                ) : (
                  <>We sent you a verification link. Open it to activate your account.</>
                )}
              </p>

              <div className="mt-6 space-y-2">
                {inbox ? (
                  <Button
                    asChild
                    className="w-full gradient-primary text-primary-foreground shadow-elegant"
                  >
                    <a href={inbox.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      {inbox.label}
                    </a>
                  </Button>
                ) : null}
                <Button
                  onClick={resend}
                  disabled={sending || cooldown > 0}
                  variant="outline"
                  className="w-full glass"
                >
                  {sending ? (
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
                      Resend verification email
                    </>
                  )}
                </Button>
                <Link to="/auth" search={{ mode: "register" }}>
                  <Button variant="ghost" className="w-full text-muted-foreground hover:text-foreground">
                    <Pencil className="mr-2 h-3.5 w-3.5" />
                    Wrong email? Sign up again
                  </Button>
                </Link>
              </div>

              <div className="mt-6 rounded-xl border border-border/60 bg-muted/30 p-3 text-left text-[11px] text-muted-foreground">
                <p className="font-semibold text-foreground">Didn't get the email?</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  <li>Check your spam or promotions folder.</li>
                  <li>Confirm the address is spelled correctly.</li>
                  <li>Delivery can take a minute or two.</li>
                </ul>
              </div>
            </>
          )}
        </GlassCard>
      </motion.div>
    </div>
  );
}
