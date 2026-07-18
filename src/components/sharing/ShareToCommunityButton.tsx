import { useState } from "react";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ShareToCommunityDialog } from "./ShareToCommunityDialog";
import type { ShareSourceType } from "@/lib/sharing/snapshot.server";

export function ShareToCommunityButton({
  sourceType, sourceId, sourceRef, label = "Share", size = "sm",
  variant = "outline", className, iconOnly, defaultNote,
}: {
  sourceType: ShareSourceType;
  sourceId?: string | null;
  sourceRef?: string | null;
  label?: string;
  size?: "sm" | "default" | "icon";
  variant?: "default" | "outline" | "ghost" | "secondary";
  className?: string;
  iconOnly?: boolean;
  defaultNote?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size={iconOnly ? "icon" : size}
        variant={variant}
        className={cn(className)}
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(true); }}
        aria-label="Share to Community"
      >
        <Share2 className={cn("h-4 w-4", !iconOnly && "mr-1.5")} />
        {!iconOnly ? label : null}
      </Button>
      {open ? (
        <ShareToCommunityDialog
          open={open} onOpenChange={setOpen}
          sourceType={sourceType} sourceId={sourceId} sourceRef={sourceRef} defaultNote={defaultNote}
        />
      ) : null}
    </>
  );
}
