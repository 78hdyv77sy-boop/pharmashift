import "server-only";
import { prisma } from "@/lib/prisma";
import { dateAtUTC, addDays, mondayOf } from "@/lib/domain/dates";
import { effectiveAvailability, type AvailabilityRule } from "@/lib/domain/availability-types";
import { findHardConflicts, type SolverShift, type SolverEmployee } from "@/lib/domain/solver";
import type { WeekConflict } from "@/lib/domain/solver-types";

// Gemeinsame Daten-Quelle für Solver UND Auto-Umbuchung: baut aus der DB
// dieselben SolverShift/SolverEmployee-Strukturen (eine Wahrheit, keine Doppelung).

export interface SolverInputs {
  solverShifts: SolverShift[];
  solverEmployees: SolverEmployee[];
  nameOf: Map<string, string>;
}

export async function buildSolverInputs(orgId: string, locationId: string, week: string): Promise<SolverInputs | null> {
  const weekStart = mondayOf(week);
  const start = dateAtUTC(weekStart);
  const end = dateAtUTC(addDays(weekStart, 7));

  const loc = await prisma.location.findFirst({ where: { id: locationId, orgId }, select: { id: true } });
  if (!loc) return null;

  const [shifts, employees, absences, availabilities] = await Promise.all([
    prisma.shift.findMany({
      where: { orgId, locationId, deletedAt: null, date: { gte: start, lt: end } },
      include: { assignments: true },
    }),
    prisma.employee.findMany({ where: { orgId, deletedAt: null, active: true } }),
    prisma.absence.findMany({
      where: { status: "APPROVED", employee: { orgId }, startDate: { lt: end }, endDate: { gte: start } },
    }),
    prisma.availability.findMany({
      where: { employee: { orgId, deletedAt: null, active: true } },
      select: { employeeId: true, weekday: true, date: true, type: true, recurring: true },
    }),
  ]);

  const days: string[] = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const absentBy = new Map<string, Set<string>>();
  for (const a of absences) {
    for (const day of days) {
      const d = dateAtUTC(day);
      if (a.startDate <= d && a.endDate >= d) {
        const set = absentBy.get(a.employeeId) ?? new Set<string>();
        set.add(day);
        absentBy.set(a.employeeId, set);
      }
    }
  }

  const rulesBy = new Map<string, AvailabilityRule[]>();
  for (const av of availabilities) {
    const arr = rulesBy.get(av.employeeId) ?? [];
    arr.push({ weekday: av.weekday, date: av.date ? av.date.toISOString().slice(0, 10) : null, type: av.type, recurring: av.recurring });
    rulesBy.set(av.employeeId, arr);
  }

  const solverEmployees: SolverEmployee[] = employees.map((e) => {
    const unavailable = new Set<string>();
    const preferred = new Set<string>();
    const rules = rulesBy.get(e.id) ?? [];
    for (const day of days) {
      const eff = effectiveAvailability(rules, day, dateAtUTC(day).getUTCDay());
      if (eff === "UNAVAILABLE") unavailable.add(day);
      if (eff === "PREFERRED") preferred.add(day);
    }
    return {
      id: e.id,
      name: `${e.firstName} ${e.lastName}`,
      type: e.type,
      weeklyHoursTarget: e.weeklyHoursTarget,
      absentDates: absentBy.get(e.id) ?? new Set(),
      unavailableDates: unavailable,
      preferredDates: preferred,
      nightWorkRestricted: e.nightWorkRestricted,
      presetHours: 0, // Bestand DIESER Woche steckt bereits in assignedEmployeeIds
    };
  });

  const solverShifts: SolverShift[] = shifts.map((s) => ({
    id: s.id,
    date: s.date.toISOString().slice(0, 10),
    startTime: s.startTime,
    endTime: s.endTime,
    requiredHeadcount: s.requiredHeadcount,
    requiredRoles: (s.requiredRoles ?? null) as Record<string, number> | null,
    assignedEmployeeIds: s.assignments.map((a) => a.employeeId),
  }));

  const nameOf = new Map(solverEmployees.map((e) => [e.id, e.name] as const));
  return { solverShifts, solverEmployees, nameOf };
}


// AZG-Konflikte der Woche (für Banner & Auto-Umbuchung), org-gescoped.
export async function findWeekConflicts(orgId: string, locationId: string, week: string): Promise<WeekConflict[]> {
  const inputs = await buildSolverInputs(orgId, locationId, week);
  if (!inputs) return [];
  const { solverShifts, solverEmployees, nameOf } = inputs;
  const shiftOf = new Map(solverShifts.map((s) => [s.id, s] as const));
  return findHardConflicts(solverShifts, solverEmployees).map((c) => {
    const s = shiftOf.get(c.shiftId);
    return {
      shiftId: c.shiftId,
      employeeId: c.employeeId,
      employeeName: nameOf.get(c.employeeId) ?? c.employeeId,
      date: s ? s.date : "",
      time: s ? `${s.startTime}–${s.endTime}` : "",
      reason: c.reason,
    };
  });
}
