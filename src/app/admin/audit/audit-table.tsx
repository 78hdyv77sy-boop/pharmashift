"use client";

import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/data-table/data-table";
import type { AuditRow } from "@/lib/domain/audit";

interface Props {
  rows: AuditRow[];
  total: number; page: number; pageSize: number; totalPages: number;
  sort: string | null; dir: "asc" | "desc"; search: string; activeFilters: Record<string, string>;
}

export function AuditTable(props: Props) {
  const columns: Column<AuditRow>[] = [
    { key: "createdAt", header: "Zeitpunkt", sortable: true, className: "whitespace-nowrap", cell: (r) => r.createdAt },
    { key: "actor", header: "Aktor", cell: (r) => <span className="font-medium">{r.actor}</span> },
    { key: "action", header: "Aktion", cell: (r) => <Badge variant="secondary">{r.action}</Badge> },
    { key: "entity", header: "Objekt", cell: (r) => r.entity ?? <span className="text-muted-foreground">—</span> },
    { key: "entityId", header: "ID", className: "text-xs text-muted-foreground", cell: (r) => r.entityId ?? "—" },
  ];

  return (
    <DataTable<AuditRow>
      columns={columns}
      rowKey={(r) => r.id}
      searchPlaceholder="Aktion oder Objekt suchen…"
      rows={props.rows}
      total={props.total}
      page={props.page}
      pageSize={props.pageSize}
      totalPages={props.totalPages}
      sort={props.sort}
      dir={props.dir}
      search={props.search}
      activeFilters={props.activeFilters}
    />
  );
}
