"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toaster";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { getReplacements } from "@/app/admin/shifts/replacement-actions";
import { assignEmployee, unassignEmployee } from "@/app/admin/shifts/actions";
import type { ReplacementResult } from "@/lib/domain/replacement";

export function ReplacementModal({
  open, onOpenChange, employeeId, date,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  employeeId: string;
  date: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const confirmDialog = useConfirm();
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<ReplacementResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [removeAbsent, setRemoveAbsent] = React.useState(true);
  const [done, setDone] = React.useState<Record<string, string>>({}); // shiftId -> candidateName

  React.useEffect(() => {
    if (!open) return;
    setResult(null); setError(null); setDone({});
    setLoading(true);
    getReplacements(employeeId, date).then((res) => {
      setLoading(false);
      if (!res.ok || !res.result) setError(res.error ?? "Fehler");
      else setResult(res.result);
    });
  }, [open, employeeId, date]);

  async function apply(shiftId: string, candidateId: string, candidateName: string) {
    if (removeAbsent) await unassignEmployee(shiftId, employeeId);
    const res = await assignEmployee(shiftId, candidateId);
    if (!res.ok) { toast(res.error ?? "Fehler", "error"); return; }
    setDone((d) => ({ ...d, [shiftId]: candidateName }));
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UserCheck className="h-5 w-5" /> Ersatz finden</DialogTitle>
          <DialogDescription>
            {result ? `Für ${result.employeeName} am ${result.date}.` : "Suche Ersatzkräfte…"}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Lade Vorschläge…</div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : result && result.affected.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">{result.note ?? "Keine betroffenen Schichten."}</p>
        ) : result ? (
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={removeAbsent} onCheckedChange={(c) => setRemoveAbsent(!!c)} />
              Abwesende Person beim Zuweisen aus der Schicht entfernen
            </label>

            {result.affected.map((s) => (
              <div key={s.shiftId} className="rounded-md border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">{s.startTime}–{s.endTime}</span>
                  {done[s.shiftId] && <Badge variant="success">{done[s.shiftId]} zugewiesen</Badge>}
                </div>
                {s.candidates.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Keine passenden Kandidaten frei.</p>
                ) : (
                  <div className="space-y-1.5">
                    {s.candidates.map((c) => (
                      <div key={c.id} className="flex items-center justify-between gap-2 rounded bg-muted/40 px-2 py-1.5">
                        <div className="min-w-0">
                          <div className="text-sm font-medium">{c.name} <span className="text-xs text-muted-foreground">{c.typeLabel}</span></div>
                          <div className="truncate text-xs text-muted-foreground">{c.reasons.join(" · ") || "verfügbar"}</div>
                        </div>
                        <Button size="sm" variant="outline" disabled={!!done[s.shiftId]} onClick={() => apply(s.shiftId, c.id, c.name)}>
                          Zuweisen
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Schließen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
