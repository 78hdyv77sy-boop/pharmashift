import { prisma } from "@/lib/prisma";
import { dateAtUTC, addDays, weekDays } from "@/lib/domain/dates";
import { effectiveAvailability } from "@/lib/domain/availability-types";

export interface WeekAssignment {
  employeeId: string;
  name: string;
  color: string | null;
  status: string;
  type: string; // AI-P3: für Rollenabdeckungs-Anzeige (Apothekerpflicht)
}
export interface WeekShift {
  id: string;
  version: number; // Arch-P1: Optimistic Locking
  requiredRoles: Record<string, number> | null; // AI-P3: Rollen-Pflicht (z.B. Apotheker)
  date: string; // ISO YYYY-MM-DD
  startTime: string;
  endTime: string;
  requiredHeadcount: number;
  notes: string | null;
  assignments: WeekAssignment[];
}
export interface WeekEmployee {
  id: string;
  name: string;
  type: string;
  color: string | null;
  weeklyHoursTarget: number | null; // UX-P2 U8a: Soll-Stunden für Wochen-Footer
}
export interface WeekAbsence {
  employeeId: string;
  name: string;
  startDate: string;
  endDate: string;
  type: string;
  status: string;
}
export interface WeekData {
  shifts: WeekShift[];
  employees: WeekEmployee[];
  absences: WeekAbsence[];
  unavailable: { employeeId: string; date: string }[];
  published: boolean;
  drifted: boolean; // UX2-P1 N9: seit Veröffentlichung geändert
}

export async function getWeekData(orgId: string, locationId: string, weekStartISO: string): Promise<WeekData> {
  const start = dateAtUTC(weekStartISO);
  const end = dateAtUTC(addDays(weekStartISO, 7));

  const publishedPlan = await prisma.shiftPlan.findFirst({
    where: { orgId, locationId, periodStart: start, status: "PUBLISHED" },
    select: { id: true, updatedAt: true },
  });

  const [shifts, employees, absencesRaw, availabilitiesRaw] = await Promise.all([
    prisma.shift.findMany({
      where: { orgId, locationId, deletedAt: null, date: { gte: start, lt: end } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      include: { assignments: { include: { employee: true } } },
    }),
    prisma.employee.findMany({
      where: { orgId, deletedAt: null, active: true, OR: [{ locationId }, { locationId: null }] },
      orderBy: { lastName: "asc" },
      select: { id: true, firstName: true, lastName: true, type: true, color: true, weeklyHoursTarget: true },
    }),
    prisma.absence.findMany({
      where: {
        employee: { orgId },
        startDate: { lt: end },
        endDate: { gte: start },
      },
      include: { employee: true },
    }),
    prisma.availability.findMany({
      where: { employee: { orgId, deletedAt: null, active: true } },
      select: { employeeId: true, weekday: true, date: true, type: true, recurring: true },
    }),
  ]);

  // "nicht verfügbar"-Marker für die 7 Tage berechnen
  const rulesByEmp = new Map<string, { weekday: number | null; date: string | null; type: string; recurring: boolean }[]>();
  for (const a of availabilitiesRaw) {
    const arr = rulesByEmp.get(a.employeeId) ?? [];
    arr.push({ weekday: a.weekday, date: a.date ? a.date.toISOString().slice(0, 10) : null, type: a.type, recurring: a.recurring });
    rulesByEmp.set(a.employeeId, arr);
  }
  const unavailable: { employeeId: string; date: string }[] = [];
  for (const day of weekDays(weekStartISO)) {
    const wd = dateAtUTC(day).getUTCDay();
    for (const [empId, rules] of rulesByEmp.entries()) {
      if (effectiveAvailability(rules, day, wd) === "UNAVAILABLE") unavailable.push({ employeeId: empId, date: day });
    }
  }

  return {
    shifts: shifts.map((s) => ({
      id: s.id,
      date: s.date.toISOString().slice(0, 10),
      startTime: s.startTime,
      endTime: s.endTime,
      requiredHeadcount: s.requiredHeadcount,
      notes: s.notes,
      version: s.version,
      requiredRoles: (s.requiredRoles ?? null) as Record<string, number> | null,
      assignments: s.assignments.map((a) => ({
        type: a.employee.type,
        employeeId: a.employeeId,
        name: `${a.employee.firstName} ${a.employee.lastName}`,
        color: a.employee.color,
        status: a.status,
      })),
    })),
    employees: employees.map((e) => ({
      weeklyHoursTarget: e.weeklyHoursTarget,
      id: e.id,
      name: `${e.firstName} ${e.lastName}`,
      type: e.type,
      color: e.color,
    })),
    absences: absencesRaw.map((a) => ({
      employeeId: a.employeeId,
      name: `${a.employee.firstName} ${a.employee.lastName}`,
      startDate: a.startDate.toISOString().slice(0, 10),
      endDate: a.endDate.toISOString().slice(0, 10),
      type: a.type,
      status: a.status,
    })),
    published: !!publishedPlan,
    drifted: !!publishedPlan && shifts.some((sh) => sh.updatedAt > publishedPlan.updatedAt),
    unavailable,
  };
}
