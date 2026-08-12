import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchEntryByTradeId, fetchTagsByKind, setEntryTagValues, updateEntry,
  journalKeys, type JournalTag,
} from "@/lib/journal/api";
import { formatCurrency } from "@/lib/paper-trading/calculations";
import { cn } from "@/lib/utils";

/**
 * The in-flow journal moment.
 *
 * Closing a trade already creates a `journal_entries` draft via
 * `create_journal_draft_from_trade()`, but silently — the trader had to leave
 * the workspace and go find it later, which is exactly when the reason for the
 * trade has stopped being available. This strip catches the setup tag and a
 * one-line note while they still remember, then gets out of the way.
 *
 * It is deliberately dismissible and deliberately not a modal: an interruption
 * the trader cannot decline is one they learn to click through, and a tag
 * chosen to dismiss a dialog is worse than no tag at all.
 */
export function PostCloseCapture({
  tradeId, pnl, currency, onDismiss,
}: {
  tradeId: string; pnl: number; currency?: string; onDismiss: () => void;
}) {
  const qc = useQueryClient();
  const [entryId, setEntryId] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [setups, setSetups] = useState<JournalTag[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    return () => { cancelled.current = true; };
  }, []);

  // The trigger runs inside the close transaction, but PostgREST may still
  // answer before the row is visible to this client. Poll a few times rather
  // than declaring the draft missing on the first miss.
  useEffect(() => {
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout>;
    const look = async () => {
      attempt += 1;
      try {
        const entry = await fetchEntryByTradeId(tradeId);
        if (cancelled.current) return;
        if (entry) { setEntryId(entry.id); return; }
      } catch {
        // Fall through to the retry — a transient read failure is not proof
        // the draft is absent.
      }
      if (attempt >= 5) { setMissing(true); return; }
      timer = setTimeout(look, 400 * attempt);
    };
    void look();
    return () => clearTimeout(timer);
  }, [tradeId]);

  useEffect(() => {
    void (async () => {
      try {
        const t = await fetchTagsByKind("setup");
        if (!cancelled.current) setSetups(t);
      } catch { /* the note still works without the vocabulary */ }
    })();
  }, []);

  const save = async () => {
    if (!entryId || saving) return;
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Not signed in");

      if (picked) {
        await setEntryTagValues({ entryId, userId, kind: "setup", values: [picked] });
      }
      if (note.trim()) {
        await updateEntry(entryId, { narrative: note.trim() });
      }
      setSaved(true);
      qc.invalidateQueries({ queryKey: journalKeys.all });
      toast.success("Saved to the journal");
      setTimeout(() => { if (!cancelled.current) onDismiss(); }, 900);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const up = pnl >= 0;

  return (
    <div className="rounded-lg border border-border/70 bg-background/60 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold">
          Trade closed{" "}
          <span className={cn("font-mono tabular-nums", up ? "text-success" : "text-danger")}>
            {up ? "+" : ""}{formatCurrency(pnl, currency)}
          </span>
          <span className="ml-1 font-normal text-muted-foreground">— tag it while it&apos;s fresh?</span>
        </p>
        <button type="button" onClick={onDismiss} aria-label="Dismiss journal prompt"
          className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {missing ? (
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          The journal draft hasn&apos;t appeared yet.{" "}
          <Link to="/journal" className="underline hover:text-foreground">Open the journal</Link> to tag it.
        </p>
      ) : saved ? (
        <p className="mt-1.5 flex items-center gap-1 text-[10px] text-success">
          <Check className="h-3 w-3" /> Saved.
        </p>
      ) : (
        <>
          {setups.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {setups.slice(0, 8).map((t) => (
                <button
                  key={t.id} type="button" aria-pressed={picked === t.value}
                  onClick={() => setPicked((p) => (p === t.value ? null : t.value))}
                  className={cn(
                    "rounded-md border px-1.5 py-0.5 text-[10px] transition-colors",
                    picked === t.value
                      ? "border-primary/60 bg-primary/10 text-primary"
                      : "border-border/60 text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >{t.name}</button>
              ))}
            </div>
          )}
          <div className="mt-1.5 flex gap-1.5">
            <Input
              value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="One line — what happened?"
              aria-label="Trade note"
              className="h-7 text-xs"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void save(); } }}
            />
            <Button
              size="sm" className="h-7 px-2 text-[10px]"
              disabled={!entryId || saving || (!picked && !note.trim())}
              onClick={() => void save()}
            >{saving ? "Saving…" : "Save"}</Button>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Goes to the draft this close created ·{" "}
            <Link to="/journal" className="underline hover:text-foreground">full journal entry</Link>
          </p>
        </>
      )}
    </div>
  );
}
