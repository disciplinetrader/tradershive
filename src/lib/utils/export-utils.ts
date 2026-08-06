import { saveAs } from "file-saver";

/**
 * Common export utility for analytics and journal data.
 * Ensures cross-browser compatibility and correct blob handling.
 */

export function exportToCsv(filename: string, headers: string[], rows: string[][]) {
  const content = [
    headers.join(","),
    ...rows.map(row => row.map(cell => {
      const escaped = String(cell ?? "").replace(/"/g, '""');
      return `"${escaped}"`;
    }).join(","))
  ].join("\n");
  
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  saveAs(blob, filename);
}

export function exportToJson(filename: string, data: any) {
  const content = JSON.stringify(data, null, 2);
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  saveAs(blob, filename);
}
