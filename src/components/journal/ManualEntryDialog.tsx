import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Info,
  Loader2,
  Plus,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  createEntry,
  deleteTaxonomy,
  fetchTaxonomy,
  journalKeys,
  upsertTaxonomy,
  type EntryInsert,
  type JournalTaxonomy,
} from "@/lib/journal/api";
import {
  DEFAULT_EMOTIONS,
  DEFAULT_SETUPS,
  SESSION_OPTIONS,
} from "@/lib/journal/constants";
import { findInstrument, type InstrumentRecord } from "@/lib/journal/instruments";
import { detectSession, detectTimezone } from "@/lib/journal/session-detect";
import {
  clearDraft,
  loadDefaults,
  loadDraft,
  saveDefaults,
  saveDraft,
  type JournalDraft,
} from "@/lib/journal/draft";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { InstrumentSearchInput } from "./InstrumentSearchInput";
import {
  ScreenshotUploader,
  persistStagedScreenshots,
  type StagedScreenshot,
} from "./ScreenshotUploader";

/* -------------------------------------------------------------------------- */
/*  Public API                                                                 */
/* -------------------------------------------------------------------------- */

export type PrefillTrade = Partial<{
  symbol: string;
  market: string;
  direction: "long" | "short";
  entry_price: number;
  exit_price: number;
  pnl: number;
  rr: number;
  opened_at: string;
  closed_at: string;
}>;

type TradeResult = "win" | "loss" | "breakeven";

const RESULT_BUTTONS: { value: TradeResult; label: string; tone: "success" | "danger" | "muted" }[] = [
  { value: "win", label: "Win", tone: "success" },
  { value: "loss", label: "Loss", tone: "danger" },
  { value: "breakeven", label: "Breakeven", tone: "muted" },
];

