import "server-only";
import { prisma } from "@/lib/prisma";
import { dateAtUTC, addDays, mondayOf, todayISO } from "@/lib/domain/dates";
import { EMPLOYEE_TYPE_LABEL } from "@/lib/domain/employee-types";
import { effectiveAvailability, type AvailabilityRule } from "@/lib/domain/availability-types";

// Read-only Tools für den Agent-Loop (AI-P0 / Abschnitt 8.6 V1).
// Regel 8.7 S6: hier finden NIEMALS Writes statt.

export interface ReadTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (orgId: string, input: Record<string, unknown>) => Promise<string>;
}

const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown): string => (typeof v === "string" ? v : "");

async function rulesFor(orgId: string): Promise<Map<string, AvailabilityRule[]>> {
  const availabilities = await prisma.availability.findMany({
    where: { employee: { orgId, deletedAt: null, active: true } },
    select: { employeeId: true, weekday: true, date: true, type: true, recurring: true },
  });
  const map = new Map<string, AvailabilityRule[]>();
  for (const a of availabilities) {
    const arr = map.get(a.employeeId) ?? [];
    arr.push({ weekday: a.weekday, date: a.date ? a.date.toISOString().slice(0, 10) : null, type: a.type, recurring: a.recurring });
    map.set(a.employeeId, arr);
  }
  return map;
}

