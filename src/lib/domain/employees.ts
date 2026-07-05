import { prisma } from "@/lib/prisma";
import {
  type ListParams,
  type ListResult,
  paginate,
  computeTotalPages,
  buildOrderBy,
} from "@/lib/list/query";
import type { Prisma } from "@prisma/client";
import { EMPLOYEE_TYPES, type EmployeeTypeKey, type EmployeeRow } from "@/lib/domain/employee-types";

export { EMPLOYEE_TYPES, EMPLOYEE_TYPE_LABEL } from "@/lib/domain/employee-types";
export type { EmployeeTypeKey, EmployeeRow } from "@/lib/domain/employee-types";

export async function listEmployees(orgId: string, p: ListParams): Promise<ListResult<EmployeeRow>> {
  const where: Prisma.EmployeeWhereInput = {
    orgId,
    deletedAt: null,
    ...(p.filters.type ? { type: p.filters.type as EmployeeTypeKey } : {}),
    ...(p.filters.locationId ? { locationId: p.filters.locationId } : {}),
    ...(p.filters.active ? { active: p.filters.active === "true" } : {}),
    ...(p.search
      ? { OR: [{ firstName: { contains: p.search } }, { lastName: { contains: p.search } }] }
      : {}),
  };

  const orderBy = buildOrderBy(
    p,
    { lastName: "lastName", firstName: "firstName", type: "type", weeklyHoursTarget: "weeklyHoursTarget" },
    { lastName: "asc" },
  ) as Prisma.EmployeeOrderByWithRelationInput;
  const { skip, take } = paginate(p);

  const [employees, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      orderBy,
      skip,
      take,
      include: { location: true, _count: { select: { qualifications: true } } },
    }),
    prisma.employee.count({ where }),
  ]);

  const rows: EmployeeRow[] = employees.map((e) => ({
    id: e.id,
    firstName: e.firstName,
    lastName: e.lastName,
    type: e.type,
    locationName: e.location?.name ?? null,
    weeklyHoursTarget: e.weeklyHoursTarget,
    qualificationCount: e._count.qualifications,
    active: e.active,
    color: e.color,
  }));

  return { rows, total, page: p.page, pageSize: p.pageSize, totalPages: computeTotalPages(total, p.pageSize) };
}

export async function getEmployee(orgId: string, employeeId: string) {
  const e = await prisma.employee.findFirst({
    where: { id: employeeId, orgId },
    include: { qualifications: true, responsibilities: true },
  });
  if (!e) return null;
  return {
    id: e.id,
    firstName: e.firstName,
    lastName: e.lastName,
    type: e.type,
    locationId: e.locationId,
    weeklyHoursTarget: e.weeklyHoursTarget,
    color: e.color,
    active: e.active,
    qualificationIds: e.qualifications.map((q) => q.qualificationId),
    responsibilityIds: e.responsibilities.map((r) => r.responsibilityId),
  };
}

/** Stammdaten für Formular-Selects (Standorte, Qualifikationen, Zuständigkeiten). */
export async function getOrgMasterData(orgId: string) {
  const [locations, qualifications, responsibilities] = await Promise.all([
    prisma.location.findMany({ where: { orgId, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.qualification.findMany({ where: { orgId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.responsibility.findMany({ where: { orgId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return { locations, qualifications, responsibilities };
}
