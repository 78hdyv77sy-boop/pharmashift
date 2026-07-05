import { prisma } from "@/lib/prisma";
import { dateAtUTC, addDays, mondayOf, weekdayShort, formatDayLabel } from "@/lib/domain/dates";
import { effectiveAvailability, type AvailabilityRule } from "@/lib/domain/availability-types";

export interface PlanShiftProposal {
  date: string; // ISO
  dayLabel: string; // "Di 11.3."
  startTime: string;
  endTime: string;
  requiredHeadcount: number;
  notes: string | null;
  assignedEmployeeIds: string[];
  assignedNames: string[];
}
export interface PlanProposal {
  templateWeekStart: string | null;
  shifts: PlanShiftProposal[];
  warnings: string[];
}

/**
 * Erzeugt einen Wochenplan-Vorschlag für die Zielwoche auf Basis der jüngsten
 * vergangenen Woche mit Schichten an diesem Standort. Übernimmt Zeiten/Bedarf
 * und Zuweisungen, lässt abwesende/inaktive Mitarbeiter aber aus.
 * Schreibt NICHTS in die DB – reiner Vorschlag.
 */
export async function generateWeekProposal(
  orgId: string,
  locationId: string,
  targetWeekStartISO: string,
): Promise<PlanProposal> {
  const targetMonday = mondayOf(targetWeekStartISO);

  // jüngste Vorwoche mit Schichten finden (bis zu 8 Wochen zurück)
  let templateMonday: string | null = null;
  for (let i = 1; i <= 8; i++) {
    const candidate = addDays(targetMonday, -7 * i);
    const count = await prisma.shift.count({
      where: {
        orgId, locationId, deletedAt: null,
        date: { gte: dateAtUTC(candidate), lt: dateAtUTC(addDays(candidate, 7)) },
      },
    });
    if (count > 0) { templateMonday = candidate; break; }
  }

  if (!templateMonday) {
    return { templateWeekStart: null, shifts: [], warnings: ["Keine vergangene Woche mit Schichten gefunden – bitte manuell anlegen oder zuerst eine Vorlage erstellen."] };
  }

  const [templateShifts, absences, activeEmployees, availabilities] = await Promise.all([
    prisma.shift.findMany({
      where: { orgId, locationId, deletedAt: null, date: { gte: dateAtUTC(templateMonday), lt: dateAtUTC(addDays(templateMonday, 7)) } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      include: { assignments: { include: { employee: true } } },
    }),
    prisma.absence.findMany({
      where: { status: "APPROVED", employee: { orgId }, startDate: { lt: dateAtUTC(addDays(targetMonday, 7)) }, endDate: { gte: dateAtUTC(targetMonday) } },
      include: { employee: true },
    }),
    prisma.employee.findMany({ where: { orgId, deletedAt: null, active: true }, select: { id: true } }),
    prisma.availability.findMany({
      where: { employee: { orgId, deletedAt: null, active: true } },
      select: { employeeId: true, weekday: true, date: true, type: true, recurring: true },
    }),
  ]);

  const rulesByEmp = new Map<string, AvailabilityRule[]>();
  for (const a of availabilities) {
    const arr = rulesByEmp.get(a.employeeId) ?? [];
    arr.push({ weekday: a.weekday, date: a.date ? a.date.toISOString().slice(0, 10) : null, type: a.type, recurring: a.recurring });
    rulesByEmp.set(a.employeeId, arr);
  }
  const unavailableOn = (employeeId: string, dayISO: string) =>
    effectiveAvailability(rulesByEmp.get(employeeId) ?? [], dayISO, dateAtUTC(dayISO).getUTCDay()) === "UNAVAILABLE";

  const activeIds = new Set(activeEmployees.map((e) => e.id));
  const absentOn = (employeeId: string, dayISO: string) =>
    absences.some((a) => a.employeeId === employeeId && a.startDate.toISOString().slice(0, 10) <= dayISO && a.endDate.toISOString().slice(0, 10) >= dayISO);

  const warnings: string[] = [];
  const shifts: PlanShiftProposal[] = [];

  for (const ts of templateShifts) {
    const tsDate = ts.date.toISOString().slice(0, 10);
    const offset = Math.round((dateAtUTC(tsDate).getTime() - dateAtUTC(templateMonday).getTime()) / 86_400_000);
    const targetDate = addDays(targetMonday, offset);

    const assignedIds: string[] = [];
    const assignedNames: string[] = [];
    for (const a of ts.assignments) {
      const name = `${a.employee.firstName} ${a.employee.lastName}`;
      if (!activeIds.has(a.employeeId)) {
        warnings.push(`${weekdayShort(targetDate)} ${formatDayLabel(targetDate)}: ${name} inaktiv – nicht übernommen.`);
        continue;
      }
      if (absentOn(a.employeeId, targetDate)) {
        warnings.push(`${weekdayShort(targetDate)} ${formatDayLabel(targetDate)}: ${name} abwesend – offen gelassen.`);
        continue;
      }
      if (unavailableOn(a.employeeId, targetDate)) {
        warnings.push(`${weekdayShort(targetDate)} ${formatDayLabel(targetDate)}: ${name} nicht verfügbar – offen gelassen.`);
        continue;
      }
      assignedIds.push(a.employeeId);
      assignedNames.push(name);
    }

    if (assignedIds.length < ts.requiredHeadcount) {
      warnings.push(`${weekdayShort(targetDate)} ${formatDayLabel(targetDate)} ${ts.startTime}: unterbesetzt (${assignedIds.length}/${ts.requiredHeadcount}).`);
    }

    shifts.push({
      date: targetDate,
      dayLabel: `${weekdayShort(targetDate)} ${formatDayLabel(targetDate)}`,
      startTime: ts.startTime,
      endTime: ts.endTime,
      requiredHeadcount: ts.requiredHeadcount,
      notes: ts.notes,
      assignedEmployeeIds: assignedIds,
      assignedNames,
    });
  }

  return { templateWeekStart: templateMonday, shifts, warnings };
}
