import { prisma } from "@/lib/prisma";
import {
  type ListParams,
  type ListResult,
  paginate,
  computeTotalPages,
} from "@/lib/list/query";
import type { Prisma } from "@prisma/client";
import type { AbsenceRow } from "@/lib/domain/absence-types";

export { ABSENCE_TYPES, ABSENCE_TYPE_LABEL, ABSENCE_STATUS_LABEL } from "@/lib/domain/absence-types";
export type { AbsenceRow } from "@/lib/domain/absence-types";

export async function listAbsences(orgId: string, p: ListParams): Promise<ListResult<AbsenceRow>> {
  const where: Prisma.AbsenceWhereInput = {
    employee: {
      orgId,
      ...(p.search ? { OR: [{ firstName: { contains: p.search } }, { lastName: { contains: p.search } }] } : {}),
    },
    ...(p.filters.status ? { status: p.filters.status as "REQUESTED" | "APPROVED" | "DECLINED" } : {}),
    ...(p.filters.type ? { type: p.filters.type as "VACATION" | "SICK" | "TRAINING" | "OTHER" } : {}),
  };

  const { skip, take } = paginate(p);
  const orderBy: Prisma.AbsenceOrderByWithRelationInput =
    p.sort === "startDate" ? { startDate: p.dir } : { startDate: "desc" };

  const [absences, total] = await Promise.all([
    prisma.absence.findMany({ where, orderBy, skip, take, include: { employee: true } }),
    prisma.absence.count({ where }),
  ]);

  const rows: AbsenceRow[] = absences.map((a) => ({
    id: a.id,
    employeeId: a.employeeId,
    employeeName: `${a.employee.firstName} ${a.employee.lastName}`,
    startDate: a.startDate.toISOString().slice(0, 10),
    endDate: a.endDate.toISOString().slice(0, 10),
    type: a.type,
    status: a.status,
    note: a.note,
  }));

  return { rows, total, page: p.page, pageSize: p.pageSize, totalPages: computeTotalPages(total, p.pageSize) };
}
