import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FileUp, Loader2, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { createEntry, fetchEntries, journalKeys } from "@/lib/journal/api";
import {
  IMPORT_FIELDS,
  autoMap,
  buildDedupeKey,
  mapRows,
  parseCsv,
  toEntryInsert,
  type ColumnMap,
  type ImportField,
  type ImportRow,
  type ParsedCsv,
} from "@/lib/journal/import/csv";

const NONE = "__none__";

type Step = "upload" | "map";

export function ImportTradesDialog({ trigger }: { trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [map, setMap] = useState<ColumnMap>({});
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: existing } = useQuery({
    queryKey: journalKeys.list(),
    queryFn: fetchEntries,
    enabled: open,
  });

  const existingKeys = useMemo(() => {
    const set = new Set<string>();
    for (const entry of existing ?? []) {
      set.add(
        buildDedupeKey({
          symbol: entry.symbol ?? "",
          direction: entry.direction ?? null,
          opened_at: entry.opened_at ?? null,
          entry_price: entry.entry_price ?? null,
          pnl: entry.pnl ?? null,
        }),
      );
    }
    return set;
  }, [existing]);

  const rows: ImportRow[] = useMemo(
    () => (parsed ? mapRows(parsed.rows, map) : []),
    [parsed, map],
  );

  const duplicates = useMemo(
    () => rows.filter((r) => r.errors.length === 0 && existingKeys.has(r.dedupeKey)),
    [rows, existingKeys],
  );
  const invalid = useMemo(() => rows.filter((r) => r.errors.length > 0), [rows]);
  const importable = useMemo(
    () =>
      rows.filter(
        (r) => r.errors.length === 0 && !(skipDuplicates && existingKeys.has(r.dedupeKey)),
      ),
    [rows, existingKeys, skipDuplicates],
  );

  const reset = () => {
    setStep("upload");
    setParsed(null);
    setMap({});
    setFileName("");
  };

  const handleFile = async (file: File) => {
    try {
      const text = await file.text();
      const result = parseCsv(text);
      if (!result.headers.length || !result.rows.length) {
        toast.error("Nothing to import", { description: "That file has no readable rows." });
        return;
      }
      setFileName(file.name);
      setParsed(result);
      setMap(autoMap(result.headers));
      setStep("map");
    } catch {
      toast.error("Couldn't read that file", { description: "Export as CSV and try again." });
    }
  };

  const importMut = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      let ok = 0;
      const failures: string[] = [];
      for (const row of importable) {
        try {
          await createEntry({ ...toEntryInsert(row, user.id, null), source: "import" });
          ok += 1;
        } catch (error) {
          failures.push(
            `Row ${row.index + 2}: ${error instanceof Error ? error.message : "failed"}`,
          );
        }
      }
      return { ok, failures };
    },
    onSuccess: ({ ok, failures }) => {
      queryClient.invalidateQueries({ queryKey: journalKeys.all });
      if (failures.length) {
        toast.warning(`Imported ${ok} trades, ${failures.length} failed`, {
          description: failures.slice(0, 3).join(" · "),
        });
      } else {
        toast.success(`Imported ${ok} trade${ok === 1 ? "" : "s"}`, {
          description: "They're in your journal as published entries.",
        });
      }
      setOpen(false);
      reset();
    },
    onError: (error: unknown) => {
      toast.error("Import failed", {
        description: error instanceof Error ? error.message : "Try again.",
      });
    },
  });

  const previewRows = rows.slice(0, 8);

  return (
    <>
      <span onClick={() => setOpen(true)} role="button">
        {trigger ?? (
          <Button variant="outline" className="min-h-touch">
            <Upload className="mr-2 h-4 w-4" />
            Import
          </Button>
        )}
      </span>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Import trades</DialogTitle>
            <DialogDescription>
              Drop a CSV exported from your broker or platform (MT4/MT5, cTrader, Tradovate,
              Zerodha, Fyers, IBKR…). Columns are matched automatically — check them below.
            </DialogDescription>
          </DialogHeader>

          {step === "upload" && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) void handleFile(file);
              }}
              onClick={() => inputRef.current?.click()}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 text-center transition-colors",
                dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
              )}
            >
              <FileUp className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-medium">Drop your CSV here</p>
                <p className="text-sm text-muted-foreground">or click to browse — nothing is saved until you confirm</p>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                  e.target.value = "";
                }}
              />
            </div>
          )}

          {step === "map" && parsed && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="secondary">{fileName}</Badge>
                <span className="text-muted-foreground">{rows.length} rows detected</span>
                <Button variant="ghost" size="sm" onClick={reset}>
                  Choose another file
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {IMPORT_FIELDS.map((field) => (
                  <div key={field.key} className="space-y-1">
                    <Label className="text-xs">
                      {field.label}
                      {field.required && <span className="text-destructive"> *</span>}
                    </Label>
                    <Select
                      value={map[field.key] !== undefined ? String(map[field.key]) : NONE}
                      onValueChange={(value) =>
                        setMap((prev) => {
                          const next = { ...prev };
                          if (value === NONE) delete next[field.key as ImportField];
                          else next[field.key as ImportField] = Number(value);
                          return next;
                        })
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Not mapped" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Not mapped</SelectItem>
                        {parsed.headers.map((header, index) => (
                          <SelectItem key={`${header}-${index}`} value={String(index)}>
                            {header || `Column ${index + 1}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              <ScrollArea className="max-h-52 rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr className="text-left">
                      <th className="p-2 font-medium">Symbol</th>
                      <th className="p-2 font-medium">Dir</th>
                      <th className="p-2 font-medium">Opened</th>
                      <th className="p-2 font-medium">Entry</th>
                      <th className="p-2 font-medium">Exit</th>
                      <th className="p-2 font-medium">P&L</th>
                      <th className="p-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row) => {
                      const dupe = existingKeys.has(row.dedupeKey);
                      return (
                        <tr key={row.index} className="border-t border-border/60">
                          <td className="p-2 font-medium">{row.symbol || "—"}</td>
                          <td className="p-2">{row.direction ?? "—"}</td>
                          <td className="p-2">
                            {row.opened_at ? new Date(row.opened_at).toLocaleString() : "—"}
                          </td>
                          <td className="p-2">{row.entry_price ?? "—"}</td>
                          <td className="p-2">{row.exit_price ?? "—"}</td>
                          <td className="p-2">{row.pnl ?? "—"}</td>
                          <td className="p-2">
                            {row.errors.length ? (
                              <span className="text-destructive">{row.errors[0]}</span>
                            ) : dupe ? (
                              <span className="text-muted-foreground">Already in journal</span>
                            ) : (
                              <span className="text-success">Ready</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ScrollArea>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <span className="flex items-center gap-1 text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {importable.length} to import
                  </span>
                  {duplicates.length > 0 && (
                    <label className="flex cursor-pointer items-center gap-1.5 text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={skipDuplicates}
                        onChange={(e) => setSkipDuplicates(e.target.checked)}
                        className="h-3.5 w-3.5 accent-primary"
                      />
                      Skip {duplicates.length} duplicate{duplicates.length === 1 ? "" : "s"}
                    </label>
                  )}
                  {invalid.length > 0 && (
                    <span className="flex items-center gap-1 text-warning">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {invalid.length} row{invalid.length === 1 ? "" : "s"} skipped
                    </span>
                  )}
                </div>
                <Button
                  onClick={() => importMut.mutate()}
                  disabled={importMut.isPending || importable.length === 0}
                  className="gradient-primary text-primary-foreground"
                >
                  {importMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Import {importable.length} trade{importable.length === 1 ? "" : "s"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
