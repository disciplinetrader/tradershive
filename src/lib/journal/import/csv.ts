/**
 * Broker CSV / statement import for the Journal.
 *
 * Pure functions only — parsing, column auto-detection, row normalisation and
 * duplicate keys. The UI (ImportTradesDialog) owns the network calls.
 */

import { findInstrument } from "@/lib/journal/instruments";
import type { EntryInsert } from "@/lib/journal/api";

/* -------------------------------------------------------------------------- */
/*  CSV parsing (RFC 4180-ish, handles quotes, embedded commas + newlines)     */
/* -------------------------------------------------------------------------- */

export type ParsedCsv = { headers: string[]; rows: string[][] };

function detectDelimiter(sample: string): string {
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestCount = -1;
  for (const d of candidates) {
    // Count occurrences on the first non-empty line only.
    const line = sample.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
    const count = line.split(d).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

export function parseCsv(text: string): ParsedCsv {
  const clean = text.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(clean);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmpty = rows.filter((r) => r.some((c) => c.trim().length > 0));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };

  // Some broker exports prefix the file with a title / account block. The real
  // header is the first row that contains a recognisable trade column.
  let headerIndex = 0;
  for (let i = 0; i < Math.min(nonEmpty.length, 25); i += 1) {
    const score = nonEmpty[i].filter((c) => guessField(c) !== null).length;
    if (score >= 3) {
      headerIndex = i;
      break;
    }
  }

  const headers = nonEmpty[headerIndex].map((h) => h.trim());
  const body = nonEmpty
    .slice(headerIndex + 1)
    // Drop trailing summary rows that have fewer cells than the header.
    .filter((r) => r.length >= Math.max(2, Math.floor(headers.length / 2)));

  return { headers, rows: body };
}

/* -------------------------------------------------------------------------- */
/*  Column mapping                                                             */
/* -------------------------------------------------------------------------- */

export const IMPORT_FIELDS = [
  { key: "symbol", label: "Symbol", required: true },
  { key: "direction", label: "Direction / Type", required: false },
  { key: "opened_at", label: "Open time", required: false },
  { key: "closed_at", label: "Close time", required: false },
  { key: "entry_price", label: "Entry price", required: false },
  { key: "exit_price", label: "Exit price", required: false },
  { key: "stop_loss", label: "Stop loss", required: false },
  { key: "take_profit", label: "Take profit", required: false },
  { key: "lot_size", label: "Volume / Lots", required: false },
  { key: "pnl", label: "Profit / P&L", required: false },
  { key: "commission", label: "Commission", required: false },
  { key: "swap", label: "Swap", required: false },
  { key: "notes", label: "Comment / Notes", required: false },
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number]["key"];
export type ColumnMap = Partial<Record<ImportField, number>>;

const ALIASES: Record<ImportField, string[]> = {
  symbol: ["symbol", "instrument", "ticker", "pair", "market", "asset", "contract", "security"],
  direction: ["direction", "type", "side", "action", "buy/sell", "position", "b/s", "order type"],
  opened_at: ["open time", "opened", "opentime", "entry time", "entry date", "date", "time", "open date", "opened at"],
  closed_at: ["close time", "closed", "closetime", "exit time", "exit date", "close date", "closed at"],
  entry_price: ["open price", "entry price", "entry", "price open", "openprice", "avg entry", "fill price", "price"],
  exit_price: ["close price", "exit price", "exit", "price close", "closeprice", "avg exit"],
  stop_loss: ["s / l", "s/l", "sl", "stop loss", "stoploss", "stop"],
  take_profit: ["t / p", "t/p", "tp", "take profit", "takeprofit", "target"],
  lot_size: ["volume", "lots", "size", "quantity", "qty", "units", "amount", "contracts"],
  pnl: ["profit", "p&l", "pnl", "p/l", "net p&l", "net profit", "realized p&l", "gross profit", "result"],
  commission: ["commission", "fees", "fee", "brokerage"],
  swap: ["swap", "rollover", "interest", "financing"],
  notes: ["comment", "note", "notes", "remark", "description", "tag"],
};

function normalise(header: string): string {
  return header.trim().toLowerCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ");
}

/** Best-guess field for a single header cell, or null when unrecognised. */
export function guessField(header: string): ImportField | null {
  const h = normalise(header);
  if (!h) return null;
  // Exact alias match wins over partial.
  for (const [field, aliases] of Object.entries(ALIASES) as [ImportField, string[]][]) {
    if (aliases.includes(h)) return field;
  }
  for (const [field, aliases] of Object.entries(ALIASES) as [ImportField, string[]][]) {
    if (aliases.some((a) => h === a || h.startsWith(`${a} `) || h.endsWith(` ${a}`))) return field;
  }
  return null;
}

/** Auto-map every header to a field, keeping the first match per field. */
export function autoMap(headers: string[]): ColumnMap {
  const map: ColumnMap = {};
  headers.forEach((header, index) => {
    const field = guessField(header);
    if (field && map[field] === undefined) map[field] = index;
  });
  return map;
}

/* -------------------------------------------------------------------------- */
/*  Value coercion                                                             */
/* -------------------------------------------------------------------------- */

export function toNumber(raw: string | undefined): number | null {
  if (raw == null) return null;
  let s = raw.trim();
  if (!s) return null;
  const negative = /^\(.*\)$/.test(s);
  s = s.replace(/[()]/g, "");
  // Strip currency symbols, spaces and thousands separators.
  s = s.replace(/[^\d.,\-+]/g, "");
  if (!s) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    // Whichever comes last is the decimal separator.
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma > -1) {
    // "1,234" = thousands; "1,23" = decimal.
    s = s.length - lastComma === 4 ? s.replace(/,/g, "") : s.replace(",", ".");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -Math.abs(n) : n;
}

export function toDirection(raw: string | undefined): "long" | "short" | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (/(^|\W)(buy|long|b)(\W|$)/.test(s) || s.startsWith("buy")) return "long";
  if (/(^|\W)(sell|short|s)(\W|$)/.test(s) || s.startsWith("sell")) return "short";
  return null;
}

