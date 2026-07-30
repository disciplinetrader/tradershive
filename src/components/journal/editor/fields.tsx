/**
 * Shared editor field primitives.
 *
 * Every section builds from these, so validation styling, locked/read-only
 * treatment, source badges and commit behaviour are identical everywhere.
 * Text inputs stay local while typing and commit on blur/idle so autosave
 * never fights the keyboard.
 */
import { useEffect, useId, useState } from "react";
import { Info, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { SOURCE_LABEL, type FieldSource } from "@/lib/journal/editor/model";
import type { ValidationIssue } from "@/lib/journal/editor/validation";

/* ------------------------------------------------------------------ */

export function SourceDot({ source }: { source: FieldSource }) {
  if (source === "manual") return null;
  const tone =
    source === "calculated"
      ? "bg-sky-400/70"
      : source === "ai"
        ? "bg-violet-400/70"
        : source === "corrected"
          ? "bg-amber-400/70"
          : "bg-emerald-400/70";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", tone)} aria-label={SOURCE_LABEL[source]} />
      </TooltipTrigger>
      <TooltipContent side="top" className="text-[11px]">{SOURCE_LABEL[source]}</TooltipContent>
    </Tooltip>
  );
}

export function FieldShell({
  label,
  htmlFor,
  source = "manual",
  locked,
  issues = [],
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  source?: FieldSource;
  locked?: boolean;
  issues?: ValidationIssue[];
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const error = issues.find((i) => i.level === "error");
  const warn = issues.find((i) => i.level === "warning" || i.level === "calc");
  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center gap-1.5">
        <Label
          htmlFor={htmlFor}
          className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
        >
          {label}
        </Label>
        <SourceDot source={source} />
        {locked ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Lock className="h-2.5 w-2.5 text-muted-foreground/70" aria-label="Read-only" />
            </TooltipTrigger>
            <TooltipContent side="top" className="text-[11px]">
              Owned by the source record. Unlock corrections in Advanced to edit.
            </TooltipContent>
          </Tooltip>
        ) : null}
        {hint ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-2.5 w-2.5 text-muted-foreground/60" aria-label="Info" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[220px] text-[11px]">{hint}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      {children}
      {error ? (
        <p className="text-[10px] text-danger">{error.message}</p>
      ) : warn ? (
        <p className="text-[10px] text-warning">{warn.message}</p>
      ) : null}
    </div>
  );
}

const inputCls =
  "h-8 border-border/60 bg-muted/10 text-[12px] tabular-nums focus-visible:ring-1 focus-visible:ring-primary/60 disabled:opacity-60";

/* ------------------------------------------------------------------ */

export function TextField({
  label,
  value,
  onCommit,
  locked,
  source,
  issues,
  placeholder,
  hint,
  className,
}: {
  label: string;
  value: string | null | undefined;
  onCommit: (v: string | null) => void;
  locked?: boolean;
  source?: FieldSource;
  issues?: ValidationIssue[];
  placeholder?: string;
  hint?: string;
  className?: string;
}) {
  const id = useId();
  const [v, setV] = useState(value ?? "");
  useEffect(() => setV(value ?? ""), [value]);
  return (
    <FieldShell label={label} htmlFor={id} source={source} locked={locked} issues={issues} hint={hint} className={className}>
      <Input
        id={id}
        value={v}
        disabled={locked}
        placeholder={placeholder}
        className={inputCls}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => { if ((value ?? "") !== v) onCommit(v.trim() === "" ? null : v); }}
      />
    </FieldShell>
  );
}

export function NumberField({
  label,
  value,
  onCommit,
  locked,
  source,
  issues,
  step = "any",
  suffix,
  hint,
  className,
}: {
  label: string;
  value: number | null | undefined;
  onCommit: (v: number | null) => void;
  locked?: boolean;
  source?: FieldSource;
  issues?: ValidationIssue[];
  step?: string;
  suffix?: string;
  hint?: string;
  className?: string;
}) {
  const id = useId();
  const [v, setV] = useState(value != null ? String(value) : "");
  useEffect(() => setV(value != null ? String(value) : ""), [value]);
  return (
    <FieldShell label={label} htmlFor={id} source={source} locked={locked} issues={issues} hint={hint} className={className}>
      <div className="relative">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          value={v}
          disabled={locked}
          className={cn(inputCls, suffix && "pr-7")}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => {
            const next = v === "" ? null : Number(v);
            if (next !== (value ?? null) && (next === null || Number.isFinite(next))) onCommit(next);
          }}
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
            {suffix}
          </span>
        ) : null}
      </div>
    </FieldShell>
  );
}

