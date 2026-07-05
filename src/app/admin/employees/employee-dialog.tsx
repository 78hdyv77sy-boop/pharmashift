"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { EMPLOYEE_TYPES, EMPLOYEE_TYPE_LABEL } from "@/lib/domain/employee-types";
import { createEmployee, updateEmployee } from "./actions";

type Opt = { id: string; name: string };
const NONE = "__none__";

export interface EmployeeFormValue {
  id?: string;
  firstName: string;
  lastName: string;
  type: string;
  locationId: string | null;
  weeklyHoursTarget: number | null;
  color: string | null;
  active: boolean;
  nightWorkRestricted: boolean;
  qualificationIds: string[];
  responsibilityIds: string[];
}

const empty: EmployeeFormValue = {
  firstName: "", lastName: "", type: "PKA", locationId: null,
  weeklyHoursTarget: 38, color: null, active: true, nightWorkRestricted: false, qualificationIds: [], responsibilityIds: [],
};

export function EmployeeDialog({
  open, onOpenChange, master, initial,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  master: { locations: Opt[]; qualifications: Opt[]; responsibilities: Opt[] };
  initial?: EmployeeFormValue | null;
}) {
  const router = useRouter();
  const [v, setV] = React.useState<EmployeeFormValue>(initial ?? empty);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => setV(initial ?? empty), [initial, open]);

  function set<K extends keyof EmployeeFormValue>(k: K, val: EmployeeFormValue[K]) {
    setV((p) => ({ ...p, [k]: val }));
  }
  function toggleId(key: "qualificationIds" | "responsibilityIds", id: string) {
    setV((p) => {
      const has = p[key].includes(id);
      return { ...p, [key]: has ? p[key].filter((x) => x !== id) : [...p[key], id] };
    });
  }

  async function submit() {
    setPending(true);
    setError(null);
    const payload = { ...v, weeklyHoursTarget: v.weeklyHoursTarget ?? 0 };
    const res = v.id ? await updateEmployee(v.id, payload) : await createEmployee(payload);
    setPending(false);
    if (!res.ok) return setError(res.error ?? "Fehler");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-xl overflow-y-auto">
        <DialogHeader><DialogTitle>{v.id ? "Mitarbeiter bearbeiten" : "Neuer Mitarbeiter"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Vorname</Label>
              <Input value={v.firstName} onChange={(e) => set("firstName", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Nachname</Label>
              <Input value={v.lastName} onChange={(e) => set("lastName", e.target.value)} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Rolle/Typ</Label>
              <Select value={v.type} onValueChange={(val) => set("type", val)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EMPLOYEE_TYPES.map((t) => <SelectItem key={t} value={t}>{EMPLOYEE_TYPE_LABEL[t]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Standort</Label>
              <Select value={v.locationId ?? NONE} onValueChange={(val) => set("locationId", val === NONE ? null : val)}>
                <SelectTrigger><SelectValue placeholder="Standort" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>– kein Standort –</SelectItem>
                  {master.locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Wochenstunden (Soll)</Label>
              <Input type="number" min={0} max={80} value={v.weeklyHoursTarget ?? 0} onChange={(e) => set("weeklyHoursTarget", Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>Farbe (optional)</Label>
              <Input type="color" value={v.color ?? "#888888"} onChange={(e) => set("color", e.target.value)} className="h-10 w-20 p-1" />
            </div>
          </div>

          {master.qualifications.length > 0 && (
            <div className="space-y-1.5">
              <Label>Qualifikationen</Label>
              <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
                {master.qualifications.map((q) => (
                  <label key={q.id} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={v.qualificationIds.includes(q.id)} onCheckedChange={() => toggleId("qualificationIds", q.id)} />
                    {q.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          {master.responsibilities.length > 0 && (
            <div className="space-y-1.5">
              <Label>Zuständigkeiten</Label>
              <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
                {master.responsibilities.map((r) => (
                  <label key={r.id} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={v.responsibilityIds.includes(r.id)} onCheckedChange={() => toggleId("responsibilityIds", r.id)} />
                    {r.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={v.active} onCheckedChange={(c) => set("active", !!c)} /> Aktiv
          </label>
          <label className="flex items-center gap-2 text-sm" title="Schwangerschaft/Stillzeit oder ärztliche Befreiung — kein Nachtdienst 20–6 Uhr (MSchG §6)">
            <Checkbox checked={v.nightWorkRestricted} onCheckedChange={(c) => set("nightWorkRestricted", !!c)} /> Kein Nachtdienst (20–6)
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Abbrechen</Button></DialogClose>
          <Button onClick={submit} disabled={pending || !v.firstName || !v.lastName}>
            {pending ? "Speichern…" : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
