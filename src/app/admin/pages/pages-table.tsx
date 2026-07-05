"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column, type FilterDef } from "@/components/data-table/data-table";
import { deletePage } from "./actions";
import type { PageRow } from "@/lib/cms/pages";
import { useToast } from "@/components/ui/toaster";
import { useConfirm } from "@/components/ui/confirm-dialog";

interface Props {
  rows: PageRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  sort: string | null;
  dir: "asc" | "desc";
  search: string;
  activeFilters: Record<string, string>;
}

export function PagesTable(props: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const confirmDialog = useConfirm();

  async function onDelete(row: PageRow) {
    if (!(await confirmDialog({ title: `Seite „${row.title}" löschen?`, confirmText: "Löschen", destructive: true }))) return;
    const res = await deletePage(row.id);
    if (!res.ok) toast(res.error ?? "Fehler", "error");
    else router.refresh();
  }

  const filters: FilterDef[] = [
    { key: "status", label: "Status", options: [
      { label: "Entwurf", value: "DRAFT" },
      { label: "Veröffentlicht", value: "PUBLISHED" },
    ] },
  ];

  const columns: Column<PageRow>[] = [
    {
      key: "title",
      header: "Titel",
      sortable: true,
      cell: (r) => (
        <Link href={`/admin/pages/${r.id}`} className="font-medium hover:underline">{r.title}</Link>
      ),
    },
    { key: "slug", header: "Slug", sortable: true, cell: (r) => <code className="text-xs text-muted-foreground">/{r.slug}</code> },
    {
      key: "status",
      header: "Status",
      sortable: true,
      cell: (r) => <Badge variant={r.status === "PUBLISHED" ? "success" : "secondary"}>{r.status === "PUBLISHED" ? "Veröffentlicht" : "Entwurf"}</Badge>,
    },
    { key: "blockCount", header: "Blöcke", cell: (r) => `${r.blockCount}` },
    { key: "updatedAt", header: "Geändert", sortable: true, cell: (r) => new Date(r.updatedAt).toLocaleDateString("de-DE") },
    {
      key: "actions",
      header: "",
      className: "text-right w-40",
      cell: (r) => (
        <div className="flex justify-end gap-2">
          <Button asChild variant="outline" size="sm"><Link href={`/admin/pages/${r.id}`}>Bearbeiten</Link></Button>
          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => onDelete(r)}>Löschen</Button>
        </div>
      ),
    },
  ];

  return (
    <DataTable<PageRow>
      columns={columns}
      rowKey={(r) => r.id}
      searchPlaceholder="Titel oder Slug suchen…"
      filters={filters}
      {...props}
    />
  );
}
