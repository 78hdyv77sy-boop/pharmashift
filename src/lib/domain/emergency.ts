import { prisma } from "@/lib/prisma";
import { toISODate, dateAtUTC } from "@/lib/domain/dates";

export interface EmergencyDutyEntry { id: string; employeeId: string | null; employeeName: string | null; }
export interface EmergencyData {
  days: string[]; // alle Tage des Monats als ISO
  duties: Record<string, EmergencyDutyEntry>; // dateISO -> Eintrag
  employees: { id: string; name: string }[];
}

/** Erster Tag des Monats (ISO) und Anzahl Tage. */
export function monthRange(year: number, month1: number): { firstISO: string; days: string[] } {
  const first = new Date(Date.UTC(year, month1 - 1, 1));
  const days: string[] = [];
  for (let d = new Date(first); d.getUTCMonth() === month1 - 1; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(toISODate(new Date(d)));
  }
  return { firstISO: toISODate(first), days };
}

export async function getEmergencyData(orgId: string, locationId: string, year: number, month1: number): Promise<EmergencyData> {
  const { days } = monthRange(year, month1);
  const start = dateAtUTC(days[0]);
  const end = dateAtUTC(days[days.length - 1]);
  end.setUTCDate(end.getUTCDate() + 1);

  const [duties, employees] = await Promise.all([
    prisma.emergencyDuty.findMany({
      where: { locationId, location: { orgId }, date: { gte: start, lt: end } },
      include: { employee: true },
    }),
    prisma.employee.findMany({
      where: { orgId, deletedAt: null, active: true },
      orderBy: { lastName: "asc" },
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);

  const map: Record<string, EmergencyDutyEntry> = {};
  for (const d of duties) {
    map[d.date.toISOString().slice(0, 10)] = {
      id: d.id,
      employeeId: d.employeeId,
      employeeName: d.employee ? `${d.employee.firstName} ${d.employee.lastName}` : null,
    };
  }

  return { days, duties: map, employees: employees.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}` })) };
}
