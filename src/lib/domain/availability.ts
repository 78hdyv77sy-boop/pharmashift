import { prisma } from "@/lib/prisma";
import type { AvailabilityRow } from "@/lib/domain/availability-types";

export { AVAILABILITY_TYPES, AVAILABILITY_TYPE_LABEL, WEEKDAY_LABEL } from "@/lib/domain/availability-types";
export type { AvailabilityRow } from "@/lib/domain/availability-types";

export async function getEmployeeAvailabilities(orgId: string, employeeId: string): Promise<AvailabilityRow[]> {
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, orgId }, select: { id: true } });
  if (!employee) return [];

  const entries = await prisma.availability.findMany({
    where: { employeeId },
    orderBy: [{ recurring: "desc" }, { weekday: "asc" }, { date: "asc" }, { startTime: "asc" }],
  });

  return entries.map((a) => ({
    id: a.id,
    weekday: a.weekday,
    date: a.date ? a.date.toISOString().slice(0, 10) : null,
    startTime: a.startTime,
    endTime: a.endTime,
    type: a.type,
    recurring: a.recurring,
  }));
}