/** Parses the date formats brokers actually ship, including DD.MM.YYYY. */
export function toIso(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;

  // 2024.05.17 14:32:01 | 17.05.2024 14:32 | 17/05/2024 14:32 | 2024-05-17T14:32
  const m = s.match(
    /^(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (m) {
    const [, a, b, c, hh = "0", mm = "0", ss = "0"] = m;
    let year: number, month: number, day: number;
    if (a.length === 4) {
      year = Number(a);
      month = Number(b);
      day = Number(c);
    } else {
      // Ambiguous DD/MM vs MM/DD — prefer DD/MM unless the first part is > 12.
      year = Number(c.length === 2 ? `20${c}` : c);
      if (Number(a) > 12) {
        day = Number(a);
        month = Number(b);
      } else if (Number(b) > 12) {
        month = Number(a);
        day = Number(b);
      } else {
        day = Number(a);
        month = Number(b);
      }
    }
    const d = new Date(Date.UTC(year, month - 1, day, Number(hh), Number(mm), Number(ss)));
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }

  const fallback = new Date(s);
  return Number.isFinite(fallback.getTime()) ? fallback.toISOString() : null;
}

/* -------------------------------------------------------------------------- */
/*  Row → draft trade                                                          */
/* -------------------------------------------------------------------------- */

export type ImportRow = {
  index: number;
  symbol: string;
  market: string;
  direction: "long" | "short" | null;
  opened_at: string | null;
  closed_at: string | null;
  entry_price: number | null;
  exit_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  lot_size: number | null;
  pnl: number | null;
  commission: number | null;
  swap: number | null;
  notes: string | null;
  /** Stable identity used to skip rows that are already in the journal. */
  dedupeKey: string;
  errors: string[];
};

function cell(row: string[], index: number | undefined): string | undefined {
  if (index === undefined) return undefined;
  return row[index];
}

export function buildDedupeKey(input: {
  symbol: string;
  direction: string | null;
  opened_at: string | null;
  entry_price: number | null;
  pnl: number | null;
}): string {
  return [
    input.symbol.toUpperCase(),
    input.direction ?? "",
    input.opened_at ? input.opened_at.slice(0, 16) : "",
    input.entry_price != null ? input.entry_price.toFixed(5) : "",
    input.pnl != null ? input.pnl.toFixed(2) : "",
  ].join("|");
}

export function mapRow(row: string[], map: ColumnMap, index: number): ImportRow {
  const errors: string[] = [];
  const rawSymbol = (cell(row, map.symbol) ?? "").trim();
  const instrument = rawSymbol ? findInstrument(rawSymbol) : null;
  const symbol = instrument?.symbol ?? rawSymbol.toUpperCase();
  if (!symbol) errors.push("Missing symbol");

  const direction = toDirection(cell(row, map.direction));
  const opened_at = toIso(cell(row, map.opened_at));
  const closed_at = toIso(cell(row, map.closed_at));
  const entry_price = toNumber(cell(row, map.entry_price));
  const exit_price = toNumber(cell(row, map.exit_price));
  const pnl = toNumber(cell(row, map.pnl));

  if (entry_price == null && pnl == null) errors.push("Needs an entry price or a P&L");

  return {
    index,
    symbol,
    market: instrument?.market ?? "forex",
    direction,
    opened_at,
    closed_at,
    entry_price,
    exit_price,
    stop_loss: toNumber(cell(row, map.stop_loss)),
    take_profit: toNumber(cell(row, map.take_profit)),
    lot_size: toNumber(cell(row, map.lot_size)),
    pnl,
    commission: toNumber(cell(row, map.commission)),
    swap: toNumber(cell(row, map.swap)),
    notes: (cell(row, map.notes) ?? "").trim() || null,
    dedupeKey: buildDedupeKey({ symbol, direction, opened_at, entry_price, pnl }),
    errors,
  };
}

export function mapRows(rows: string[][], map: ColumnMap): ImportRow[] {
  return rows.map((row, i) => mapRow(row, map, i));
}

/** Converts a validated row into a journal insert payload. */
export function toEntryInsert(row: ImportRow, userId: string, accountId: string | null): EntryInsert {
  const rr =
    row.entry_price != null && row.exit_price != null && row.stop_loss != null
      ? computeR(row.entry_price, row.exit_price, row.stop_loss, row.direction ?? "long")
      : null;

  return {
    user_id: userId,
    account_id: accountId,
    status: "published",
    symbol: row.symbol,
    market: row.market,
    direction: row.direction,
    opened_at: row.opened_at,
    closed_at: row.closed_at ?? row.opened_at,
    entry_price: row.entry_price,
    exit_price: row.exit_price,
    stop_loss: row.stop_loss,
    take_profit: row.take_profit,
    lot_size: row.lot_size,
    pnl: row.pnl,
    commission: row.commission,
    swap: row.swap,
    rr,
    notes_text: row.notes,
    title: `${row.symbol} · ${row.direction ?? "trade"}`,
  } as EntryInsert;
}

export function computeR(
  entry: number,
  exit: number,
  stop: number,
  direction: "long" | "short",
): number | null {
  const risk = Math.abs(entry - stop);
  if (!risk) return null;
  const move = (exit - entry) * (direction === "long" ? 1 : -1);
  return Math.round((move / risk) * 100) / 100;
}
