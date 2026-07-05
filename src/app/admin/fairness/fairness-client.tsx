"use client";

import * as React from "react";
import { Moon, CalendarDays, Sun, Sunset } from "lucide-react";
import { getFairnessScores } from "./actions";
import { RANGE_LABEL, type FairnessRange } from "@/lib/domain/fairness";
import type { FairnessResult, FairnessRow } from "./fairness-types";

const RANGES: FairnessRange[] = ["90d", "year", "all"];

export function FairnessClient({ initial }: { initial: FairnessResult }) {
  const [data, setData] = React.useState<FairnessResult>(initial);
  const [loading, setLoading] = React.useState(false);

  async function pick(r: FairnessRange) {
    if (r === data.range) return;
    setLoading(true);
    const res = await getFairnessScores(r);
    setData(res);
    setLoading(false);
  }

  // Zeilen nach Rolle gruppieren
  const groups = new Map<string, FairnessRow[]>();
  for (const row of data.rows) {
    const arr = groups.get(row.typeLabel) ?? [];
    arr.push(row);
    groups.set(row.typeLabel, arr);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-1.5">
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => pick(r)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${r === data.range ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"}`}
          >
            {RANGE_LABEL[r]}
          </button>
        ))}
        {loading && <span className="text-xs text-muted-foreground">Lade…</span>}
      </div>

      {data.rows.length === 0 ? (
        <p className="rounded-lg border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
          {data.viewAll ? "Noch keine Dienste im Zeitraum." : "Kein verknüpfter Mitarbeiter-Account – bitte an die Leitung wenden."}
        </p>
      ) : (
        [...groups.entries()].map(([label, rows]) => (
          <section key={label} className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">{label}</h2>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Mitarbeiter:in</th>
                    <th className="px-2 py-2 text-center font-medium" title="Nachtdienste (5×)"><Moon className="mx-auto h-3.5 w-3.5" /></th>
                    <th className="px-2 py-2 text-center font-medium" title="Feiertage (3×)"><CalendarDays className="mx-auto h-3.5 w-3.5" /></th>
                    <th className="px-2 py-2 text-center font-medium" title="Wochenenden (2×)"><Sun className="mx-auto h-3.5 w-3.5" /></th>
                    <th className="px-2 py-2 text-center font-medium" title="Abendschichten (1×)"><Sunset className="mx-auto h-3.5 w-3.5" /></th>
                    <th className="px-3 py-2 text-left font-medium">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.employeeId} className={`border-b last:border-0 ${r.mine ? "bg-primary/5" : ""}`}>
                      <td className="px-3 py-2">{r.name}{r.mine && <span className="ml-1 text-xs text-primary">(ich)</span>}</td>
                      <td className="px-2 py-2 text-center tabular-nums">{r.counts.night || "–"}</td>
                      <td className="px-2 py-2 text-center tabular-nums">{r.counts.holiday || "–"}</td>
                      <td className="px-2 py-2 text-center tabular-nums">{r.counts.weekend || "–"}</td>
                      <td className="px-2 py-2 text-center tabular-nums">{r.counts.evening || "–"}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${r.score}%` }} />
                          </div>
                          <span className="w-8 text-right tabular-nums text-xs text-muted-foreground">{r.score}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}

      <p className="text-xs text-muted-foreground">
        Score = normalisierte Belastung (0–100) je Rolle. 100 = am meisten unbeliebte Dienste, 0 = am wenigsten. {data.viewAll ? "Als Leitung siehst du alle." : "Du siehst deinen eigenen Score."}
      </p>
    </div>
  );
}
