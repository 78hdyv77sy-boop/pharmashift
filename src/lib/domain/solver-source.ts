import "server-only";
import { prisma } from "@/lib/prisma";
import { dateAtUTC, addDays, mondayOf } from "@/lib/domain/dates";
import { rawScore, normalizeScores, isEveningEnd, isWeekendDow, type FairnessCounts } from "@/lib/domain/fairness";
import { austrianHolidays } from "@/lib/domain/nightduty-tariffs";
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

  // Fairness-Engine aktiv (v0.63): 90-Tage-Belastung je Person, normalisiert
  // je Rolle (0..100) — fließt als Tie-Breaker in die Kandidatenwahl ein.
  const from90 = dateAtUTC(addDays(weekStart, -90));
  const [pastAsgs, pastNights] = await Promise.all([
    prisma.shiftAssignment.findMany({
      where: { shift: { orgId, deletedAt: null, date: { gte: from90, lt: start } } },
      select: { employeeId: true, shift: { select: { date: true, endTime: true } } },
    }),
    prisma.nightDuty.findMany({
      where: { orgId, date: { gte: from90, lt: start } },
      select: { employeeId: true },
    }),
  ]);
  const fCounts = new Map<string, FairnessCounts>();
  const fEnsure = (id: string) => {
    let c = fCounts.get(id);
    if (!c) { c = { night: 0, holiday: 0, weekend: 0, evening: 0 }; fCounts.set(id, c); }
    return c;
  };
  for (const nd of pastNights) fEnsure(nd.employeeId).night++;
  const holiYears = new Map<number, Set<string>>();
  for (const a of pastAsgs) {
    const d = a.shift.date;
    const y = d.getUTCFullYear();
    if (!holiYears.has(y)) holiYears.set(y, austrianHolidays(y));
    const c = fEnsure(a.employeeId);
    if (isWeekendDow(d.getUTCDay())) c.weekend++;
    if (isEveningEnd(a.shift.endTime)) c.evening++;
    if (holiYears.get(y)!.has(d.toISOString().slice(0, 10))) c.holiday++;
  }
  const byType = new Map<string, { id: string; raw: number }[]>();
  for (const e of employees) {
    const raw = rawScore(fCounts.get(e.id) ?? { night: 0, holiday: 0, weekend: 0, evening: 0 });
    const arr = byType.get(e.type) ?? [];
    arr.push({ id: e.id, raw });
    byType.set(e.type, arr);
  }
  const fScore = new Map<string, number>();
  for (const arr of byType.values()) {
    const norm = normalizeScores(arr.map((x) => x.raw));
    arr.forEach((x, i) => fScore.set(x.id, norm[i]));
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
      fairnessScore: fScore.get(e.id) ?? 0,
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
