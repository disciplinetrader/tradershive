import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { lovable } from "@/integrations/lovable/index";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.4c-.2 1.5-1.7 4.3-5.4 4.3-3.2 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.6 14.6 2.7 12 2.7 6.8 2.7 2.6 6.9 2.6 12S6.8 21.3 12 21.3c6.9 0 9.5-4.9 9.5-7.4 0-.5-.1-.9-.1-1.2H12z"
      />
      <path
        fill="#34A853"
        d="M3.3 7.3l3.2 2.3c.9-2 2.7-3.5 5.5-3.5 1.6 0 3 .6 4 1.5l3-2.9C17 3.1 14.7 2.1 12 2.1 8 2.1 4.6 4.2 3.3 7.3z"
      />
      <path
        fill="#FBBC05"
        d="M12 21.9c2.7 0 5-.9 6.7-2.5l-3.1-2.5c-.9.6-2 1-3.6 1-2.9 0-5.3-2-6.2-4.7L2.6 15.7C4 19 7.7 21.9 12 21.9z"
      />
      <path
        fill="#4285F4"
        d="M21.9 12.2c0-.7-.1-1.2-.2-1.7H12v3.5h5.6c-.2 1.3-1.1 3.2-3.2 4.4l3.1 2.4c1.8-1.7 3.4-4.3 3.4-8.6z"
      />
    </svg>
  );
}

export function SocialButtons({ mode = "signin" }: { mode?: "signin" | "signup" }) {
  const [busy, setBusy] = useState<string | null>(null);
  const verb = mode === "signup" ? "Sign up" : "Continue";

  const handleGoogle = async () => {
    setBusy("google");
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error(result.error.message ?? "Google sign-in failed");
        return;
      }
      if (result.redirected) return;
      window.location.href = "/dashboard";
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-2">
      <Button
        type="button"
        variant="outline"
        className="glass h-11 justify-center"
        disabled={busy !== null}
        onClick={handleGoogle}
      >
        {busy === "google" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <GoogleIcon className="mr-2 h-4 w-4" />
            {verb} with Google
          </>
        )}
      </Button>
    </div>
  );
}
