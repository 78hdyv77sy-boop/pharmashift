"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DataTable, type Column, type FilterDef } from "@/components/data-table/data-table";
import { useToast } from "@/components/ui/toaster";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { requestAbsence, setAbsenceStatus, deleteAbsence } from "./actions";
import { ReplacementDraftDialog } from "./replacement-draft-dialog";
import { ABSENCE_TYPES, ABSENCE_TYPE_LABEL, ABSENCE_STATUS_LABEL, type AbsenceRow } from "@/lib/domain/absence-types";

type Emp = { id: string; name: string };
interface Props {
  rows: AbsenceRow[];
  total: number; page: number; pageSize: number; totalPages: number;
  sort: string | null; dir: "asc" | "desc"; search: string; activeFilters: Record<string, string>;
  employees: Emp[];
  canRequest: boolean;
  canApprove: boolean;
}

const statusVariant: Record<string, "success" | "warning" | "secondary"> = {
  APPROVED: "success", REQUESTED: "warning", DECLINED: "secondary",
};

export function AbsencesTable(props: Props) {
  const { employees, canRequest, canApprove } = props;
  const router = useRouter();
  const { toast } = useToast();
  const confirmDialog = useConfirm();
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState({ employeeId: employees[0]?.id ?? "", startDate: "", endDate: "", type: "VACATION", note: "" });
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [draftFor, setDraftFor] = React.useState<string | null>(null); // Ersatz-Entwurf-Dialog

  async function submit() {
    setPending(true);
    setError(null);
    const res = await requestAbsence(v);
    setPending(false);
    if (!res.ok) return setError(res.error ?? "Fehler");
    setOpen(false);
    router.refresh();
  }
  async function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    const res = await fn();
    if (!res.ok) { toast(res.error ?? "Fehler", "error"); return; }
    toast("Erledigt.", "success");
    router.refresh();
  }

  // UX2-P0 N4: Genehmigen mit Konfliktprüfung (Schutz vor stillen Lücken)
  async function approveGuarded(absenceId: string) {
    const res = await setAbsenceStatus(absenceId, "APPROVED");
    if (!res.ok && res.conflicts && res.conflicts.length > 0) {
      const ok = await confirmDialog({
        title: "Person ist im Zeitraum eingeteilt",
        description: `${res.conflicts.slice(0, 5).join(" · ")}${res.conflicts.length > 5 ? " · …" : ""} — bei Genehmigung entstehen Lücken im Plan.`,
        confirmText: "Trotzdem genehmigen",
        destructive: true,
      });
      if (!ok) return;
      const forced = await setAbsenceStatus(absenceId, "APPROVED", { force: true });
      if (!forced.ok) { toast(forced.error ?? "Fehler", "error"); return; }
      toast("Genehmigt – Ersatz-Entwurf wird vorbereitet.", "success");
      router.refresh();
      setDraftFor(absenceId); // Autonomie mit Schranke: Entwurf öffnen, Mensch bestätigt
      return;
    }
    if (!res.ok) { toast(res.error ?? "Fehler", "error"); return; }
    toast("Genehmigt.", "success");
    router.refresh();
  }

  const filters: FilterDef[] = [
    { key: "status", label: "Status", options: Object.entries(ABSENCE_STATUS_LABEL).map(([value, label]) => ({ value, label })) },
    { key: "type", label: "Typ", options: ABSENCE_TYPES.map((t) => ({ value: t, label: ABSENCE_TYPE_LABEL[t] })) },
  ];

  const columns: Column<AbsenceRow>[] = [
    { key: "employeeName", header: "Mitarbeiter", cell: (r) => <span className="font-medium">{r.employeeName}</span> },
    { key: "startDate", header: "Zeitraum", sortable: true, cell: (r) => `${r.startDate} – ${r.endDate}` },
    { key: "type", header: "Typ", cell: (r) => <Badge variant="secondary">{ABSENCE_TYPE_LABEL[r.type] ?? r.type}</Badge> },
    { key: "status", header: "Status", cell: (r) => <Badge variant={statusVariant[r.status] ?? "secondary"}>{ABSENCE_STATUS_LABEL[r.status] ?? r.status}</Badge> },
    { key: "note", header: "Notiz", cell: (r) => r.note ?? <span className="text-muted-foreground">—</span> },
  ];
  if (canApprove) {
    columns.push({
      key: "actions", header: "", className: "text-right w-56",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          {r.status !== "APPROVED" && <Button variant="outline" size="sm" onClick={() => approveGuarded(r.id)}>Genehmigen</Button>}
          {r.status === "APPROVED" && <Button variant="outline" size="sm" onClick={() => setDraftFor(r.id)}>Ersatz</Button>}
          {r.status !== "DECLINED" && <Button variant="ghost" size="sm" onClick={() => act(() => setAbsenceStatus(r.id, "DECLINED"))}>Ablehnen</Button>}
          <Button variant="ghost" size="sm" className="text-destructive" onClick={async () => { if (await confirmDialog({ title: "Abwesenheit löschen?", confirmText: "Löschen", destructive: true })) act(() => deleteAbsence(r.id)); }}>Löschen</Button>
        </div>
      ),
    });
  }

  return (
    <>
      {canRequest && (
        <div className="mb-3 flex justify-end">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4" /> Abwesenheit</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Abwesenheit beantragen</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Mitarbeiter</Label>
                  <Select value={v.employeeId} onValueChange={(val) => setV({ ...v, employeeId: val })}>
                    <SelectTrigger><SelectValue placeholder="Mitarbeiter" /></SelectTrigger>
                    <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Von</Label><Input type="date" value={v.startDate} onChange={(e) => setV({ ...v, startDate: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Bis</Label><Input type="date" value={v.endDate} onChange={(e) => setV({ ...v, endDate: e.target.value })} /></div>
                </div>
                <div className="space-y-1.5">
                  <Label>Typ</Label>
                  <Select value={v.type} onValueChange={(val) => setV({ ...v, type: val })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ABSENCE_TYPES.map((t) => <SelectItem key={t} value={t}>{ABSENCE_TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Notiz (optional)</Label><Input value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} /></div>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
              <DialogFooter>
                <DialogClose asChild><Button variant="outline">Abbrechen</Button></DialogClose>
                <Button onClick={submit} disabled={pending || !v.employeeId || !v.startDate || !v.endDate}>{pending ? "Senden…" : "Beantragen"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      <DataTable<AbsenceRow>
        columns={columns}
        rowKey={(r) => r.id}
        searchPlaceholder="Mitarbeiter suchen…"
        exportPath="/api/export/absences"
        filters={filters}
        rows={props.rows} total={props.total} page={props.page} pageSize={props.pageSize}
        totalPages={props.totalPages} sort={props.sort} dir={props.dir} search={props.search}
        activeFilters={props.activeFilters}
      />

      {draftFor && <ReplacementDraftDialog absenceId={draftFor} onClose={() => { setDraftFor(null); router.refresh(); }} />}
    </>
  );
}