export function ManualEntryDialog({
  trigger,
  prefill,
  autoOpen = false,
}: {
  trigger?: React.ReactNode;
  prefill?: PrefillTrade;
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(autoOpen);
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const isMobile = useIsMobile();

  const openButton = trigger ? (
    <span onClick={() => setOpen(true)} role="button">{trigger}</span>
  ) : (
    <Button
      onClick={() => setOpen(true)}
      className="min-h-touch gradient-primary text-primary-foreground shadow-elegant"
    >
      <Plus className="mr-1.5 h-4 w-4" /> Manual Journal
    </Button>
  );

  const requestClose = useCallback(
    (next: boolean) => {
      if (!next && dirty) { setConfirmClose(true); return; }
      setOpen(next);
    },
    [dirty],
  );

  const forceClose = () => { setConfirmClose(false); setOpen(false); };

  const shell = isMobile ? (
    <Sheet open={open} onOpenChange={requestClose}>
      <SheetContent
        side="bottom"
        className="flex h-[92dvh] flex-col gap-0 rounded-t-2xl p-0 safe-bottom"
        onEscapeKeyDown={(e) => { if (dirty) { e.preventDefault(); setConfirmClose(true); } }}
      >
        <SheetHeader className="border-b border-border/60 px-4 py-3 text-left">
          <SheetTitle>New journal entry</SheetTitle>
        </SheetHeader>
        <ManualForm
          key={open ? "open" : "closed"}
          onCreated={() => { setDirty(false); setOpen(false); }}
          onDirtyChange={setDirty}
          prefill={prefill}
        />
      </SheetContent>
    </Sheet>
  ) : (
    <Dialog open={open} onOpenChange={requestClose}>
      <DialogContent
        className="flex max-h-[88vh] max-w-2xl flex-col gap-0 p-0"
        onEscapeKeyDown={(e) => { if (dirty) { e.preventDefault(); setConfirmClose(true); } }}
      >
        <DialogHeader className="border-b border-border/60 px-6 py-4">
          <DialogTitle>New journal entry</DialogTitle>
        </DialogHeader>
        <ManualForm
          key={open ? "open" : "closed"}
          onCreated={() => { setDirty(false); setOpen(false); }}
          onDirtyChange={setDirty}
          prefill={prefill}
        />
      </DialogContent>
    </Dialog>
  );

  return (
    <>
      {openButton}
      {shell}
      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your draft is auto-saved locally, so you can resume from where you left off.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continue editing</AlertDialogCancel>
            <AlertDialogAction onClick={forceClose}>Close</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Form                                                                       */
/* -------------------------------------------------------------------------- */

function todayDateInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function inferResult(pnl?: number | null): TradeResult {
  if (pnl == null) return "win";
  if (pnl > 0) return "win";
  if (pnl < 0) return "loss";
  return "breakeven";
}

function ManualForm({
  onCreated,
  onDirtyChange,
  prefill,
}: {
  onCreated: () => void;
  onDirtyChange: (dirty: boolean) => void;
  prefill?: PrefillTrade;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const defaults = useMemo(() => loadDefaults(), []);
  const persistedDraft = useMemo<JournalDraft | null>(
    () => (prefill ? null : loadDraft()),
    [prefill],
  );
  const [restorePrompt, setRestorePrompt] = useState<JournalDraft | null>(persistedDraft);
  const autoJournal = Boolean(prefill);
  const tz = useMemo(() => detectTimezone(), []);

  // Core fields
  const [symbol, setSymbol] = useState(prefill?.symbol ?? "");
  const [instrument, setInstrument] = useState<InstrumentRecord | null>(
    prefill?.symbol ? findInstrument(prefill.symbol) : null,
  );
  const market = useMemo(
    () => instrument?.market ?? prefill?.market ?? findInstrument(symbol)?.market ?? "forex",
    [instrument, symbol, prefill?.market],
  );

  const [result, setResult] = useState<TradeResult>(inferResult(prefill?.pnl));
  const [rMultiple, setRMultiple] = useState<string>(
    prefill?.rr != null ? formatSignedR(prefill.rr) : "",
  );
  // Money result. Optional — when blank we keep the R value as the P&L proxy.
  const [pnlInput, setPnlInput] = useState<string>(
    prefill?.pnl != null ? String(prefill.pnl) : "",
  );


  const [tradeDate, setTradeDate] = useState<string>(
    (prefill?.opened_at ? new Date(prefill.opened_at) : new Date()).toISOString().slice(0, 10),
  );
  const [strategyTags, setStrategyTags] = useState<string[]>(
    defaults.strategy ? [defaults.strategy] : [],
  );
  const [notes, setNotes] = useState("");
  const [direction, setDirection] = useState<"" | "long" | "short">(
    (prefill?.direction as "long" | "short" | undefined) ?? "",
  );

  // Optional
  const [session, setSession] = useState<string>(defaults.session ?? "");
  const [tradeType, setTradeType] = useState<"" | "scalp" | "intraday" | "swing" | "long_term">("");
  const [emotions, setEmotions] = useState<string[]>([]);
  const [screenshots, setScreenshots] = useState<StagedScreenshot[]>([]);

  // Auto-detect session from trade date (opens at 09:30 local as heuristic)
  useEffect(() => {
    if (session) return;
    const d = new Date(`${tradeDate}T12:00:00`);
    const detected = detectSession(d);
    if (detected) setSession(detected);
  }, [tradeDate, session]);

  /* --------------------------- Custom strategy tags ---------------------- */
  const taxonomyQuery = useQuery({ queryKey: journalKeys.taxonomy(), queryFn: fetchTaxonomy });
  const customSetups = useMemo<JournalTaxonomy[]>(
    () => (taxonomyQuery.data ?? []).filter((t) => t.kind === "setup"),
    [taxonomyQuery.data],
  );
  const strategyOptions = useMemo(() => {
    const built = DEFAULT_SETUPS.map((o) => ({ value: o.value, label: o.label, custom: false as const }));
    const custom = customSetups.map((c) => ({ value: c.value, label: c.label, custom: true as const, id: c.id }));
    return [...built, ...custom];
  }, [customSetups]);
  const addCustomSetup = async (label: string) => {
    const trimmed = label.trim();
    if (!user || !trimmed) return;
    try {
      const created = await upsertTaxonomy({ userId: user.id, kind: "setup", label: trimmed });
      await qc.invalidateQueries({ queryKey: journalKeys.taxonomy() });
      setStrategyTags((prev) => (prev.includes(created.value) ? prev : [...prev, created.value]));
    } catch (err) { toast.error((err as Error).message); }
  };
  const removeCustomSetup = async (t: JournalTaxonomy) => {
    try {
      await deleteTaxonomy(t.id);
      await qc.invalidateQueries({ queryKey: journalKeys.taxonomy() });
      setStrategyTags((prev) => prev.filter((v) => v !== t.value));
    } catch (err) { toast.error((err as Error).message); }
  };

  /* --------------------------- Validation refs --------------------------- */
  const instrumentRef = useRef<HTMLDivElement>(null);
  const directionRef = useRef<HTMLDivElement>(null);
  const riskRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const strategyRef = useRef<HTMLDivElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const [attempted, setAttempted] = useState(false);

  const rValue = parseSignedR(rMultiple);
  const missing = {
    instrument: !instrument,
    direction: !direction,
    risk: rValue == null,
    date: !tradeDate,
    strategy: strategyTags.length === 0,
    notes: !notes.trim(),
  };
  const canSubmit = Boolean(user) && !missing.instrument && !missing.direction && !missing.risk && !missing.date && !missing.strategy && !missing.notes;

  /* ----------------------------- Autosave -------------------------------- */
  const isDirty = Boolean(
    symbol || rMultiple || strategyTags.length ||
    emotions.length || notes.trim() || screenshots.length,
  );
  useEffect(() => { onDirtyChange(isDirty); }, [isDirty, onDirtyChange]);

  const draftSnapshot = useCallback((): JournalDraft => ({
    savedAt: Date.now(),
    symbol,
    market,
    direction: direction || "long",
    entryPrice: "", exitPrice: "", stopLoss: "", takeProfit: "",
    pnl: "", rr: rMultiple, lotSize: "",
    openedAt: tradeDate, closedAt: tradeDate,
    session, sessionAuto: true,
    confidence: 0,
    strategyTags, emotions, mistakes: [],
    entryReason: "", postTradeNotes: notes,
    riskPercent: "", accountBalance: "",
  }), [symbol, market, direction, tradeDate, session, strategyTags, emotions, notes, rMultiple]);

  const draftRef = useRef(draftSnapshot());
  useEffect(() => { draftRef.current = draftSnapshot(); }, [draftSnapshot]);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  useEffect(() => {
    if (!isDirty) return;
    const t = window.setTimeout(() => { saveDraft(draftRef.current); setSavedAt(Date.now()); }, 800);
    return () => window.clearTimeout(t);
  }, [isDirty, draftSnapshot]);

  /* --------------------------- Submit ------------------------------------ */
  const submitRef = useRef<() => void>(() => {});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        submitRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const mut = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      if (!instrument) throw new Error("Pick an instrument");

      const rrSigned = rValue ?? 0;
      const pnlTyped = pnlInput.trim() === "" ? null : Number(pnlInput);
      const pnlValue =
        pnlTyped != null && Number.isFinite(pnlTyped) ? pnlTyped : (prefill?.pnl ?? rrSigned);

      const openedISO = new Date(`${tradeDate}T12:00:00`).toISOString();

      const insert: EntryInsert = {
        user_id: user.id,
        symbol: instrument.symbol,
        market: instrument.market,
        direction: (direction || prefill?.direction || null) as EntryInsert["direction"],
        entry_price: prefill?.entry_price ?? null,
        exit_price: prefill?.exit_price ?? null,
        pnl: pnlValue,
        rr: rrSigned,
        risk_pct: null,
        opened_at: openedISO,
        closed_at: openedISO,
        opened_tz: tz,
        closed_tz: tz,
        session: (session || null) as EntryInsert["session"],
        session_auto_detected: true,
        trade_type: (tradeType || null) as EntryInsert["trade_type"],
        strategy: strategyTags[0] ?? null,
        strategy_tags: strategyTags,
        emotions,
        notes_text: notes || null,
        status: "draft",
      };

      const entry = await createEntry(insert);
      if (screenshots.length) {
        const paths = await persistStagedScreenshots(user.id, entry.id, screenshots);
        if (paths.length) {
          // Persist storage paths on the entry so card thumbnails / preview
          // / details page show the image immediately without a second upload.
          const { updateEntry } = await import("@/lib/journal/api");
          try { await updateEntry(entry.id, { screenshots: paths }); } catch { /* non-fatal */ }
        }
      }
      return entry;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: journalKeys.list() });
      saveDefaults({
        strategy: strategyTags[0],
        session,
        riskPercent: loadDefaults().riskPercent,
      });
      clearDraft();
      toast.success("Journal entry created");
      onCreated();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const focusFirstInvalid = () => {
    let el: HTMLElement | null = null;
    if (missing.instrument) el = instrumentRef.current;
    else if (missing.direction) el = directionRef.current;
    else if (missing.risk) el = riskRef.current;
    else if (missing.date) el = dateRef.current;
    else if (missing.strategy) el = strategyRef.current;
    else if (missing.notes) el = notesRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    requestAnimationFrame(() => { try { el?.focus({ preventScroll: true }); } catch { /* ignore */ } });
  };

  submitRef.current = () => {
    if (mut.isPending) return;
    setAttempted(true);
    if (!canSubmit) {
      toast.error("Complete the required fields highlighted in red");
      focusFirstInvalid();
      return;
    }
    mut.mutate();
  };

  /* --------------------------- Restore ----------------------------------- */
  const applyDraft = (d: JournalDraft) => {
    setSymbol(d.symbol);
    setInstrument(findInstrument(d.symbol));
    setTradeDate(d.openedAt?.slice(0, 10) || todayDateInput());
    setSession(d.session ?? "");
    setStrategyTags(d.strategyTags ?? []);
    setEmotions(d.emotions ?? []);
    setNotes(d.postTradeNotes ?? "");
    setRMultiple(d.rr ?? "");
    setRestorePrompt(null);
    toast.success("Draft restored");
  };

  /* --------------------------- Render ------------------------------------ */
  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => { e.preventDefault(); submitRef.current(); }}
    >
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
        {restorePrompt ? (
          <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
            <RotateCcw className="h-3.5 w-3.5 text-primary" />
            <span className="flex-1">
              Resume unfinished draft from{" "}
              <span className="font-semibold text-foreground">{new Date(restorePrompt.savedAt).toLocaleString()}</span>?
            </span>
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs"
              onClick={() => { clearDraft(); setRestorePrompt(null); }}>Discard</Button>
            <Button type="button" size="sm" className="h-7 px-3 text-xs"
              onClick={() => applyDraft(restorePrompt)}>Resume</Button>
          </div>
        ) : null}

        {autoJournal ? (
          <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-xs text-success">
            <Sparkles className="h-3.5 w-3.5" />
            Pre-filled from your trade — just add result, strategy and notes.
          </div>
        ) : null}

        {/* Instrument */}
        <Field label="Instrument" required error={attempted && missing.instrument ? "Pick an instrument" : undefined}>
          <div ref={instrumentRef} tabIndex={-1} className={cn(
            "rounded-md",
            attempted && missing.instrument && "ring-2 ring-danger ring-offset-1 ring-offset-background",
          )}>
            <InstrumentSearchInput
              value={symbol}
              marketFilter={null}
              onSelect={(i) => { setInstrument(i); setSymbol(i.symbol); }}
              autoFocus
            />
          </div>
          {instrument ? (
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              <CheckCircle2 className="h-3 w-3 text-success" />
              <span className="font-medium text-foreground">{instrument.name}</span>
              <span>· {instrument.market}</span>
            </p>
          ) : null}
        </Field>

        {/* Position Type */}
        <Field label="Position Type" required error={attempted && missing.direction ? "Choose Long or Short" : undefined}>
          <div
            ref={directionRef}
            tabIndex={-1}
            className={cn(
              "grid grid-cols-2 gap-2 rounded-md",
              attempted && missing.direction && "ring-2 ring-danger ring-offset-1 ring-offset-background",
            )}
          >
            {([
              { value: "long" as const, label: "Long (Buy)", tone: "success" as const },
              { value: "short" as const, label: "Short (Sell)", tone: "danger" as const },
            ]).map((b) => {
              const active = direction === b.value;
              return (
                <button
                  key={b.value}
                  type="button"
                  onClick={() => setDirection(b.value)}
                  aria-pressed={active}
                  className={cn(
                    "flex h-11 items-center justify-center gap-2 rounded-md border text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? b.tone === "success"
                        ? "border-success bg-success/10 text-success"
                        : "border-danger bg-danger/10 text-danger"
                      : "border-border/70 bg-background/40 text-muted-foreground hover:text-foreground hover:bg-accent/30",
                  )}
                >
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      b.tone === "success" ? "bg-success" : "bg-danger",
                    )}
                  />
                  {b.label}
                </button>
              );
            })}
          </div>
        </Field>

        {/* Trade Outcome is auto-derived from Trade Result (R) below. */}

        {/* Trade Result (R) */}
        <Field
          label="Trade Result (R)"
          required
          error={attempted && missing.risk ? "Enter a valid R multiple (e.g. +2, -1, 0)" : undefined}
          hint={
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="What is Trade Result (R)?"
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" align="start" className="max-w-xs space-y-1.5 text-xs leading-relaxed">
                  <p className="font-semibold text-sm">Trade Result (R)</p>
                  <p>Enter the realized result of your trade measured in R multiples.</p>
                  <p className="font-medium">Examples:</p>
                  <ul className="space-y-0.5">
                    <li><span className="text-success font-medium">+2R</span> = Won 2 times your initial risk</li>
                    <li><span className="text-success font-medium">+1R</span> = Won 1R</li>
                    <li><span>0R</span> = Breakeven</li>
                    <li><span className="text-danger font-medium">-1R</span> = Full stop loss</li>
                    <li><span className="text-danger font-medium">-0.5R</span> = Half-R loss</li>
                  </ul>
                  <p className="pt-1 text-muted-foreground">This value automatically determines whether the trade is recorded as a Win, Loss, or Breakeven.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          }
        >
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full max-w-xs">
                <Input
                  ref={riskRef}
                  value={rMultiple}
                  onChange={(e) => {
                    const cleaned = sanitizeSignedR(e.target.value);
                    setRMultiple(cleaned);
                    const v = parseSignedR(cleaned);
                    if (v != null) {
                      setResult(v > 0 ? "win" : v < 0 ? "loss" : "breakeven");
                    }
                  }}
                  inputMode="decimal"
                  placeholder="+2.0"
                  className={cn(
                    "h-11 pr-8 font-medium tabular-nums",
                    attempted && missing.risk && "border-danger",
                    rValue != null && rValue > 0 && "text-success",
                    rValue != null && rValue < 0 && "text-danger",
                  )}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
                  R
                </span>
              </div>
              {rValue != null ? (
                <span
                  aria-live="polite"
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    rValue > 0 && "border-success/40 bg-success/10 text-success",
                    rValue < 0 && "border-danger/40 bg-danger/10 text-danger",
                    rValue === 0 && "border-border bg-muted text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      rValue > 0 && "bg-success",
                      rValue < 0 && "bg-danger",
                      rValue === 0 && "bg-muted-foreground/60",
                    )}
                  />
                  {rValue > 0 ? "Win" : rValue < 0 ? "Loss" : "Breakeven"}
                </span>
              ) : null}
            </div>
          </div>
        </Field>

        {/* Trade Date */}
        <Field label="Trade Date" required error={attempted && missing.date ? "Required" : undefined}>
          <div className="relative max-w-xs">
            <Input
              ref={dateRef}
              type="date"
              value={tradeDate}
              onChange={(e) => setTradeDate(e.target.value)}
              className={cn("h-11", attempted && missing.date && "border-danger")}
            />
          </div>
        </Field>

        {/* Strategy */}
        <Field label="Strategy" required error={attempted && missing.strategy ? "Pick at least one" : undefined}>
          <div ref={strategyRef} tabIndex={-1}>
            <StrategyTagPicker
              options={strategyOptions}
              values={strategyTags}
              onChange={setStrategyTags}
              onAddCustom={addCustomSetup}
              onRemoveCustom={removeCustomSetup}
              customSetups={customSetups}
              invalid={attempted && missing.strategy}
            />
          </div>
        </Field>

        {/* Trade Review */}
        <Field label="Trade Review" required error={attempted && missing.notes ? "Add a short reflection" : undefined}>
          <Textarea
            ref={notesRef}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={5}
            className={cn("resize-none", attempted && missing.notes && "border-danger")}
            placeholder={"What happened during this trade? What went well? What would you do differently next time?"}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">Markdown supported.</p>
        </Field>

        <div className="pt-2">


          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Trading session">
                <Select value={session || "__auto"} onValueChange={(v) => setSession(v === "__auto" ? "" : v)}>
                  <SelectTrigger className="h-11 hover:border-primary/50 hover:bg-accent/30">
                    <SelectValue placeholder="Auto Detect" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__auto">Auto Detect</SelectItem>
                    {SESSION_OPTIONS.filter((s) => s.value !== "asia").map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Trade duration">
                <Select value={tradeType || "__none"} onValueChange={(v) => setTradeType(v === "__none" ? "" : v as typeof tradeType)}>
                  <SelectTrigger className="h-11 hover:border-primary/50 hover:bg-accent/30">
                    <SelectValue placeholder="Select duration" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Not set</SelectItem>
                    <SelectItem value="scalp">Scalp · minutes</SelectItem>
                    <SelectItem value="intraday">Intraday · same-day</SelectItem>
                    <SelectItem value="swing">Swing · days to weeks</SelectItem>
                    <SelectItem value="long_term">Long term · weeks+</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

            </div>


            <Field label="How did it feel?">
              <ChipMulti
                options={DEFAULT_EMOTIONS}
                values={emotions}
                onChange={setEmotions}
              />
            </Field>

            <Field label="Screenshots">
              <ScreenshotUploader staged={screenshots} onStagedChange={setScreenshots} />
            </Field>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-border/60 bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="text-[11px] text-muted-foreground">
          {savedAt ? (
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-success" />
              Draft saved · {new Date(savedAt).toLocaleTimeString()}
            </span>
          ) : (
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Auto-saves after 1s · ⌘/Ctrl + S</span>
          )}
        </div>
        <Button
          type="submit"
          disabled={mut.isPending}
          className="min-h-touch gradient-primary text-primary-foreground"
        >
          {mut.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          {mut.isPending ? "Saving…" : "Save entry"}
        </Button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/*  Helpers & sub-components                                                   */
/* -------------------------------------------------------------------------- */

function Field({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1 text-sm font-medium">
        {label}
        {required ? <span className="text-danger">*</span> : null}
        {hint ? <span className="ml-1 inline-flex">{hint}</span> : null}
      </Label>
      {children}
      {error ? (
        <p className="flex items-center gap-1 text-[11px] text-danger">
          <AlertCircle className="h-3 w-3" /> {error}
        </p>
      ) : null}
    </div>
  );
}

function ChipMulti({
  options,
  values,
  onChange,
}: {
  options: { value: string; label: string; color?: string }[];
  values: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = values.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(active ? values.filter((v) => v !== o.value) : [...values, o.value])}
            aria-pressed={active}
            className={cn(
              "cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "border-primary bg-primary/10 text-primary hover:bg-primary/15"
                : "border-border/70 bg-background/40 text-muted-foreground hover:border-primary/40 hover:bg-accent/40 hover:text-foreground",
            )}
            style={active && o.color ? { borderColor: o.color, color: o.color } : undefined}

          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

type StrategyOption =
  | { value: string; label: string; custom: false }
  | { value: string; label: string; custom: true; id: string };

function StrategyTagPicker({
  options,
  values,
  onChange,
  onAddCustom,
  onRemoveCustom,
  customSetups,
  invalid,
}: {
  options: StrategyOption[];
  values: string[];
  onChange: (v: string[]) => void;
  onAddCustom: (label: string) => void | Promise<void>;
  onRemoveCustom: (t: JournalTaxonomy) => void | Promise<void>;
  customSetups: JournalTaxonomy[];
  invalid?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const toggle = (v: string) => {
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  };
  const submit = async () => {
    const t = draft.trim();
    if (!t) return;
    setDraft("");
    await onAddCustom(t);
  };
  const filtered = search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;
  return (
    <div className={cn("space-y-2 rounded-md border border-input bg-background/50 p-2", invalid && "border-danger")}>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search strategies…"
        className="h-8 text-xs"
      />
      <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
        {filtered.map((o) => {
          const active = values.includes(o.value);
          const customRef = o.custom ? customSetups.find((c) => c.id === o.id) : null;
          return (
            <span key={o.value} className="inline-flex items-center">
              <button
                type="button"
                onClick={() => toggle(o.value)}
                className={cn(
                  "h-7 rounded-full border px-2.5 text-[11px] transition-colors",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/70 text-muted-foreground hover:text-foreground",
                  o.custom && "pr-1",
                )}
              >
                {o.label}
                {o.custom && customRef ? (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onRemoveCustom(customRef); }}
                    className="ml-1 rounded-full p-0.5 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                    aria-label={`Delete ${o.label}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </button>
            </span>
          );
        })}
        {filtered.length === 0 ? (
          <p className="px-2 py-1 text-[11px] text-muted-foreground">No matches. Add a custom tag below.</p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void submit(); } }}
          placeholder="Add your own tag…"
          className="h-8 text-xs"
        />
        <Button type="button" size="sm" variant="outline" className="h-8" onClick={submit} disabled={!draft.trim()}>
          <Plus className="mr-1 h-3 w-3" /> Add
        </Button>
      </div>
    </div>
  );
}

function sanitizeDecimal(v: string): string {
  const cleaned = v.replace(/[^0-9.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot === -1) return cleaned;
  return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
}

/** Accepts "+2", "-1", "0.5R", "+1.5r", " 2 ", "-.5", etc. Filters other chars. */
function sanitizeSignedR(v: string): string {
  const upper = v.replace(/r/gi, "").trim();
  // keep leading sign, digits, single dot
  let cleaned = upper.replace(/[^0-9.\-+]/g, "");
  // sign only at position 0
  const sign = cleaned.startsWith("-") ? "-" : cleaned.startsWith("+") ? "+" : "";
  cleaned = cleaned.replace(/[+\-]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot !== -1) {
    cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
  }
  return sign + cleaned;
}

/** Parses a signed R string to a number. Returns null when not a finite number. */
function parseSignedR(v: string): number | null {
  const s = (v ?? "").trim().replace(/r/gi, "").replace(/^\+/, "");
  if (s === "" || s === "-" || s === ".") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function formatSignedR(n: number): string {
  if (!Number.isFinite(n)) return "";
  const s = n > 0 ? `+${n}` : `${n}`;
  return s;
}