export function DateTimeField({
  label,
  value,
  onCommit,
  locked,
  source,
  issues,
  className,
}: {
  label: string;
  value: string | null | undefined;
  onCommit: (v: string | null) => void;
  locked?: boolean;
  source?: FieldSource;
  issues?: ValidationIssue[];
  className?: string;
}) {
  const id = useId();
  const [v, setV] = useState(() => (value ? toInputValue(value) : ""));
  useEffect(() => setV(value ? toInputValue(value) : ""), [value]);
  return (
    <FieldShell label={label} htmlFor={id} source={source} locked={locked} issues={issues} className={className}>
      <Input
        id={id}
        type="datetime-local"
        value={v}
        disabled={locked}
        className={inputCls}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => onCommit(v ? new Date(v).toISOString() : null)}
      />
    </FieldShell>
  );
}

function toInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function SelectField({
  label,
  value,
  options,
  onCommit,
  locked,
  source,
  issues,
  placeholder = "Choose",
  allowClear = true,
  className,
}: {
  label: string;
  value: string | null | undefined;
  options: { value: string; label: string }[];
  onCommit: (v: string | null) => void;
  locked?: boolean;
  source?: FieldSource;
  issues?: ValidationIssue[];
  placeholder?: string;
  allowClear?: boolean;
  className?: string;
}) {
  return (
    <FieldShell label={label} source={source} locked={locked} issues={issues} className={className}>
      <Select
        value={value ?? "__none"}
        disabled={locked}
        onValueChange={(v) => onCommit(v === "__none" ? null : v)}
      >
        <SelectTrigger className={cn(inputCls, "font-normal")}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {allowClear ? <SelectItem value="__none" className="text-muted-foreground">— None —</SelectItem> : null}
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldShell>
  );
}

export function TextAreaField({
  label,
  value,
  onCommit,
  onType,
  rows = 3,
  placeholder,
  className,
  source,
  inputRef,
}: {
  label: string;
  value: string | null | undefined;
  onCommit: (v: string) => void;
  onType?: (v: string) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
  source?: FieldSource;
  inputRef?: (el: HTMLTextAreaElement | null) => void;
}) {
  const id = useId();
  const [v, setV] = useState(value ?? "");
  useEffect(() => setV(value ?? ""), [value]);
  return (
    <FieldShell label={label} htmlFor={id} source={source} className={className}>
      <Textarea
        id={id}
        ref={inputRef}
        rows={rows}
        value={v}
        placeholder={placeholder}
        className="resize-y border-border/50 bg-muted/10 text-[12px] leading-relaxed focus-visible:ring-1 focus-visible:ring-primary/60"
        onChange={(e) => {
          setV(e.target.value);
          onType?.(e.target.value);
        }}
        onBlur={() => onCommit(v)}
      />
    </FieldShell>
  );
}

export function RatingField({
  label,
  value,
  onCommit,
  max = 5,
  hint,
}: {
  label: string;
  value: number | null | undefined;
  onCommit: (v: number | null) => void;
  max?: number;
  hint?: string;
}) {
  const [v, setV] = useState<number>(value ?? 0);
  useEffect(() => setV(value ?? 0), [value]);
  return (
    <div className="rounded border border-border/50 bg-muted/5 px-2.5 py-2">
      <div className="flex items-center justify-between">
        <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</Label>
        <span className="font-mono text-[11px] tabular-nums text-foreground">{value == null ? "—" : `${v}/${max}`}</span>
      </div>
      <Slider
        value={[v]}
        min={0}
        max={max}
        step={1}
        className="mt-2"
        aria-label={label}
        onValueChange={(x) => setV(x[0])}
        onValueCommit={(x) => onCommit(x[0] === 0 ? null : x[0])}
      />
      {hint ? <p className="mt-1 text-[10px] text-muted-foreground/80">{hint}</p> : null}
    </div>
  );
}

export function Chip({
  active,
  onClick,
  children,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "danger" | "default";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded border px-2 py-0.5 text-[11px] transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
        active
          ? tone === "danger"
            ? "border-danger/50 bg-danger/10 text-danger"
            : "border-primary/60 bg-primary/10 text-primary"
          : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function ChipGroup({
  label,
  options,
  selected,
  onToggle,
  tone,
  className,
}: {
  label?: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (v: string) => void;
  tone?: "danger" | "default";
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</Label>
      ) : null}
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <Chip key={o.value} active={selected.includes(o.value)} onClick={() => onToggle(o.value)} tone={tone}>
            {o.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}

/** Read-only derived value — visually distinct from anything editable. */
export function ReadOnlyValue({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</Label>
        <SourceDot source="calculated" />
      </div>
      <div className="flex h-8 items-center rounded border border-dashed border-border/50 bg-muted/5 px-2 font-mono text-[12px] tabular-nums text-muted-foreground">
        {value}
      </div>
      {hint ? <p className="text-[10px] text-muted-foreground/70">{hint}</p> : null}
    </div>
  );
}

export function Grid({ children, cols = 2 }: { children: React.ReactNode; cols?: 2 | 3 }) {
  return (
    <div className={cn("grid gap-2.5", cols === 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2")}>
      {children}
    </div>
  );
}

export function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/80">{children}</h4>
  );
}
