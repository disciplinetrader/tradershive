import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { deleteMyAccount } from "@/lib/account.functions";

/** Random throwaway password used only to validate the emailed nonce. */
function randomPassword() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return `Del-${Array.from(bytes, (b) => b.toString(36)).join("")}!9`;
}

/**
 * Self-service account deletion.
 *
 * 1. We email a 6-digit verification code (Supabase re-authentication nonce).
 * 2. The code is validated client-side; an invalid code fails here.
 * 3. A server function deletes the auth user (cascades all owned data).
 * 4. The session is cleared and the user lands on the public landing page.
 */
export function DeleteAccountDialog({
  open,
  onOpenChange,
  email,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
}) {
  const navigate = useNavigate();
  const runDelete = useServerFn(deleteMyAccount);
  const [stage, setStage] = useState<"intro" | "code">("intro");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setStage("intro");
    setCode("");
    setBusy(false);
  };

  const sendCode = async () => {
    setBusy(true);
    const { error } = await supabase.auth.reauthenticate();
    setBusy(false);
    if (error) {
      toast.error(error.message || "Could not send the verification code.");
      return;
    }
    toast.success(`Verification code sent to ${email}`);
    setStage("code");
  };

  const confirmDelete = async () => {
    if (code.trim().length < 6) {
      toast.error("Enter the 6-digit code from your email.");
      return;
    }
    setBusy(true);
    // Validating the nonce is only possible through a credential update, so we
    // rotate to a throwaway password before removing the account entirely.
    const { error: nonceError } = await supabase.auth.updateUser({
      password: randomPassword(),
      nonce: code.trim(),
    });
    if (nonceError) {
      setBusy(false);
      toast.error("That code is invalid or expired. Request a new one.");
      return;
    }
    try {
      await runDelete({ data: undefined });
    } catch (e: any) {
      setBusy(false);
      toast.error(e?.message ?? "We could not delete your account. Please try again.");
      return;
    }
    await supabase.auth.signOut();
    toast.success("Your account has been permanently deleted.");
    onOpenChange(false);
    reset();
    await navigate({ to: "/", replace: true });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-danger">
            <ShieldAlert className="h-4 w-4" />
            Delete account
          </DialogTitle>
          <DialogDescription>
            {stage === "intro"
              ? "This permanently removes your profile, journal, trades and stats. We'll email a verification code to confirm it's you."
              : `Enter the 6-digit code we sent to ${email}.`}
          </DialogDescription>
        </DialogHeader>

        {stage === "code" ? (
          <div className="space-y-1.5">
            <Label htmlFor="delete-code">Verification code</Label>
            <Input
              id="delete-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              className="tracking-[0.4em]"
            />
            <button
              type="button"
              onClick={sendCode}
              disabled={busy}
              className="text-[11px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Resend code
            </button>
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          {stage === "intro" ? (
            <Button variant="destructive" onClick={sendCode} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send verification code"}
            </Button>
          ) : (
            <Button variant="destructive" onClick={confirmDelete} disabled={busy || code.length < 6}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete permanently"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
