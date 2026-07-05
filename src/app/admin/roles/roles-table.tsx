"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { PermissionEditor } from "./permission-editor";
import { loadRolePermissions, deleteRole } from "./actions";
import type { RoleRow } from "@/lib/roles";
import { useToast } from "@/components/ui/toaster";
import { useConfirm } from "@/components/ui/confirm-dialog";

interface Props {
  rows: RoleRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  sort: string | null;
  dir: "asc" | "desc";
  search: string;
}

export function RolesTable(props: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const confirmDialog = useConfirm();
  const [editor, setEditor] = React.useState<{ id: string; name: string; keys: string[] } | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function openEditor(role: RoleRow) {
    setBusyId(role.id);
    const res = await loadRolePermissions(role.id);
    setBusyId(null);
    if (!res.ok) { toast(res.error ?? "Fehler", "error"); return; }
    setEditor({ id: role.id, name: role.name, keys: res.keys ?? [] });
  }

  async function onDelete(role: RoleRow) {
    if (!(await confirmDialog({ title: `Rolle „${role.name}" löschen?`, confirmText: "Löschen", destructive: true }))) return;
    const res = await deleteRole(role.id);
    if (!res.ok) toast(res.error ?? "Fehler", "error");
    else router.refresh();
  }

  const columns: Column<RoleRow>[] = [
    {
      key: "name",
      header: "Rolle",
      sortable: true,
      cell: (r) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{r.name}</span>
          {r.isSystem && <Badge variant="outline">System</Badge>}
        </div>
      ),
    },
    { key: "description", header: "Beschreibung", cell: (r) => r.description ?? <span className="text-muted-foreground">—</span> },
    { key: "permissionCount", header: "Berechtigungen", cell: (r) => `${r.permissionCount}` },
    { key: "memberCount", header: "Mitglieder", cell: (r) => `${r.memberCount}` },
    {
      key: "actions",
      header: "",
      className: "text-right w-48",
      cell: (r) => (
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" disabled={busyId === r.id} onClick={() => openEditor(r)}>
            {busyId === r.id ? "…" : "Berechtigungen"}
          </Button>
          {!r.isSystem && (
            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => onDelete(r)}>
              Löschen
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTable<RoleRow>
        columns={columns}
        rowKey={(r) => r.id}
        searchPlaceholder="Rolle suchen…"
        {...props}
      />
      {editor && (
        <PermissionEditor
          open={!!editor}
          onOpenChange={(o) => !o && setEditor(null)}
          roleId={editor.id}
          roleName={editor.name}
          initial={editor.keys}
        />
      )}
    </>
  );
}