export const READ_TOOLS: Record<string, ReadTool> = {
  get_week_schedule: {
    name: "get_week_schedule",
    description:
      "Liest den Dienstplan einer Woche an einem Standort: Schichten mit Zeiten, Bedarf und eingeteilten Personen sowie Abwesenheiten in der Woche. Nutze dies, BEVOR du Fragen zum Plan beantwortest oder Aktionen vorschlägst.",
    inputSchema: {
      type: "object",
      properties: {
        locationId: { type: "string", description: "ID des Standorts aus dem Kontext" },
        weekStart: { type: "string", description: "Ein Datum in der Zielwoche, YYYY-MM-DD (wird auf Montag normalisiert)" },
      },
      required: ["locationId", "weekStart"],
    },
    async execute(orgId, input) {
      const locationId = str(input.locationId);
      const ws = dateRe.test(str(input.weekStart)) ? mondayOf(str(input.weekStart)) : mondayOf(todayISO());
      const loc = await prisma.location.findFirst({ where: { id: locationId, orgId }, select: { id: true, name: true } });
      if (!loc) return JSON.stringify({ error: "Standort unbekannt." });

      const start = dateAtUTC(ws);
      const end = dateAtUTC(addDays(ws, 7));
      const [shifts, absences] = await Promise.all([
        prisma.shift.findMany({
          where: { orgId, locationId, deletedAt: null, date: { gte: start, lt: end } },
          orderBy: [{ date: "asc" }, { startTime: "asc" }],
          include: { assignments: { include: { employee: true } } },
          take: 100,
        }),
        prisma.absence.findMany({
          where: { status: "APPROVED", employee: { orgId }, startDate: { lt: end }, endDate: { gte: start } },
          include: { employee: true },
          take: 100,
        }),
      ]);

      return JSON.stringify({
        location: loc.name,
        weekStart: ws,
        shifts: shifts.map((s) => ({
          date: s.date.toISOString().slice(0, 10),
          time: `${s.startTime}-${s.endTime}`,
          required: s.requiredHeadcount,
          assigned: s.assignments.map((a) => `${a.employee.firstName} ${a.employee.lastName}`),
          notes: s.notes ?? undefined,
        })),
        approvedAbsences: absences.map((a) => ({
          name: `${a.employee.firstName} ${a.employee.lastName}`,
          from: a.startDate.toISOString().slice(0, 10),
          to: a.endDate.toISOString().slice(0, 10),
          type: a.type,
        })),
      });
    },
  },

  get_employee_overview: {
    name: "get_employee_overview",
    description:
      "Liest Profil einer Person: Rolle, Standort, Wochenstunden-Soll, Qualifikationen, kommende genehmigte Abwesenheiten (30 Tage) und Verfügbarkeitsregeln.",
    inputSchema: {
      type: "object",
      properties: { employeeId: { type: "string", description: "ID der Person aus dem Kontext" } },
      required: ["employeeId"],
    },
    async execute(orgId, input) {
      const employeeId = str(input.employeeId);
      const emp = await prisma.employee.findFirst({
        where: { id: employeeId, orgId },
        include: { location: true, qualifications: { include: { qualification: true } } },
      });
      if (!emp) return JSON.stringify({ error: "Person unbekannt." });

      const today = dateAtUTC(todayISO());
      const horizon = dateAtUTC(addDays(todayISO(), 30));
      const absences = await prisma.absence.findMany({
        where: { employeeId, status: "APPROVED", endDate: { gte: today }, startDate: { lt: horizon } },
        orderBy: { startDate: "asc" },
        take: 20,
      });
      const rules = (await rulesFor(orgId)).get(employeeId) ?? [];

      return JSON.stringify({
        name: `${emp.firstName} ${emp.lastName}`,
        role: EMPLOYEE_TYPE_LABEL[emp.type] ?? emp.type,
        location: emp.location?.name ?? null,
        weeklyHoursTarget: emp.weeklyHoursTarget,
        active: emp.active,
        qualifications: emp.qualifications.map((q) => q.qualification.name),
        upcomingApprovedAbsences: absences.map((a) => ({
          from: a.startDate.toISOString().slice(0, 10),
          to: a.endDate.toISOString().slice(0, 10),
          type: a.type,
        })),
        availabilityRules: rules.map((r) =>
          r.recurring ? { weekday: r.weekday, type: r.type } : { date: r.date, type: r.type },
        ),
      });
    },
  },

  get_absences: {
    name: "get_absences",
    description: "Listet Abwesenheiten im Zeitraum (Default: heute +30 Tage), optional gefiltert auf eine Person. Enthält auch BEANTRAGTE (noch nicht genehmigte).",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "YYYY-MM-DD (optional)" },
        to: { type: "string", description: "YYYY-MM-DD (optional)" },
        employeeId: { type: "string", description: "optional: nur diese Person" },
      },
    },
    async execute(orgId, input) {
      const from = dateRe.test(str(input.from)) ? str(input.from) : todayISO();
      const to = dateRe.test(str(input.to)) ? str(input.to) : addDays(from, 30);
      const employeeId = str(input.employeeId) || undefined;

      const absences = await prisma.absence.findMany({
        where: {
          employee: { orgId },
          ...(employeeId ? { employeeId } : {}),
          startDate: { lt: dateAtUTC(addDays(to, 1)) },
          endDate: { gte: dateAtUTC(from) },
        },
        orderBy: { startDate: "asc" },
        include: { employee: true },
        take: 100,
      });

      return JSON.stringify({
        from, to,
        absences: absences.map((a) => ({
          name: `${a.employee.firstName} ${a.employee.lastName}`,
          from: a.startDate.toISOString().slice(0, 10),
          to: a.endDate.toISOString().slice(0, 10),
          type: a.type,
          status: a.status,
        })),
      });
    },
  },

  check_conflicts: {
    name: "check_conflicts",
    description:
      "Prüft eine Person an einem Datum: genehmigte Abwesenheit? Verfügbarkeitsregel (UNAVAILABLE/PREFERRED)? Bereits eingeteilte Schichten (mit Zeiten/Standort)? Nutze dies VOR jedem Aktionsvorschlag mit Person+Datum.",
    inputSchema: {
      type: "object",
      properties: {
        employeeId: { type: "string", description: "ID der Person aus dem Kontext" },
        date: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["employeeId", "date"],
    },
    async execute(orgId, input) {
      const employeeId = str(input.employeeId);
      const date = str(input.date);
      if (!dateRe.test(date)) return JSON.stringify({ error: "Ungültiges Datum." });
      const emp = await prisma.employee.findFirst({ where: { id: employeeId, orgId }, select: { firstName: true, lastName: true } });
      if (!emp) return JSON.stringify({ error: "Person unbekannt." });

      const day = dateAtUTC(date);
      const dayEnd = dateAtUTC(addDays(date, 1));
      const [absence, assignments, rules] = await Promise.all([
        prisma.absence.findFirst({
          where: { employeeId, status: "APPROVED", startDate: { lte: day }, endDate: { gte: day } },
        }),
        prisma.shiftAssignment.findMany({
          where: { employeeId, shift: { orgId, deletedAt: null, date: { gte: day, lt: dayEnd } } },
          include: { shift: { include: { location: true } } },
          take: 20,
        }),
        rulesFor(orgId).then((m) => m.get(employeeId) ?? []),
      ]);

      const availability = effectiveAvailability(rules, date, day.getUTCDay());

      return JSON.stringify({
        name: `${emp.firstName} ${emp.lastName}`,
        date,
        approvedAbsence: absence ? { type: absence.type } : null,
        availability, // "UNAVAILABLE" | "PREFERRED" | "AVAILABLE" | null
        assignedShifts: assignments.map((a) => ({
          time: `${a.shift.startTime}-${a.shift.endTime}`,
          location: a.shift.location.name,
        })),
      });
    },
  },
};

export function readToolDefs() {
  return Object.values(READ_TOOLS).map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));
}
