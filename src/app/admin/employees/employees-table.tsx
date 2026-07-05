"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column, type FilterDef } from "@/components/data-table/data-table";
import { EmployeeDialog, type EmployeeFormValue } from "./employee-dialog";
import { setEmployeeActive, deleteEmployee } from "./actions";
import { getEmployeeAction } from "./fetch-action";
import { EMPLOYEE_TYPES, EMPLOYEE_TYPE_LABEL, type EmployeeRow } from "@/lib/domain/employee-types";
import { useToast } from "@/components/ui/toaster";
import { useConfirm } from "@/components/ui/confirm-dialog";

type Opt = { id: string; name: string };

interface Props {
  rows: EmployeeRow[];
  total: number; page: number; pageSize: number; totalPages: number;
  sort: string | null; dir: "asc" | "desc"; search: string;
  activeFilters: Record<string, string>;
  master: { locations: Opt[]; qualifications: Opt[]; responsibilities: Opt[] };
  canManage: boolean;
}

export function EmployeesTable(props: Props) {
  const { master, canManage } = props;
  const router = useRouter();
  const { toast } = useToast();
  const confirmDialog = useConfirm();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<EmployeeFormValue | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }

  async function edit(row: EmployeeRow) {
    setBusyId(row.id);
    const res = await getEmployeeAction(row.id);
    setBusyId(null);
    if (!res.ok || !res.employee) { toast(res.error ?? "Fehler", "error"); return; }
    setEditing(res.employee);
    setDialogOpen(true);
  }

  async function toggleActive(row: EmployeeRow) {
    await setEmployeeActive(row.id, !row.active);
    router.refresh();
  }
  async function remove(row: EmployeeRow) {
    if (!(await confirmDialog({ title: `${row.firstName} ${row.lastName} löschen?`, description: "Der Mitarbeiter wird deaktiviert/entfernt.", confirmText: "Löschen", destructive: true }))) return;
    await deleteEmployee(row.id);
    router.refresh();
  }

  const filters: FilterDef[] = [
    { key: "type", label: "Typ", options: EMPLOYEE_TYPES.map((t) => ({ label: EMPLOYEE_TYPE_LABEL[t], value: t })) },
    { key: "locationId", label: "Standort", options: master.locations.map((l) => ({ label: l.name, value: l.id })) },
    { key: "active", label: "Status", options: [{ label: "Aktiv", value: "true" }, { label: "Inaktiv", value: "false" }] },
  ];

  const columns: Column<EmployeeRow>[] = [
    {
      key: "lastName", header: "Name", sortable: true,
      cell: (r) => (
        <div className="flex items-center gap-2">
          {r.color && <span className="h-3 w-3 rounded-full" style={{ background: r.color }} />}
          <span className="font-medium">{r.lastName}, {r.firstName}</span>
        </div>
      ),
    },
    { key: "type", header: "Typ", sortable: true, cell: (r) => <Badge variant="secondary">{EMPLOYEE_TYPE_LABEL[r.type] ?? r.type}</Badge> },
    { key: "locationName", header: "Standort", cell: (r) => r.locationName ?? <span className="text-muted-foreground">—</span> },
    { key: "weeklyHoursTarget", header: "Std/Woche", sortable: true, cell: (r) => `${r.weeklyHoursTarget ?? 0}` },
    { key: "qualificationCount", header: "Qual.", cell: (r) => `${r.qualificationCount}` },
    { key: "active", header: "Status", cell: (r) => <Badge variant={r.active ? "success" : "secondary"}>{r.active ? "Aktiv" : "Inaktiv"}</Badge> },
  ];

  if (canManage) {
    columns.push({
      key: "actions", header: "", className: "text-right w-40",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <Button variant="outline" size="sm" disabled={busyId === r.id} onClick={() => edit(r)}>{busyId === r.id ? "…" : "Bearbeiten"}</Button>
          <Button variant="ghost" size="sm" onClick={() => toggleActive(r)}>{r.active ? "Deaktiv." : "Aktiv."}</Button>
          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => remove(r)}>Löschen</Button>
        </div>
      ),
    });
  }

  return (
    <>
      {canManage && (
        <div className="mb-3 flex justify-end">
          <Button onClick={openNew}>Neuer Mitarbeiter</Button>
        </div>
      )}
      <DataTable<EmployeeRow>
        columns={columns}
        rowKey={(r) => r.id}
        searchPlaceholder="Name suchen…"
        exportPath="/api/export/employees"
        filters={filters}
        rows={props.rows} total={props.total} page={props.page} pageSize={props.pageSize}
        totalPages={props.totalPages} sort={props.sort} dir={props.dir} search={props.search}
        activeFilters={props.activeFilters}
      />
      {canManage && (
        <EmployeeDialog open={dialogOpen} onOpenChange={setDialogOpen} master={master} initial={editing} />
      )}
    </>
  );
}
