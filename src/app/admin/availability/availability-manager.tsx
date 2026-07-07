"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toaster";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { AVAILABILITY_TYPES, AVAILABILITY_TYPE_LABEL, WEEKDAY_LABEL, type AvailabilityRow } from "@/lib/domain/availability-types";
import { addAvailability, deleteAvailability } from "./actions";

type Emp = { id: string; name: string };
const typeVariant: Record<string, "success" | "warning" | "secondary"> = {
  AVAILABLE: "success", PREFERRED: "secondary", UNAVAILABLE: "warning",
};

export function AvailabilityManager({
  employees, employeeId, rows, canManage,
}: {
  employees: Emp[];
  employeeId: string;
  rows: AvailabilityRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const confirmDialog = useConfirm();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [v, setV] = React.useState({ mode: "recurring", weekday: "1", date: "", startTime: "08:00", endTime: "16:00", type: "AVAILABLE" });

  function selectEmployee(id: string) {
    const next = new URLSearchParams(params.toString());
    next.set("employeeId", id);
    router.push(`${pathname}?${next.toString()}`);
  }

  async function submit() {
    setPending(true); setError(null);
    const res = await addAvailability({
      employeeId,
      mode: v.mode,
      weekday: v.mode === "recurring" ? Number(v.weekday) : undefined,
      date: v.mode === "once" ? v.date : undefined,
      startTime: v.startTime, endTime: v.endTime, type: v.type,
    });
    setPending(false);
    if (!res.ok) return setError(res.error ?? "Fehler");
    setOpen(false);
    router.refresh();
  }
  async function remove(id: string) {
    if (!(await confirmDialog({ title: "Eintrag löschen?", confirmText: "Löschen", destructive: true }))) return;
    const res = await deleteAvailability(id);
    if (!res.ok) { toast(res.error ?? "Fehler", "error"); } else { router.refresh(); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Select value={employeeId} onValueChange={selectEmployee}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Mitarbeiter" /></SelectTrigger>
          <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
        </Select>

        {canManage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4" /> Verfügbarkeit</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Verfügbarkeit hinzufügen</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Art</Label>
                  <Select value={v.mode} onValueChange={(val) => setV({ ...v, mode: val })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recurring">Wöchentlich wiederkehrend</SelectItem>
                      <SelectItem value="once">Einmalig (Datum)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {v.mode === "recurring" ? (
                  <div className="space-y-1.5">
                    <Label>Wochentag</Label>
                    <Select value={v.weekday} onValueChange={(val) => setV({ ...v, weekday: val })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5, 6, 0].map((d) => <SelectItem key={d} value={String(d)}>{WEEKDAY_LABEL[d]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label>Datum</Label>
                    <Input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Von</Label><Input type="time" value={v.startTime} onChange={(e) => setV({ ...v, startTime: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Bis</Label><Input type="time" value={v.endTime} onChange={(e) => setV({ ...v, endTime: e.target.value })} /></div>
                </div>
                <div className="space-y-1.5">
                  <Label>Typ</Label>
                  <Select value={v.type} onValueChange={(val) => setV({ ...v, type: val })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{AVAILABILITY_TYPES.map((t) => <SelectItem key={t} value={t}>{AVAILABILITY_TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
              <DialogFooter>
                <DialogClose asChild><Button variant="outline">Abbrechen</Button></DialogClose>
                <Button onClick={submit} disabled={pending || (v.mode === "once" && !v.date)}>{pending ? "Speichern…" : "Speichern"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="rounded-lg border">
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Wann</th>
              <th className="px-3 py-2">Zeit</th>
              <th className="px-3 py-2">Typ</th>
              {canManage && <th className="px-3 py-2 text-right"></th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={canManage ? 4 : 3} className="px-3 py-6 text-center text-muted-foreground">Keine Verfügbarkeiten hinterlegt.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-3 py-2">{r.recurring ? `Jede Woche · ${WEEKDAY_LABEL[r.weekday ?? 0]}` : r.date}</td>
                  <td className="px-3 py-2">{r.startTime}–{r.endTime}</td>
                  <td className="px-3 py-2"><Badge variant={typeVariant[r.type] ?? "secondary"}>{AVAILABILITY_TYPE_LABEL[r.type] ?? r.type}</Badge></td>
                  {canManage && (
                    <td className="px-3 py-2 text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4" /></Button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}
