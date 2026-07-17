import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Copy,
  Download,
  Eye,
  Pencil,
  Share2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import type { JournalEntry } from "@/lib/journal/api";
import {
  formatCurrency,
  formatDate,
  formatDuration,
  formatNumber,
  pnlTone,
  shortId,
} from "@/lib/journal/format";
import { GRADE_COLOR } from "@/lib/journal/constants";
import { cn } from "@/lib/utils";

type ColKey =
  | "id"
  | "date"
  | "symbol"
  | "direction"
  | "entry"
  | "exit"
  | "rr"
  | "pnl"
  | "duration"
  | "setup"
  | "emotion"
  | "grade"
  | "status"
  | "actions";

const COLUMNS: { key: ColKey; label: string; hideDefault?: boolean }[] = [
  { key: "id", label: "Trade" },
  { key: "date", label: "Date" },
  { key: "symbol", label: "Pair" },
  { key: "direction", label: "Direction" },
  { key: "entry", label: "Entry" },
  { key: "exit", label: "Exit" },
  { key: "rr", label: "RR" },
  { key: "pnl", label: "P/L" },
  { key: "duration", label: "Duration" },
  { key: "setup", label: "Setup" },
  { key: "emotion", label: "Emotion", hideDefault: true },
  { key: "grade", label: "Grade" },
  { key: "status", label: "Status" },
  { key: "actions", label: "" },
];

type Sort = { key: ColKey; dir: "asc" | "desc" };

