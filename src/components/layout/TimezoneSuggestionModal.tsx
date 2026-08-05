import { useState, useEffect } from "react";
import { Globe, Clock, Check, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getLocalTime, getTimezoneOffset } from "@/lib/utils/date";

export function TimezoneSuggestionModal() {
  const { profile, refresh } = useAuth();
  const [open, setOpen] = useState(false);
  const [detectedTimezone, setDetectedTimezone] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!profile) return;

    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const userTz = profile.timezone || "UTC";

    // Only show if different and we haven't asked in this session
    const hasAsked = sessionStorage.getItem("thive_timezone_asked");
    
    if (browserTz !== userTz && !hasAsked) {
      setDetectedTimezone(browserTz);
      setOpen(true);
      sessionStorage.setItem("thive_timezone_asked", "true");
    }
  }, [profile]);

  const handleUpdate = async () => {
    if (!profile?.id) return;
    setLoading(true);

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ timezone: detectedTimezone })
        .eq("id", profile.id);

      if (error) throw error;

      toast.success(`Timezone updated to ${detectedTimezone}`);
      await refresh();
      setOpen(false);
    } catch (err) {
      console.error("Failed to update timezone:", err);
      toast.error("Failed to update timezone");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[400px] glass-strong">
        <DialogHeader>
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-primary/10">
            <Globe className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">Sync your timezone?</DialogTitle>
          <DialogDescription className="text-center">
            We detected you're in <b>{detectedTimezone}</b>. 
            Would you like to update your settings to match?
          </DialogDescription>
        </DialogHeader>

        <div className="my-6 space-y-4 rounded-xl border border-border/60 bg-surface/40 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Current</span>
            <div className="flex items-center gap-2 font-medium">
              <Clock className="h-3.5 w-3.5" />
              {profile?.timezone || "UTC"}
            </div>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Detected</span>
            <div className="flex items-center gap-2 font-bold text-primary">
              <Clock className="h-3.5 w-3.5" />
              {detectedTimezone}
            </div>
          </div>
          <div className="border-t border-border/40 pt-3 text-center text-xs text-muted-foreground">
            Local time: {getLocalTime(detectedTimezone)} ({getTimezoneOffset(detectedTimezone)})
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button 
            className="w-full rounded-full" 
            onClick={handleUpdate}
            disabled={loading}
          >
            {loading ? "Updating..." : "Update Timezone"}
          </Button>
          <Button 
            variant="ghost" 
            className="w-full rounded-full" 
            onClick={() => setOpen(false)}
            disabled={loading}
          >
            Keep current
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
