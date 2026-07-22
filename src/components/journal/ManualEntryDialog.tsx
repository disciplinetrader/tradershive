import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Clock, Loader2, Plus, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { createEntry, journalKeys, type EntryInsert } from "@/lib/journal/api";
import {
  DEFAULT_EMOTIONS,
  DEFAULT_MISTAKES,
  DEFAULT_SETUPS,
  DIRECTION_OPTIONS,
  MARKET_OPTIONS,
  SESSION_OPTIONS,
} from "@/lib/journal/constants";
import {
  findInstrument,
  formatPrice,
  validatePrice,
  type InstrumentRecord,
  type JournalMarket,
} from "@/lib/journal/instruments";
import { detectSession, detectTimezone } from "@/lib/journal/session-detect";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { InstrumentSearchInput } from "./InstrumentSearchInput";
import {
  ScreenshotUploader,
  persistStagedScreenshots,
  type StagedScreenshot,
} from "./ScreenshotUploader";

/* -------------------------------------------------------------------------- */
/*  Dialog shell (bottom sheet on mobile, modal on desktop)                    */
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

  if (isMobile) {
    return (
      <>
        {openButton}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent
            side="bottom"
            className="flex h-[95dvh] flex-col gap-0 rounded-t-2xl p-0 safe-bottom"
          >
            <SheetHeader className="border-b border-border/60 px-4 py-3 text-left">
              <SheetTitle>New journal entry</SheetTitle>
            </SheetHeader>
            <ManualForm onCreated={() => setOpen(false)} sticky prefill={prefill} />
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {openButton}
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-0 p-0">
        <DialogHeader className="border-b border-border/60 px-6 py-4">
          <DialogTitle>New journal entry</DialogTitle>
        </DialogHeader>
        <ManualForm onCreated={() => setOpen(false)} sticky prefill={prefill} />
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/*  Section wrapper                                                            */
/* -------------------------------------------------------------------------- */

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 border-t border-border/60 px-4 py-4 first:border-t-0 sm:px-6">
      <header className="space-y-0.5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        {description ? <p className="text-xs text-muted-foreground/80">{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Multi-select chip                                                          */
/* -------------------------------------------------------------------------- */

function ChipMulti({
  options,
  values,
  onChange,
}: {
  options: { value: string; label: string; color?: string }[];
  values: string[];
  onChange: (next: string[]) => void;
}) {
  function toggle(v: string) {
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = values.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => toggle(o.value)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              active
                ? "border-primary bg-primary/10 text-primary"
                : "border-border/70 bg-background/40 text-muted-foreground hover:border-border hover:text-foreground",
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

/* -------------------------------------------------------------------------- */
/*  Manual form                                                                */
/* -------------------------------------------------------------------------- */

function ManualForm({
  onCreated,
  sticky = false,
  prefill,
}: {
  onCreated: () => void;
  sticky?: boolean;
  prefill?: PrefillTrade;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();

  // Instrument
  const [symbol, setSymbol] = useState<string>(prefill?.symbol ?? "");
  const [instrument, setInstrument] = useState<InstrumentRecord | null>(
    prefill?.symbol ? findInstrument(prefill.symbol) : null,
  );
  const [market, setMarket] = useState<string>(
    prefill?.market ?? findInstrument(prefill?.symbol ?? "")?.market ?? "forex",
  );

  // Direction
  const [direction, setDirection] = useState<"long" | "short">(prefill?.direction ?? "long");

  // Prices
  const [entryPrice, setEntryPrice] = useState<string>(
    prefill?.entry_price != null ? String(prefill.entry_price) : "",
  );
  const [exitPrice, setExitPrice] = useState<string>(
    prefill?.exit_price != null ? String(prefill.exit_price) : "",
  );
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");

  // Performance
  const [pnl, setPnl] = useState<string>(prefill?.pnl != null ? String(prefill.pnl) : "");
  const [rr, setRr] = useState<string>(prefill?.rr != null ? String(prefill.rr) : "");
  const [lotSize, setLotSize] = useState("");

  // Timing
  const now = new Date();
  const [openedAt, setOpenedAt] = useState<string>(
    prefill?.opened_at ? toLocalInput(new Date(prefill.opened_at)) : toLocalInput(now),
  );
  const [closedAt, setClosedAt] = useState<string>(
    prefill?.closed_at ? toLocalInput(new Date(prefill.closed_at)) : toLocalInput(now),
  );
  const [session, setSession] = useState<string>("");
  const [sessionAuto, setSessionAuto] = useState(true);
  const tz = useMemo(() => detectTimezone(), []);

  // Review
  const [confidence, setConfidence] = useState<number>(60);
  const [strategyTags, setStrategyTags] = useState<string[]>([]);
  const [emotions, setEmotions] = useState<string[]>([]);
  const [mistakes, setMistakes] = useState<string[]>([]);
  const [entryReason, setEntryReason] = useState("");
  const [postTradeNotes, setPostTradeNotes] = useState("");

  // Attachments
  const [screenshots, setScreenshots] = useState<StagedScreenshot[]>([]);

  // Auto-detect session whenever open time changes and auto mode is on.
  useEffect(() => {
    if (!sessionAuto) return;
    const detected = detectSession(new Date(openedAt));
    if (detected) setSession(detected);
  }, [openedAt, sessionAuto]);

  // If the symbol changes and no market override, follow instrument's market.
  useEffect(() => {
    if (instrument) setMarket(instrument.market);
  }, [instrument]);

  const entryValidation = useMemo(() => validatePrice(entryPrice, instrument), [entryPrice, instrument]);
  const exitValidation = useMemo(() => validatePrice(exitPrice, instrument), [exitPrice, instrument]);
  const slValidation = useMemo(() => validatePrice(stopLoss, instrument), [stopLoss, instrument]);
  const tpValidation = useMemo(() => validatePrice(takeProfit, instrument), [takeProfit, instrument]);

  const computedRR = useMemo(() => {
    const e = entryValidation.value;
    const x = exitValidation.value;
    const sl = slValidation.value;
    if (!e || !sl) return null;
    const risk = Math.abs(e - sl);
    if (!risk) return null;
    const reward = x != null ? Math.abs(x - e) : null;
    if (reward == null) return null;
    return reward / risk;
  }, [entryValidation.value, exitValidation.value, slValidation.value]);

  const canSubmit = Boolean(
    user &&
      instrument &&
      entryValidation.valid &&
      exitValidation.valid &&
      slValidation.valid &&
      tpValidation.valid,
  );

  const mut = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      if (!instrument) throw new Error("Please pick an instrument");
      if (!entryValidation.valid) throw new Error(entryValidation.error ?? "Invalid entry price");

      const insert: EntryInsert = {
        user_id: user.id,
        symbol: instrument.symbol,
        market,
        direction,
        entry_price: entryValidation.value,
        exit_price: exitValidation.value,
        stop_loss: slValidation.value,
        take_profit: tpValidation.value,
        pnl: pnl ? Number(pnl) : null,
        rr: rr ? Number(rr) : computedRR,
        volume: lotSize ? Number(lotSize) : null,
        opened_at: openedAt ? new Date(openedAt).toISOString() : null,
        closed_at: closedAt ? new Date(closedAt).toISOString() : null,
        opened_tz: tz,
        closed_tz: tz,
        session: (session || null) as EntryInsert["session"],
        session_auto_detected: sessionAuto,
        confidence,
        strategy: strategyTags[0] ?? null,
        strategy_tags: strategyTags,
        emotions,
        mistakes,
        entry_reason_text: entryReason || null,
        notes: postTradeNotes || null,
        status: "draft",
      };

      const entry = await createEntry(insert);
      if (screenshots.length) {
        await persistStagedScreenshots(user.id, entry.id, screenshots);
      }
      return entry;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: journalKeys.list() });
      toast.success("Journal entry created");
      onCreated();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const body = (
    <>
      {/* Instrument + market */}
      <Section title="Instrument" description="Search by ticker, name, or common alias (e.g. Gold, Nasdaq).">
        <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
          <div className="space-y-1.5">
            <Label>Symbol</Label>
            <InstrumentSearchInput
              value={symbol}
              marketFilter={null}
              onSelect={(i) => { setInstrument(i); setSymbol(i.symbol); }}
              autoFocus
            />
            {instrument ? (
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <CheckCircle2 className="h-3 w-3 text-success" />
                {instrument.name} · {instrument.decimals} decimals · pip {instrument.pipSize}
              </p>
            ) : symbol ? (
              <p className="flex items-center gap-1.5 text-[11px] text-warning">
                <AlertCircle className="h-3 w-3" /> Not in catalog — will be saved as custom symbol
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Market</Label>
            <Select value={market} onValueChange={setMarket}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MARKET_OPTIONS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
                <SelectItem value="metals">Metals</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Section>

      {/* Execution */}
      <Section title="Execution" description="Direction, prices, and position size. Prices are validated against the instrument's precision.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Direction</Label>
            <div className="grid grid-cols-2 gap-2">
              {DIRECTION_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setDirection(o.value as "long" | "short")}
                  className={cn(
                    "h-11 rounded-md border text-sm font-medium transition-colors",
                    direction === o.value
                      ? o.value === "long"
                        ? "border-success bg-success/10 text-success"
                        : "border-danger bg-danger/10 text-danger"
                      : "border-border/70 bg-background/40 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Position size (lots / units)</Label>
            <Input
              value={lotSize}
              onChange={(e) => setLotSize(e.target.value)}
              inputMode="decimal"
              placeholder={instrument ? `min ${instrument.minLot}` : "e.g. 0.10"}
              className="h-11"
            />
          </div>
          <PriceField
            label="Entry price"
            value={entryPrice}
            onChange={setEntryPrice}
            validation={entryValidation}
            instrument={instrument}
            required
          />
          <PriceField
            label="Exit price"
            value={exitPrice}
            onChange={setExitPrice}
            validation={exitValidation}
            instrument={instrument}
          />
          <PriceField
            label="Stop loss"
            value={stopLoss}
            onChange={setStopLoss}
            validation={slValidation}
            instrument={instrument}
          />
          <PriceField
            label="Take profit"
            value={takeProfit}
            onChange={setTakeProfit}
            validation={tpValidation}
            instrument={instrument}
          />
        </div>
      </Section>

      {/* Timing */}
      <Section title="Timing" description={`Times are stored in UTC; your timezone (${tz}) is recorded for context.`}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />Opened at</Label>
            <Input
              type="datetime-local"
              value={openedAt}
              onChange={(e) => setOpenedAt(e.target.value)}
              className="h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />Closed at</Label>
            <Input
              type="datetime-local"
              value={closedAt}
              onChange={(e) => setClosedAt(e.target.value)}
              className="h-11"
            />
          </div>
          <div className="sm:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <Label>Trading session</Label>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch checked={sessionAuto} onCheckedChange={setSessionAuto} />
                Auto-detect from opened time
              </label>
            </div>
            <Select value={session} onValueChange={(v) => { setSession(v); setSessionAuto(false); }}>
              <SelectTrigger className="mt-1.5 h-11">
                <SelectValue placeholder="Select session" />
              </SelectTrigger>
              <SelectContent>
                {SESSION_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {sessionAuto && session ? (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                <Sparkles className="h-3 w-3 text-primary" /> Detected from opened time (UTC).
              </p>
            ) : null}
          </div>
        </div>
      </Section>

      {/* Performance */}
      <Section title="Performance" description="If left blank, RR is auto-calculated from entry / exit / stop.">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Realised P/L</Label>
            <Input
              type="number"
              inputMode="decimal"
              step="any"
              value={pnl}
              onChange={(e) => setPnl(e.target.value)}
              className={cn("h-11", numberTone(pnl))}
              placeholder="$"
            />
          </div>
          <div className="space-y-1.5">
            <Label>R:R</Label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={rr}
              onChange={(e) => setRr(e.target.value)}
              className="h-11"
              placeholder={computedRR != null ? computedRR.toFixed(2) : "0.00"}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Confidence at entry</Label>
            <div className="flex h-11 items-center gap-3 rounded-md border border-input bg-background px-3">
              <Slider
                value={[confidence]}
                onValueChange={(v) => setConfidence(v[0] ?? 0)}
                min={0}
                max={100}
                step={5}
                className="flex-1"
              />
              <span className="w-9 text-right text-sm font-semibold text-foreground">{confidence}%</span>
            </div>
          </div>
        </div>
      </Section>

      {/* Strategy + Psychology */}
      <Section title="Strategy & Review" description="Tag the setup(s), emotional state, and any mistakes you noticed.">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Strategy tags</Label>
            <ChipMulti options={DEFAULT_SETUPS} values={strategyTags} onChange={setStrategyTags} />
            {strategyTags.length > 0 ? (
              <div className="flex flex-wrap gap-1 pt-1">
                {strategyTags.map((t) => (
                  <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                ))}
              </div>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>How did it feel?</Label>
            <ChipMulti options={DEFAULT_EMOTIONS} values={emotions} onChange={setEmotions} />
          </div>
          <div className="space-y-1.5">
            <Label>Mistakes (be honest with yourself)</Label>
            <ChipMulti options={DEFAULT_MISTAKES} values={mistakes} onChange={setMistakes} />
          </div>
          <div className="space-y-1.5">
            <Label>Reason for entry</Label>
            <Textarea
              value={entryReason}
              onChange={(e) => setEntryReason(e.target.value)}
              placeholder="What did you see? What was your thesis?"
              rows={3}
              className="resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Post-trade notes</Label>
            <Textarea
              value={postTradeNotes}
              onChange={(e) => setPostTradeNotes(e.target.value)}
              placeholder="What did you learn? What would you do differently?"
              rows={3}
              className="resize-none"
            />
          </div>
        </div>
      </Section>

      {/* Screenshots */}
      <Section title="Screenshots" description="Attach chart images with captions to show context, entry, management, and exit.">
        <ScreenshotUploader staged={screenshots} onStagedChange={setScreenshots} />
      </Section>
    </>
  );

  const footer = (
    <div className={cn(
      "flex items-center justify-between gap-3 border-t border-border/60 bg-background/95 px-4 py-3 backdrop-blur sm:px-6",
      sticky ? "sticky bottom-0" : "",
    )}>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {computedRR != null ? (
          <span>Auto R:R <span className="font-semibold text-foreground">{computedRR.toFixed(2)}</span></span>
        ) : null}
        {instrument && entryValidation.value ? (
          <span>Entry <span className="font-mono text-foreground">{formatPrice(entryValidation.value, instrument)}</span></span>
        ) : null}
      </div>
      <Button
        type="submit"
        disabled={mut.isPending || !canSubmit}
        className="min-h-touch gradient-primary text-primary-foreground"
      >
        {mut.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
        Save entry
      </Button>
    </div>
  );

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}
    >
      <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
      {footer}
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function PriceField({
  label,
  value,
  onChange,
  validation,
  instrument,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  validation: ReturnType<typeof validatePrice>;
  instrument: InstrumentRecord | null;
  required?: boolean;
}) {
  const invalid = value.length > 0 && !validation.valid;
  return (
    <div className="space-y-1">
      <Label>
        {label}
        {required ? <span className="ml-0.5 text-danger">*</span> : null}
      </Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        placeholder={instrument ? "0.".padEnd(2 + instrument.decimals, "0") : "0.00"}
        className={cn("h-11 font-mono", invalid ? "border-danger focus-visible:ring-danger" : "")}
      />
      {invalid ? (
        <p className="text-[11px] text-danger">{validation.error}</p>
      ) : null}
    </div>
  );
}

function numberTone(v: string) {
  const n = Number(v);
  if (!Number.isFinite(n) || !v) return "";
  return n > 0 ? "text-success" : n < 0 ? "text-danger" : "";
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
