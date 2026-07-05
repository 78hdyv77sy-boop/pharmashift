"use client";

import * as React from "react";
import { Loader2, CheckCircle2, ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/toaster";
import { prepareAbsenceReplacements, applyAbsenceReplacements } from "./absence-replace-actions";
import { undoInteraction } from "../agent-actions";
import type { AbsenceReplacementItem } from "./absence-replace-types";

export function ReplacementDraftDialog({ absenceId, onClose }: { absenceId: string; onClose: () => void }) {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [absentName, setAbsentName] = React.useState("");
  const [items, setItems] = React.useState<AbsenceReplacementItem[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState<{ count: number; interactionId?: string } | null>(null);

  React.useEffect(() => {
    let active = true;
    (async () => {
      const res = await prepareAbsenceReplacements(absenceId);
      if (!active) return;
      if (!res.ok) { toast(res.error ?? "Fehler", "error"); onClose(); return; }
      setAbsentName(res.absentName);
      setItems(res.items);
      // standardmäßig alle mit Vorschlag anhaken
      setSelected(new Set(res.items.filter((i) => i.toEmployeeId).map((i) => i.shiftId)));
      setLoading(false);
    })();
    return () => { active = false; };
  }, [absenceId, toast, onClose]);

  function toggle(shiftId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(shiftId)) next.delete(shiftId); else next.add(shiftId);
      return next;
    });
  }

  async function apply() {
    const moves = items
      .filter((i) => i.toEmployeeId && selected.has(i.shiftId))
      .map((i) => ({ shiftId: i.shiftId, fromEmployeeId: i.fromEmployeeId, toEmployeeId: i.toEmployeeId! }));
    if (moves.length === 0) { toast("Nichts ausgewählt.", "info"); return; }
    setBusy(true);
    const res = await applyAbsenceReplacements(moves);
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "Fehler", "error"); return; }
    toast(res.message ?? "Übernommen.", "success");
    setDone({ count: res.count ?? moves.length, interactionId: res.interactionId });
  }

  async function undo() {
    if (!done?.interactionId) return;
    const res = await undoInteraction(done.interactionId);
    if (!res.ok) { toast(res.error ?? "Rückgängig fehlgeschlagen.", "error"); return; }
    toast("Rückgängig gemacht.", "success");
    onClose();
  }

  const withSug = items.filter((i) => i.toEmployeeId);
  const withoutSug = items.filter((i) => !i.toEmployeeId);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Ersatz vorbereiten</DialogTitle>
          <DialogDescription>
            {absentName ? `${absentName} ist im Zeitraum abwesend. ` : ""}Vorschläge prüfen und übernehmen – nichts passiert automatisch.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Entwurf wird vorbereitet…
          </div>
        ) : done ? (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
              <CheckCircle2 className="h-5 w-5 shrink-0" /> {done.count} Ersatz übernommen.
            </div>
            <div className="flex justify-end gap-2">
              {done.interactionId && <Button variant="outline" onClick={undo}>Rückgängig</Button>}
              <Button onClick={onClose}>Fertig</Button>
            </div>
          </div>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Keine betroffenen Dienste im Zeitraum – nichts zu tun. 👍</p>
        ) : (
          <>
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {withSug.map((i) => (
                <label key={i.shiftId} className="flex cursor-pointer items-start gap-3 rounded-lg border p-2.5 hover:bg-muted/40">
                  <Checkbox className="mt-0.5" checked={selected.has(i.shiftId)} onCheckedChange={() => toggle(i.shiftId)} />
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="font-medium">{i.date} · {i.time} <span className="font-normal text-muted-foreground">· {i.locationName}</span></div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs">
                      <span className="text-muted-foreground line-through">{i.fromName}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium text-emerald-700">{i.toName}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{i.reason}</div>
                  </div>
                </label>
              ))}
              {withoutSug.map((i) => (
                <div key={i.shiftId} className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-sm">
                  <div className="font-medium">{i.date} · {i.time} <span className="font-normal text-muted-foreground">· {i.locationName}</span></div>
                  <div className="text-xs text-amber-800">Kein passender Ersatz – bitte manuell im Dienstplan lösen.</div>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Abbrechen</Button>
              <Button onClick={apply} disabled={busy || selected.size === 0}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} {selected.size} übernehmen
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
