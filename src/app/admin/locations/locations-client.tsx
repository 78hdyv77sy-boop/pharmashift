"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createLocation, updateLocation, deleteLocation } from "./actions";
import { useToast } from "@/components/ui/toaster";
import { useConfirm } from "@/components/ui/confirm-dialog";

type Loc = { id: string; name: string; address: string | null; isEmergency: boolean; employeeCount: number };
type FormValue = { id?: string; name: string; address: string; isEmergency: boolean };

const empty: FormValue = { name: "", address: "", isEmergency: false };

export function LocationsClient({ initial, canManage }: { initial: Loc[]; canManage: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const confirmDialog = useConfirm();
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState<FormValue>(empty);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  function openNew() { setV(empty); setError(null); setOpen(true); }
  function openEdit(l: Loc) { setV({ id: l.id, name: l.name, address: l.address ?? "", isEmergency: l.isEmergency }); setError(null); setOpen(true); }

  async function submit() {
    setPending(true);
    setError(null);
    const res = v.id ? await updateLocation(v.id, v) : await createLocation(v);
    setPending(false);
    if (!res.ok) return setError(res.error ?? "Fehler");
    setOpen(false);
    router.refresh();
  }

  async function remove(l: Loc) {
    if (!(await confirmDialog({ title: `Standort „${l.name}" löschen?`, confirmText: "Löschen", destructive: true }))) return;
    await deleteLocation(l.id);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Button onClick={openNew}><Plus className="h-4 w-4" /> Neuer Standort</Button>
        </div>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Adresse</TableHead>
              <TableHead>Notdienst</TableHead>
              <TableHead>Mitarbeiter</TableHead>
              {canManage && <TableHead className="w-24 text-right"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {initial.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="h-20 text-center text-muted-foreground">Noch keine Standorte.</TableCell></TableRow>
            ) : (
              initial.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.name}</TableCell>
                  <TableCell className="text-muted-foreground">{l.address ?? "—"}</TableCell>
                  <TableCell>{l.isEmergency ? <Badge variant="warning">Notdienst</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>{l.employeeCount}</TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(l)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => remove(l)}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{v.id ? "Standort bearbeiten" : "Neuer Standort"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={v.name} onChange={(e) => setV((p) => ({ ...p, name: e.target.value }))} placeholder="Hauptfiliale" />
            </div>
            <div className="space-y-1.5">
              <Label>Adresse (optional)</Label>
              <Input value={v.address} onChange={(e) => setV((p) => ({ ...p, address: e.target.value }))} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={v.isEmergency} onCheckedChange={(c) => setV((p) => ({ ...p, isEmergency: !!c }))} />
              Nimmt am Notdienst teil
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Abbrechen</Button></DialogClose>
            <Button onClick={submit} disabled={pending || !v.name}>{pending ? "Speichern…" : "Speichern"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
