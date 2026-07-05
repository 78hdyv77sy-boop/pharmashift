"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { generatePlanProposal, commitPlanProposal } from "@/app/admin/shifts/plan-actions";

interface EditableShift {
  date: string;
  dayLabel: string;
  startTime: string;
  endTime: string;
  requiredHeadcount: number;
  notes: string | null;
  assigned: { id: string; name: string }[];
}

export function PlanReview({
  open, onOpenChange, locationId, weekStart,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  locationId: string;
  weekStart: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [shifts, setShifts] = React.useState<EditableShift[]>([]);
  const [warnings, setWarnings] = React.useState<string[]>([]);
  const [templateWeek, setTemplateWeek] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [committing, setCommitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    generatePlanProposal(locationId, weekStart).then((res) => {
      setLoading(false);
      if (!res.ok || !res.proposal) { setError(res.error ?? "Fehler"); return; }
      setTemplateWeek(res.proposal.templateWeekStart);
      setWarnings(res.proposal.warnings);
      setShifts(res.proposal.shifts.map((s) => ({
        date: s.date, dayLabel: s.dayLabel, startTime: s.startTime, endTime: s.endTime,
        requiredHeadcount: s.requiredHeadcount, notes: s.notes,
        assigned: s.assignedEmployeeIds.map((id, i) => ({ id, name: s.assignedNames[i] ?? id })),
      })));
    });
  }, [open, locationId, weekStart]);

  function removeAssignment(si: number, eid: string) {
    setShifts((prev) => prev.map((s, i) => (i === si ? { ...s, assigned: s.assigned.filter((a) => a.id !== eid) } : s)));
  }
  function dropShift(si: number) {
    setShifts((prev) => prev.filter((_, i) => i !== si));
  }

  async function commit() {
    setCommitting(true);
    setError(null);
    const res = await commitPlanProposal({
      locationId,
      shifts: shifts.map((s) => ({
        date: s.date, startTime: s.startTime, endTime: s.endTime,
        requiredHeadcount: s.requiredHeadcount, notes: s.notes,
        assignedEmployeeIds: s.assigned.map((a) => a.id),
      })),
    });
    setCommitting(false);
    if (!res.ok) return setError(res.error ?? "Fehler");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Wochenplan-Vorschlag</DialogTitle>
          <DialogDescription>
            {templateWeek ? `Basierend auf der Woche ab ${templateWeek}. Prüfe und passe an, dann übernehmen.` : "Vorschlag"}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Erstelle Vorschlag…</div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <div className="space-y-3">
            {warnings.length > 0 && (
              <div className="space-y-1 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                <div className="flex items-center gap-1 font-medium"><AlertTriangle className="h-3.5 w-3.5" /> Hinweise</div>
                {warnings.map((w, i) => <div key={i}>{w}</div>)}
              </div>
            )}

            {shifts.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Kein Vorschlag verfügbar.</p>
            ) : (
              shifts.map((s, si) => {
                const under = s.assigned.length < s.requiredHeadcount;
                return (
                  <div key={si} className="rounded-md border p-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{s.dayLabel} · {s.startTime}–{s.endTime}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant={under ? "warning" : "success"}>{s.assigned.length}/{s.requiredHeadcount}</Badge>
                        <button onClick={() => dropShift(si)} className="text-muted-foreground hover:text-destructive" aria-label="Schicht verwerfen"><X className="h-4 w-4" /></button>
                      </div>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {s.assigned.length === 0 && <span className="text-xs text-muted-foreground">– niemand zugewiesen –</span>}
                      {s.assigned.map((a) => (
                        <span key={a.id} className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-xs">
                          {a.name}
                          <button onClick={() => removeAssignment(si, a.id)} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={commit} disabled={committing || loading || shifts.length === 0}>
            {committing ? "Übernehme…" : `Plan übernehmen (${shifts.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
