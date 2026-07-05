"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { applyTemplatesToWeek } from "@/app/admin/shifts/template-apply-actions";
import type { ShiftTemplateRow } from "@/lib/domain/template-types";

const WEEKDAYS: { wd: number; label: string }[] = [
  { wd: 1, label: "Mo" }, { wd: 2, label: "Di" }, { wd: 3, label: "Mi" },
  { wd: 4, label: "Do" }, { wd: 5, label: "Fr" }, { wd: 6, label: "Sa" }, { wd: 0, label: "So" },
];

export function TemplateApply({
  open, onOpenChange, templates, locationId, weekStart,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  templates: ShiftTemplateRow[];
  locationId: string;
  weekStart: string;
}) {
  const router = useRouter();
  const [sel, setSel] = React.useState<Record<string, Set<number>>>({});
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => { if (open) { setSel({}); setError(null); } }, [open]);

  function toggle(templateId: string, wd: number) {
    setSel((prev) => {
      const set = new Set(prev[templateId] ?? []);
      if (set.has(wd)) set.delete(wd); else set.add(wd);
      return { ...prev, [templateId]: set };
    });
  }

  async function apply() {
    setPending(true); setError(null);
    const selections = Object.entries(sel)
      .map(([templateId, set]) => ({ templateId, weekdays: Array.from(set) }))
      .filter((s) => s.weekdays.length > 0);
    if (selections.length === 0) { setPending(false); setError("Bitte mindestens einen Tag wählen."); return; }
    const res = await applyTemplatesToWeek({ locationId, weekStart, selections });
    setPending(false);
    if (!res.ok) return setError(res.error ?? "Fehler");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Aus Vorlagen anwenden</DialogTitle>
          <DialogDescription>Wähle je Vorlage die Wochentage – die Schichten werden in der aktuellen Woche angelegt.</DialogDescription>
        </DialogHeader>

        {templates.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">Keine Vorlagen vorhanden. Lege zuerst welche unter „Schicht-Vorlagen" an.</p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_repeat(7,2rem)] items-center gap-1 px-1 text-center text-xs text-muted-foreground">
              <div className="text-left">Vorlage</div>
              {WEEKDAYS.map((d) => <div key={d.wd}>{d.label}</div>)}
            </div>
            {templates.map((t) => (
              <div key={t.id} className="grid grid-cols-[1fr_repeat(7,2rem)] items-center gap-1 rounded-md border px-1 py-1.5">
                <div className="min-w-0 text-sm">
                  <span className="font-medium">{t.name}</span>
                  <span className="ml-1 text-xs text-muted-foreground">{t.startTime}–{t.endTime} · {t.requiredHeadcount}P</span>
                </div>
                {WEEKDAYS.map((d) => (
                  <div key={d.wd} className="flex justify-center">
                    <Checkbox checked={sel[t.id]?.has(d.wd) ?? false} onCheckedChange={() => toggle(t.id, d.wd)} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={apply} disabled={pending || templates.length === 0}>{pending ? "Anwenden…" : "Anwenden"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
