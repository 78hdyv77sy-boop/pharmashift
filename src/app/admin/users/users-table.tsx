"use client";

import { Badge } from "@/components/ui/badge";
import { DataTable, type Column, type FilterDef } from "@/components/data-table/data-table";
import { RowActions } from "./row-actions";
import type { MemberRow } from "@/lib/users";

interface Props {
  rows: MemberRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  sort: string | null;
  dir: "asc" | "desc";
  search: string;
  activeFilters: Record<string, string>;
  roles: { id: string; name: string }[];
  currentUserId: string;
  canManage: boolean;
}

const statusVariant: Record<string, "success" | "warning" | "secondary"> = {
  ACTIVE: "success",
  INVITED: "warning",
  SUSPENDED: "secondary",
};

export function UsersTable(props: Props) {
  const { roles, currentUserId, canManage } = props;

  const filters: FilterDef[] = [
    {
      key: "status",
      label: "Status",
      options: [
        { label: "Aktiv", value: "ACTIVE" },
        { label: "Eingeladen", value: "INVITED" },
        { label: "Gesperrt", value: "SUSPENDED" },
      ],
    },
  ];

  const columns: Column<MemberRow>[] = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      cell: (r) => (
        <div className="flex flex-col">
          <span className="font-medium">{r.name ?? "—"}</span>
          {r.userId === currentUserId && <span className="text-xs text-muted-foreground">(du)</span>}
        </div>
      ),
    },
    {
      key: "email",
      header: "E-Mail",
      sortable: true,
      cell: (r) => (
        <span className="flex items-center gap-2">
          {r.email}
          {!r.emailVerified && <Badge variant="outline" className="text-amber-700">unbestätigt</Badge>}
        </span>
      ),
    },
    {
      key: "roles",
      header: "Rollen",
      cell: (r) =>
        r.roles.length ? (
          <div className="flex flex-wrap gap-1">
            {r.roles.map((role) => (
              <Badge key={role.id} variant="secondary">{role.name}</Badge>
            ))}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => <Badge variant={statusVariant[r.status] ?? "secondary"}>{r.status}</Badge>,
    },
    {
      key: "createdAt",
      header: "Beigetreten",
      sortable: true,
      cell: (r) => new Date(r.createdAt).toLocaleDateString("de-DE"),
    },
  ];

  if (canManage) {
    columns.push({
      key: "actions",
      header: "",
      className: "w-12 text-right",
      cell: (r) => (
        <RowActions
          member={{ userId: r.userId, status: r.status, roles: r.roles }}
          roles={roles}
          isSelf={r.userId === currentUserId}
        />
      ),
    });
  }

  return (
    <DataTable<MemberRow>
      columns={columns}
      rowKey={(r) => r.userId}
      searchPlaceholder="Name oder E-Mail suchen…"
      exportPath="/api/export/users"
      filters={filters}
      {...props}
    />
  );
}
