"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toaster";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { createTemplate, updateTemplate, deleteTemplate } from "./actions";
import type { ShiftTemplateRow } from "@/lib/domain/template-types";

type Loc = { id: string; name: string };
const ALL = "__all__";

interface FormState { id?: string; name: string; locationId: string; startTime: string; endTime: string; requiredHeadcount: number; color: string; }
const empty: FormState = { name: "", locationId: ALL, startTime: "08:00", endTime: "16:00", requiredHeadcount: 1, color: "" };

export function TemplatesManager({ rows, locations, canManage }: { rows: ShiftTemplateRow[]; locations: Loc[]; canManage: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const confirmDialog = useConfirm();
  const [form, setForm] = React.useState<FormState | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function save() {
    if (!form) return;
    setPending(true); setError(null);
    const payload = { ...form, locationId: form.locationId === ALL ? undefined : form.locationId };
    const res = form.id ? await updateTemplate(form.id, payload) : await createTemplate(payload);
    setPending(false);
    if (!res.ok) return setError(res.error ?? "Fehler");
    setForm(null);
    router.refresh();
  }
  async function remove(id: string) {
    if (!(await confirmDialog({ title: "Vorlage löschen?", confirmText: "Löschen", destructive: true }))) return;
    const res = await deleteTemplate(id);
    if (!res.ok) { toast(res.error ?? "Fehler", "error"); } else { router.refresh(); }
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Button onClick={() => { setForm({ ...empty }); setError(null); }}><Plus className="h-4 w-4" /> Vorlage</Button>
        </div>
      )}

      <div className="rounded-lg border">
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Standort</th>
              <th className="px-3 py-2">Zeit</th>
              <th className="px-3 py-2">Bedarf</th>
              {canManage && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={canManage ? 5 : 4} className="px-3 py-6 text-center text-muted-foreground">Keine Vorlagen.</td></tr>
            ) : (
              rows.map((t) => (
                <tr key={t.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">
                    {t.color && <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: t.color }} />}
                    {t.name}
                  </td>
                  <td className="px-3 py-2">{t.locationName ?? <span className="text-muted-foreground">Alle</span>}</td>
                  <td className="px-3 py-2">{t.startTime}–{t.endTime}</td>
                  <td className="px-3 py-2">{t.requiredHeadcount}</td>
                  {canManage && (
                    <td className="px-3 py-2 text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setForm({ id: t.id, name: t.name, locationId: t.locationId ?? ALL, startTime: t.startTime, endTime: t.endTime, requiredHeadcount: t.requiredHeadcount, color: t.color ?? "" }); setError(null); }}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => remove(t.id)}><Trash2 className="h-4 w-4" /></Button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table></div>
      </div>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form?.id ? "Vorlage bearbeiten" : "Neue Vorlage"}</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-4">
              <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="z. B. Frühdienst" /></div>
              <div className="space-y-1.5">
                <Label>Standort</Label>
                <Select value={form.locationId} onValueChange={(v) => setForm({ ...form, locationId: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Alle Standorte</SelectItem>
                    {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5"><Label>Von</Label><Input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Bis</Label><Input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Bedarf</Label><Input type="number" min={1} max={50} value={form.requiredHeadcount} onChange={(e) => setForm({ ...form, requiredHeadcount: Number(e.target.value) })} /></div>
              </div>
              <div className="space-y-1.5"><Label>Farbe (optional)</Label><Input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} placeholder="#0ea5e9" /></div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Abbrechen</Button></DialogClose>
            <Button onClick={save} disabled={pending || !form?.name}>{pending ? "Speichern…" : "Speichern"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
