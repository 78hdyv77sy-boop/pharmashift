"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Wand2, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toaster";
import { proposeWeekFill, applyWeekFill } from "@/app/admin/shifts/solver-actions";
import { undoInteraction } from "@/app/admin/agent-actions";
import type { SolverPlanItem } from "@/lib/domain/solver-types";
import { formatDayLabel, weekdayShort } from "@/lib/domain/dates";

// AI-P3: Review-vor-Ausführen für den deterministischen Solver.

export function SolverReview({ open, onOpenChange, locationId, weekStart }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  locationId: string;
  weekStart: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(false);
  const [applying, setApplying] = React.useState(false);
  const [items, setItems] = React.useState<SolverPlanItem[]>([]);
  const [warnings, setWarnings] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [doneId, setDoneId] = React.useState<string | null>(null);
  const [doneMsg, setDoneMsg] = React.useState<string>("");

  React.useEffect(() => {
    if (!open) return;
    setLoading(true); setError(null); setItems([]); setWarnings([]); setDoneId(null); setDoneMsg("");
    proposeWeekFill(locationId, weekStart)
      .then((res) => {
        setLoading(false);
        if (!res.ok) { setError(res.error ?? "Fehler"); return; }
        setItems(res.items);
        setWarnings(res.warnings);
      })
      .catch((e) => {
        setLoading(false);
        setError(e instanceof Error ? e.message : "Unerwarteter Fehler beim Berechnen.");
      });
  }, [open, locationId, weekStart]);

  async function apply() {
    setApplying(true);
    const res = await applyWeekFill(items.map((i) => ({ shiftId: i.shiftId, employeeId: i.employeeId })));
    setApplying(false);
    if (!res.ok) { toast(res.error ?? "Fehler", "error"); return; }
    // UX2-P0 N3: Erfolg im Modal mit Undo-Pfad (statt sofort schließen)
    setDoneMsg(res.message ?? "Übernommen.");
    setDoneId(res.canUndo && res.interactionId ? res.interactionId : null);
    router.refresh();
  }

  async function undo() {
    if (!doneId) return;
    const res = await undoInteraction(doneId);
    if (!res.ok) { toast(res.error ?? "Fehler", "error"); return; }
    toast("Rückgängig gemacht.", "success");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wand2 className="h-4 w-4" /> Lücken automatisch füllen</DialogTitle>
        </DialogHeader>

        {loading && <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Berechne (Abwesenheiten, Verfügbarkeiten, AZG-Regeln, Stunden-Soll)…</div>}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {doneMsg && (
          <div className="space-y-3">
            <p className="text-sm">✅ {doneMsg}</p>
            <DialogFooter>
              {doneId && <Button variant="outline" onClick={undo}>Rückgängig</Button>}
              <Button onClick={() => onOpenChange(false)}>Schließen</Button>
            </DialogFooter>
          </div>
        )}

        {!loading && !error && !doneMsg && (
          <div className="space-y-3">
            {warnings.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                {warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
              </div>
            )}
            {items.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                {warnings.length > 0
                  ? "Für die offenen Plätze wurde niemand gefunden, der alle Regeln erfüllt – Details siehe Warnungen oben."
                  : "Diese Woche hat keine offenen Plätze – alle Schichten sind besetzt."}
              </p>
            ) : (
              <div className="max-h-72 space-y-1.5 overflow-y-auto">
                {items.map((it, i) => (
                  <div key={`${it.shiftId}-${it.employeeId}`} className="flex items-start justify-between gap-2 rounded-md border p-2 text-sm">
                    <div className="min-w-0">
                      <div><span className="font-medium">{it.employeeName}</span> → {weekdayShort(it.date)} {formatDayLabel(it.date)}, {it.time}</div>
                      {it.reason && <div className="truncate text-xs text-muted-foreground">{it.reason}</div>}
                    </div>
                    <button onClick={() => setItems((p) => p.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive" aria-label="Entfernen">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Bestehende Zuweisungen werden nicht verändert. Regeln: Abwesenheit, Verfügbarkeit, 11h-Ruhezeit, max. 48h/Woche, Rollen-Pflicht, Stunden-Soll &amp; Wochenend-Fairness.</p>
          </div>
        )}

        {!doneMsg && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button onClick={apply} disabled={loading || applying || items.length === 0}>
              {applying ? "Übernehme…" : `${items.length} Zuweisung(en) übernehmen`}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
