"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Upload, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { importEmployees } from "./actions";
import type { ImportRow, ImportResult } from "./types";

const HEADER_HINT = "Vorname;Nachname;Typ;Standort;Wochenstunden";

function detectDelimiter(line: string): string {
  return (line.match(/;/g)?.length ?? 0) >= (line.match(/,/g)?.length ?? 0) ? ";" : ",";
}

function parseCSV(text: string): ImportRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const delim = detectDelimiter(lines[0]);
  // Kopfzeile erkennen (enthält "vorname"/"name")
  const hasHeader = /vorname|nachname|name|typ/i.test(lines[0]);
  const dataLines = hasHeader ? lines.slice(1) : lines;
  return dataLines.map((l) => {
    const cols = l.split(delim).map((c) => c.trim().replace(/^"|"$/g, ""));
    return { firstName: cols[0] ?? "", lastName: cols[1] ?? "", type: cols[2] ?? "", locationName: cols[3] ?? "", weeklyHours: cols[4] ?? "" };
  });
}

export function ImportClient() {
  const router = useRouter();
  const [text, setText] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [result, setResult] = React.useState<ImportResult | null>(null);

  const rows = React.useMemo(() => parseCSV(text), [text]);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ""));
    reader.readAsText(file, "utf-8");
  }

  async function submit() {
    setPending(true);
    setResult(null);
    const res = await importEmployees(rows);
    setPending(false);
    setResult(res);
    if (res.ok && res.created > 0) router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="rounded-md bg-muted/40 p-3 text-sm">
        Format (Spalten, mit oder ohne Kopfzeile): <code>{HEADER_HINT}</code>.
        Trennzeichen <code>;</code> oder <code>,</code>. Typ als Kürzel (APOTHEKER, PKA, BUERO, ASPIRANT, LEHRLING, SONSTIGE) oder Bezeichnung.
        Standort &amp; Wochenstunden sind optional.
      </div>

      <div className="space-y-2">
        <Label>CSV einfügen</Label>
        <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={`${HEADER_HINT}\nLisa;Berger;Apotheker:in;Hauptfiliale;40\nTom;Klein;PKA;Hauptfiliale;30`} />
        <div className="flex items-center gap-3">
          <input id="csvfile" type="file" accept=".csv,text/csv,text/plain" onChange={onFile} className="text-sm" />
        </div>
      </div>

      {rows.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{rows.length} Zeile(n) erkannt – Vorschau (max. 10):</p>
          <div className="rounded-lg border">
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <tr><th className="px-3 py-2">Vorname</th><th className="px-3 py-2">Nachname</th><th className="px-3 py-2">Typ</th><th className="px-3 py-2">Standort</th><th className="px-3 py-2">Std.</th></tr>
              </thead>
              <tbody>
                {rows.slice(0, 10).map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-3 py-1.5">{r.firstName}</td>
                    <td className="px-3 py-1.5">{r.lastName}</td>
                    <td className="px-3 py-1.5">{r.type}</td>
                    <td className="px-3 py-1.5">{r.locationName}</td>
                    <td className="px-3 py-1.5">{r.weeklyHours}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        </div>
      )}

      {result && (
        <div className="space-y-2 rounded-md border p-3 text-sm">
          <div className="flex items-center gap-2">
            <Badge variant="success">{result.created} angelegt</Badge>
            {result.errors.length > 0 && <Badge variant="warning">{result.errors.length} übersprungen</Badge>}
            {result.error && <span className="text-destructive">{result.error}</span>}
          </div>
          {result.errors.length > 0 && (
            <ul className="max-h-40 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
              {result.errors.map((e, i) => <li key={i}>Zeile {e.line}: {e.message}</li>)}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button onClick={submit} disabled={pending || rows.length === 0}><Upload className="h-4 w-4" /> {pending ? "Importiere…" : `${rows.length} importieren`}</Button>
        <Button asChild variant="outline"><Link href="/admin/employees"><ArrowLeft className="h-4 w-4" /> Zur Mitarbeiterliste</Link></Button>
      </div>
    </div>
  );
}
