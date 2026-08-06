import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { parseTradeNarrative } from "@/lib/journal/quick-log.functions";
import { ManualEntryDialog, type PrefillTrade } from "./ManualEntryDialog";
import { journalKeys } from "@/lib/journal/api";

const EXAMPLES = [
  "Bought 1 lot EURUSD at 1.0820, out at 1.0865, +$450, London open sweep",
  "Shorted gold 0.5 lots 2412.5, stop 2418, target 2398, closed -$85 too early",
  "NAS100 long this morning, 2R winner, followed the plan for once",
];

/**
 * Natural-language trade capture. The trader types (or pastes) a sentence, the
 * model extracts the fields, and the standard journal form opens pre-filled so
 * nothing is saved without a human confirming it.
 */
export function QuickLogInput({ compact = false }: { compact?: boolean }) {
  const [text, setText] = useState("");
  const [prefill, setPrefill] = useState<PrefillTrade | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [dialogKey, setDialogKey] = useState(0);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();
  const parse = useServerFn(parseTradeNarrative);

  const timezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  }, []);

  const mut = useMutation({
    mutationFn: async () =>
      parse({ data: { text: text.trim(), nowIso: new Date().toISOString(), timezone } }),
    onSuccess: (result) => {
      if (!result.symbol && result.pnl == null && result.entry_price == null) {
        toast.error("Couldn't read a trade from that", {
          description: "Try including the instrument and at least a price or a P&L.",
        });
        return;
      }
      setPrefill({
        ...(result.symbol ? { symbol: result.symbol } : {}),
        ...(result.direction ? { direction: result.direction } : {}),
        ...(result.entry_price != null ? { entry_price: result.entry_price } : {}),
        ...(result.exit_price != null ? { exit_price: result.exit_price } : {}),
        ...(result.pnl != null ? { pnl: result.pnl } : {}),
        ...(result.rr != null ? { rr: result.rr } : {}),
        ...(result.opened_at ? { opened_at: result.opened_at } : {}),
        ...(result.closed_at ? { closed_at: result.closed_at } : {}),
      });
      setNotes(result.notes);
      setDialogKey((k) => k + 1);
      setText("");
      queryClient.invalidateQueries({ queryKey: journalKeys.list() });
    },
    onError: (error: unknown) => {
      toast.error("Quick log failed", {
        description: error instanceof Error ? error.message : "Try again in a moment.",
      });
    },
  });

  const submit = () => {
    if (text.trim().length < 3) {
      areaRef.current?.focus();
      return;
    }
    mut.mutate();
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Textarea
          ref={areaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          rows={compact ? 2 : 3}
          placeholder="Describe the trade in plain English — “bought 1 lot EURUSD at 1.0820, out at 1.0865, +$450”"
          className="resize-none pr-32"
          disabled={mut.isPending}
        />
        <Button
          type="button"
          size="sm"
          onClick={submit}
          disabled={mut.isPending || text.trim().length < 3}
          className="absolute bottom-2 right-2 gradient-primary text-primary-foreground"
        >
          {mut.isPending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Wand2 className="mr-1.5 h-3.5 w-3.5" />
          )}
          {mut.isPending ? "Reading…" : "Log it"}
        </Button>
      </div>

      {null}

      {prefill && (
        <ManualEntryDialog
          key={dialogKey}
          autoOpen
          prefill={prefill}
          trigger={<span className="hidden" />}
        />
      )}
      {notes && prefill && (
        <p className="text-xs text-muted-foreground">
          Extracted note: <span className="text-foreground">{notes}</span>
        </p>
      )}
    </div>
  );
}
