import { prisma } from "@/lib/prisma";
import { dateAtUTC, addDays } from "@/lib/domain/dates";
import { EMPLOYEE_TYPE_LABEL } from "@/lib/domain/employee-types";
import { effectiveAvailability, type AvailabilityRule } from "@/lib/domain/availability-types";

export interface ReplacementCandidate {
  id: string;
  name: string;
  type: string;
  typeLabel: string;
  score: number;
  reasons: string[];
}
export interface AffectedShift {
  shiftId: string;
  startTime: string;
  endTime: string;
  candidates: ReplacementCandidate[];
}
export interface ReplacementResult {
  employeeName: string;
  date: string;
  affected: AffectedShift[];
  note?: string;
}

/**
 * Sucht Ersatz für eine:n Mitarbeiter:in an einem Datum: betrachtet die
 * Schichten dieses Tages, denen die Person zugewiesen ist, und rankt mögliche
 * Ersatzkräfte (aktiv, nicht abwesend, nicht bereits in der Schicht).
 */
export async function findReplacements(orgId: string, employeeId: string, dateISO: string): Promise<ReplacementResult> {
  const absent = await prisma.employee.findFirst({
    where: { id: employeeId, orgId },
    include: { qualifications: true },
  });
  if (!absent) return { employeeName: "?", date: dateISO, affected: [], note: "Mitarbeiter nicht gefunden." };

  const dayStart = dateAtUTC(dateISO);
  const dayEnd = dateAtUTC(addDays(dateISO, 1));

  // Schichten an dem Tag, in denen die Person eingeteilt ist
  const shiftsWithEmp = await prisma.shift.findMany({
    where: { orgId, deletedAt: null, date: { gte: dayStart, lt: dayEnd }, assignments: { some: { employeeId } } },
    orderBy: { startTime: "asc" },
    include: { assignments: true },
  });

  if (shiftsWithEmp.length === 0) {
    return { employeeName: `${absent.firstName} ${absent.lastName}`, date: dateISO, affected: [], note: "Keine Schichten dieser Person an diesem Tag." };
  }

  // Pool: aktive Mitarbeiter (außer der abwesenden) mit Qualifikationen
  const pool = await prisma.employee.findMany({
    where: { orgId, deletedAt: null, active: true, NOT: { id: employeeId } },
    include: { qualifications: true },
  });

  // genehmigte Abwesenheiten an dem Tag
  const absentToday = new Set(
    (await prisma.absence.findMany({
      where: { status: "APPROVED", employee: { orgId }, startDate: { lte: dayStart }, endDate: { gte: dayStart } },
      select: { employeeId: true },
    })).map((a) => a.employeeId),
  );

  // wer ist an dem Tag schon irgendwo eingeteilt?
  const busyToday = new Map<string, number>();
  const allShiftsToday = await prisma.shift.findMany({
    where: { orgId, deletedAt: null, date: { gte: dayStart, lt: dayEnd } },
    include: { assignments: true },
  });
  for (const s of allShiftsToday) for (const a of s.assignments) busyToday.set(a.employeeId, (busyToday.get(a.employeeId) ?? 0) + 1);

  // Verfügbarkeitsregeln am Tag auswerten
  const availabilities = await prisma.availability.findMany({
    where: { employee: { orgId, deletedAt: null, active: true } },
    select: { employeeId: true, weekday: true, date: true, type: true, recurring: true },
  });
  const rulesByEmp = new Map<string, AvailabilityRule[]>();
  for (const a of availabilities) {
    const arr = rulesByEmp.get(a.employeeId) ?? [];
    arr.push({ weekday: a.weekday, date: a.date ? a.date.toISOString().slice(0, 10) : null, type: a.type, recurring: a.recurring });
    rulesByEmp.set(a.employeeId, arr);
  }
  const dayWeekday = dayStart.getUTCDay();
  const availOf = (eid: string) => effectiveAvailability(rulesByEmp.get(eid) ?? [], dateISO, dayWeekday);

  const absentQuals = new Set(absent.qualifications.map((q) => q.qualificationId));

  const affected: AffectedShift[] = shiftsWithEmp.map((shift) => {
    const assignedHere = new Set(shift.assignments.map((a) => a.employeeId));
    const candidates: ReplacementCandidate[] = pool
      .filter((c) => !assignedHere.has(c.id) && !absentToday.has(c.id) && availOf(c.id) !== "UNAVAILABLE")
      .map((c) => {
        let score = 0;
        const reasons: string[] = [];
        if (c.type === absent.type) { score += 3; reasons.push(`gleiche Rolle (${EMPLOYEE_TYPE_LABEL[c.type] ?? c.type})`); }
        if (availOf(c.id) === "PREFERRED") { score += 2; reasons.push("bevorzugt verfügbar"); }
        if (!busyToday.has(c.id)) { score += 2; reasons.push("an dem Tag frei eingeplant"); }
        const shared = c.qualifications.filter((q) => absentQuals.has(q.qualificationId)).length;
        if (shared > 0) { score += shared; reasons.push(`${shared} passende Qualifikation(en)`); }
        return { id: c.id, name: `${c.firstName} ${c.lastName}`, type: c.type, typeLabel: EMPLOYEE_TYPE_LABEL[c.type] ?? c.type, score, reasons };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    return { shiftId: shift.id, startTime: shift.startTime, endTime: shift.endTime, candidates };
  });

  return { employeeName: `${absent.firstName} ${absent.lastName}`, date: dateISO, affected };
}
