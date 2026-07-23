import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Copy,
  Download,
  Eye,
  ImageIcon,
  MoreHorizontal,
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
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
              {COLUMNS.filter((c) => visible[c.key]).map((c) => {
                const isSortable = c.key !== "actions";
                const isActive = isSortable && sort.key === c.key;
                return (
                  <TableHead
                    key={c.key}
                    className={cn(
                      "whitespace-nowrap select-none transition-colors duration-150",
                      isSortable && "cursor-pointer hover:bg-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                      isActive && "text-foreground",
                    )}
                    onClick={() => toggleSort(c.key)}
                    role={isSortable ? "button" : undefined}
                    tabIndex={isSortable ? 0 : undefined}
                    onKeyDown={(e) => {
                      if (!isSortable) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleSort(c.key);
                      }
                    }}
                    aria-sort={
                      !isSortable ? undefined : isActive ? (sort.dir === "asc" ? "ascending" : "descending") : "none"
                    }
                  >
                    <span className="inline-flex items-center gap-1">
                      {c.label}
                      {!isSortable ? null : isActive ? (
                        sort.dir === "asc" ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />
                      ) : (
                        <ChevronsUpDown className="h-3 w-3 opacity-40" aria-hidden />
                      )}
                    </span>
                  </TableHead>
                );
              })}
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
              paged.map((e) => {
                const screenshotUrl =
                  (e as unknown as { screenshots?: Array<{ url?: string | null } | string> }).screenshots?.reduce<string | null>(
                    (acc, s) => acc ?? (typeof s === "string" ? s : s?.url ?? null),
                    null,
                  ) ?? null;
                const openScreenshot = () => {
                  if (screenshotUrl) window.open(screenshotUrl, "_blank", "noopener,noreferrer");
                };
                const menuItems = (
                  <>
                    <DropdownMenuItem onSelect={() => onView(e.id)}>
                      <Eye className="mr-2 h-3.5 w-3.5" /> View Journal
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onEdit(e.id)}>
                      <Pencil className="mr-2 h-3.5 w-3.5" /> Edit Journal
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onDuplicate(e.id)}>
                      <Copy className="mr-2 h-3.5 w-3.5" /> Duplicate
                    </DropdownMenuItem>
                    {screenshotUrl ? (
                      <DropdownMenuItem onSelect={openScreenshot}>
                        <ImageIcon className="mr-2 h-3.5 w-3.5" /> View Screenshot
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem onSelect={() => onShare(e.id)}>
                      <Share2 className="mr-2 h-3.5 w-3.5" /> Share
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => onDelete(e.id)}
                      className="text-danger focus:text-danger focus:bg-danger/10"
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                    </DropdownMenuItem>
                  </>
                );
                return (
                <ContextMenu key={e.id}>
                  <ContextMenuTrigger asChild>
                    <TableRow
                      className="group cursor-pointer transition-colors duration-150 hover:bg-accent/40 focus-within:bg-accent/30 data-[state=selected]:bg-accent/40"
                      onClick={() => onView(e.id)}
                      onDoubleClick={() => onView(e.id)}
                      tabIndex={0}
                      onKeyDown={(evt) => {
                        if (evt.key === "Enter") {
                          evt.preventDefault();
                          onView(e.id);
                        }
                      }}
                      aria-label={`Open trade ${e.symbol ?? shortId(e.id)}`}
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
                            <span className="inline-flex items-center gap-1 text-success">
                              <ArrowUp className="h-3 w-3" /> Long
                            </span>
                          ) : e.direction === "short" ? (
                            <span className="inline-flex items-center gap-1 text-danger">
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
                            pnlTone(e.pnl) === "up" && "text-success",
                            pnlTone(e.pnl) === "down" && "text-danger",
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
                          <div onClick={(evt) => evt.stopPropagation()} onDoubleClick={(evt) => evt.stopPropagation()} className="flex justify-end">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Row actions">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                {menuItems}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-48">
                    <ContextMenuItem onSelect={() => onView(e.id)}>
                      <Eye className="mr-2 h-3.5 w-3.5" /> View Journal
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => onEdit(e.id)}>
                      <Pencil className="mr-2 h-3.5 w-3.5" /> Edit Journal
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => onDuplicate(e.id)}>
                      <Copy className="mr-2 h-3.5 w-3.5" /> Duplicate
                    </ContextMenuItem>
                    {screenshotUrl ? (
                      <ContextMenuItem onSelect={openScreenshot}>
                        <ImageIcon className="mr-2 h-3.5 w-3.5" /> View Screenshot
                      </ContextMenuItem>
                    ) : null}
                    <ContextMenuItem onSelect={() => onShare(e.id)}>
                      <Share2 className="mr-2 h-3.5 w-3.5" /> Share
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      onSelect={() => onDelete(e.id)}
                      className="text-danger focus:text-danger focus:bg-danger/10"
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
                );
              })

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
