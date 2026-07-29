/**
 * Replay this Trade
 * ----------------------------------------------------------------------------
 * A single reusable CTA that spawns a replay session pre-configured to the
 * day of a closed trade. Drop-in for Dashboard rows, Journal rows, Analytics
 * tables, and Trade details.
 */
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createReplayFromTrade } from "@/lib/replay.functions";
import { cn } from "@/lib/utils";

type Props = {
  tradeId: string;
  size?: "sm" | "default";
  variant?: "ghost" | "outline" | "secondary";
  label?: string;
  className?: string;
  onDone?: (sessionId: string) => void;
};

export function ReplayFromTradeButton({
  tradeId,
  size = "sm",
  variant = "ghost",
  label = "Replay",
  className,
  onDone,
}: Props) {
  const fn = useServerFn(createReplayFromTrade);
  const navigate = useNavigate();
  const m = useMutation({
    mutationFn: () => fn({ data: { trade_id: tradeId } }),
    onSuccess: (row: { id: string }) => {
      onDone?.(row.id);
      navigate({ to: "/replay/session", search: { id: row.id } as never });
    },
    onError: (e) => toast.error((e as Error).message ?? "Could not start replay"),
  });

  return (
    <Button
      size={size}
      variant={variant}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        m.mutate();
      }}
      disabled={m.isPending}
      className={cn("gap-1", className)}
      aria-label="Replay this trade"
    >
      {m.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
      {label}
    </Button>
  );
}
