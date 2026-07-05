import { prisma } from "@/lib/prisma";
import { type ListParams, type ListResult, paginate, computeTotalPages } from "@/lib/list/query";
import type { Prisma } from "@prisma/client";

export interface AuditRow {
  id: string;
  createdAt: string; // "DD.MM.YYYY HH:MM"
  actor: string;
  action: string;
  entity: string | null;
  entityId: string | null;
}

function fmt(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export async function listAuditLogs(orgId: string, p: ListParams): Promise<ListResult<AuditRow>> {
  const where: Prisma.AuditLogWhereInput = {
    orgId,
    ...(p.search
      ? { OR: [{ action: { contains: p.search } }, { entity: { contains: p.search } }] }
      : {}),
    ...(p.filters.entity ? { entity: p.filters.entity } : {}),
  };

  const { skip, take } = paginate(p);
  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: p.dir === "asc" ? "asc" : "desc" }, skip, take, include: { actor: true } }),
    prisma.auditLog.count({ where }),
  ]);

  const rows: AuditRow[] = logs.map((l) => ({
    id: l.id,
    createdAt: fmt(l.createdAt),
    actor: l.actor?.name ?? l.actor?.email ?? "System",
    action: l.action,
    entity: l.entity,
    entityId: l.entityId,
  }));

  return { rows, total, page: p.page, pageSize: p.pageSize, totalPages: computeTotalPages(total, p.pageSize) };
}