export function TradeTable({
  entries,
  onView,
  onEdit,
  onDuplicate,
  onDelete,
  onShare,
}: {
  entries: JournalEntry[];
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onShare: (id: string) => void;
}) {
  const [sort, setSort] = useState<Sort>({ key: "date", dir: "desc" });
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [visible, setVisible] = useState<Record<ColKey, boolean>>(() => {
    const out = {} as Record<ColKey, boolean>;
    COLUMNS.forEach((c) => (out[c.key] = !c.hideDefault));
    return out;
  });

  const sorted = useMemo(() => {
    const rows = [...entries];
    rows.sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va < vb) return sort.dir === "asc" ? -1 : 1;
      if (va > vb) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });
    return rows;
  }, [entries, sort]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paged = sorted.slice((page - 1) * pageSize, page * pageSize);

  const toggleSort = (key: ColKey) => {
    if (key === "actions") return;
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  };

  const exportCsv = () => {
    const cols = COLUMNS.filter((c) => c.key !== "actions" && visible[c.key]);
    const header = cols.map((c) => c.label).join(",");
    const lines = sorted.map((e) =>
      cols
        .map((c) => csvCell(cellText(e, c.key)))
        .join(","),
    );
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `journal-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {sorted.length.toLocaleString()} entries
        </p>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Show columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {COLUMNS.filter((c) => c.key !== "actions").map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.key}
                  checked={visible[c.key]}
                  onCheckedChange={(v) => setVisible((prev) => ({ ...prev, [c.key]: !!v }))}
                >
                  {c.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" className="h-8" onClick={exportCsv}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMNS.filter((c) => visible[c.key]).map((c) => (
                <TableHead
                  key={c.key}
                  className="whitespace-nowrap"
                  onClick={() => toggleSort(c.key)}
                  role={c.key === "actions" ? undefined : "button"}
                >
                  <span className="inline-flex items-center gap-1">
                    {c.label}
                    {c.key === "actions" ? null : sort.key === c.key ? (
                      sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                    ) : (
                      <ChevronsUpDown className="h-3 w-3 opacity-40" />
                    )}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COLUMNS.filter((c) => visible[c.key]).length} className="h-24 text-center text-sm text-muted-foreground">
                  No entries match your filters.
                </TableCell>
              </TableRow>
            ) : (
              paged.map((e) => (
                <TableRow
                  key={e.id}
                  className="cursor-pointer"
                  onClick={() => onView(e.id)}
                >
                  {visible.id ? (
                    <TableCell className="font-mono text-xs text-muted-foreground">#{shortId(e.id)}</TableCell>
                  ) : null}
                  {visible.date ? <TableCell className="whitespace-nowrap text-sm">{formatDate(e.closed_at ?? e.created_at)}</TableCell> : null}
                  {visible.symbol ? (
                    <TableCell className="whitespace-nowrap">
                      <span className="text-sm font-semibold">{e.symbol ?? "—"}</span>
                      <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-[10px] uppercase text-muted-foreground">{e.market ?? ""}</span>
                    </TableCell>
                  ) : null}
                  {visible.direction ? (
                    <TableCell>
                      {e.direction === "long" ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400">
                          <ArrowUp className="h-3 w-3" /> Long
                        </span>
                      ) : e.direction === "short" ? (
                        <span className="inline-flex items-center gap-1 text-rose-400">
                          <ArrowDown className="h-3 w-3" /> Short
                        </span>
                      ) : "—"}
                    </TableCell>
                  ) : null}
                  {visible.entry ? <TableCell className="font-mono text-xs tabular-nums">{e.entry_price != null ? formatNumber(Number(e.entry_price), 5) : "—"}</TableCell> : null}
                  {visible.exit ? <TableCell className="font-mono text-xs tabular-nums">{e.exit_price != null ? formatNumber(Number(e.exit_price), 5) : "—"}</TableCell> : null}
                  {visible.rr ? <TableCell className="font-mono text-xs tabular-nums">{e.rr != null ? `${formatNumber(Number(e.rr), 2)}R` : "—"}</TableCell> : null}
                  {visible.pnl ? (
                    <TableCell
                      className={cn(
                        "font-mono text-xs font-semibold tabular-nums",
                        pnlTone(e.pnl) === "up" && "text-emerald-400",
                        pnlTone(e.pnl) === "down" && "text-rose-400",
                      )}
                    >
                      {e.pnl != null ? formatCurrency(Number(e.pnl)) : "—"}
                    </TableCell>
                  ) : null}
                  {visible.duration ? <TableCell className="text-xs">{formatDuration(e.duration_seconds)}</TableCell> : null}
                  {visible.setup ? <TableCell className="text-xs text-muted-foreground">{e.setup ? e.setup.replace(/_/g, " ") : "—"}</TableCell> : null}
                  {visible.emotion ? (
                    <TableCell className="text-xs text-muted-foreground">
                      {(e.emotions ?? []).slice(0, 2).join(", ") || "—"}
                    </TableCell>
                  ) : null}
                  {visible.grade ? (
                    <TableCell>
                      {e.grade ? (
                        <Badge className={cn("border font-semibold", GRADE_COLOR[e.grade])}>{e.grade}</Badge>
                      ) : "—"}
                    </TableCell>
                  ) : null}
                  {visible.status ? (
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{e.status}</Badge>
                    </TableCell>
                  ) : null}
                  {visible.actions ? (
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1" onClick={(evt) => evt.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="View" onClick={() => onView(e.id)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Edit" onClick={() => onEdit(e.id)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Duplicate" onClick={() => onDuplicate(e.id)}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Share" onClick={() => onShare(e.id)}>
                          <Share2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-rose-400" aria-label="Delete" onClick={() => onDelete(e.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {pages > 1 ? (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Page {page} of {pages}
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="h-7" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Prev
            </Button>
            <Button variant="outline" size="sm" className="h-7" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}>
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function sortValue(e: JournalEntry, key: ColKey): number | string | null {
  switch (key) {
    case "id": return e.id;
    case "date": return e.closed_at ?? e.created_at;
    case "symbol": return e.symbol ?? "";
    case "direction": return e.direction ?? "";
    case "entry": return e.entry_price != null ? Number(e.entry_price) : null;
    case "exit": return e.exit_price != null ? Number(e.exit_price) : null;
    case "rr": return e.rr != null ? Number(e.rr) : null;
    case "pnl": return e.pnl != null ? Number(e.pnl) : null;
    case "duration": return e.duration_seconds ?? null;
    case "setup": return e.setup ?? "";
    case "emotion": return (e.emotions ?? [])[0] ?? "";
    case "grade": return e.grade ?? "";
    case "status": return e.status;
    default: return null;
  }
}

function cellText(e: JournalEntry, key: ColKey): string {
  switch (key) {
    case "id": return shortId(e.id);
    case "date": return formatDate(e.closed_at ?? e.created_at);
    case "symbol": return e.symbol ?? "";
    case "direction": return e.direction ?? "";
    case "entry": return e.entry_price != null ? String(e.entry_price) : "";
    case "exit": return e.exit_price != null ? String(e.exit_price) : "";
    case "rr": return e.rr != null ? String(e.rr) : "";
    case "pnl": return e.pnl != null ? String(e.pnl) : "";
    case "duration": return formatDuration(e.duration_seconds);
    case "setup": return e.setup ?? "";
    case "emotion": return (e.emotions ?? []).join("|");
    case "grade": return e.grade ?? "";
    case "status": return e.status;
    default: return "";
  }
}

function csvCell(v: string): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
