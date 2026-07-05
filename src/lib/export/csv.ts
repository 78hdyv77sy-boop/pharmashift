// CSV-Export-Helfer. Semikolon-getrennt + UTF-8-BOM für problemloses Öffnen
// in Excel (DE). Werte werden korrekt escaped.

type Cell = string | number | boolean | null | undefined;

function escapeCell(v: Cell): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(headers: string[], rows: Cell[][]): string {
  const sep = ";";
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(sep));
  return lines.join("\r\n");
}

export function csvResponse(filename: string, csv: string): Response {
  return new Response("\uFEFF" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** searchParams (URLSearchParams) -> Plain-Record für parseListParams. */
export function spToRecord(sp: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  sp.forEach((v, k) => (out[k] = v));
  return out;
}
