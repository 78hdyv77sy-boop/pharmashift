import "server-only";
import { prisma } from "@/lib/prisma";
import { dateAtUTC, addDays, todayISO, mondayOf, formatDayLabel, weekdayShort } from "@/lib/domain/dates";
import { shiftHours as shiftHoursCentral } from "@/lib/domain/time";

// AI-P3 / 8.6 V5 (Variante "on-request"): proaktive Hinweise, live berechnet.
// Nightly-Digest via Inngest bleibt als Deployment-Upgrade im Plan.

export interface Insight {
  severity: "warn" | "info";
  message: string;
  href: string;
}

function hours(start: string, end: string): number {
  return shiftHoursCentral(start, end);
}

export async function computeInsights(orgId: string): Promise<Insight[]> {
  const today = todayISO();
  const start = dateAtUTC(today);
  const horizon = dateAtUTC(addDays(today, 14));
  const weekStart = mondayOf(today);
  const weekStartD = dateAtUTC(weekStart);
  const weekEndD = dateAtUTC(addDays(weekStart, 7));

  const [upcoming, weekShifts, employees, locations, duties] = await Promise.all([
    prisma.shift.findMany({
      where: { orgId, deletedAt: null, date: { gte: start, lt: horizon } },
      include: { assignments: { include: { employee: true } }, location: true },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    prisma.shift.findMany({
      where: { orgId, deletedAt: null, date: { gte: weekStartD, lt: weekEndD } },
      include: { assignments: true },
    }),
    prisma.employee.findMany({ where: { orgId, deletedAt: null, active: true } }),
    prisma.location.findMany({ where: { orgId, deletedAt: null }, select: { id: true, name: true } }),
    prisma.emergencyDuty.findMany({
      where: { location: { orgId } , date: { gte: start, lt: horizon } },
      select: { locationId: true, date: true, employeeId: true },
    }),
  ]);

  const insights: Insight[] = [];

  // 1) Unterbesetzung in den nächsten 14 Tagen (max. 4 nennen)
  const under = upcoming.filter((s) => s.assignments.length < s.requiredHeadcount);
  for (const s of under.slice(0, 4)) {
    const d = s.date.toISOString().slice(0, 10);
    insights.push({
      severity: "warn",
      message: `Unterbesetzt: ${weekdayShort(d)} ${formatDayLabel(d)} ${s.startTime}–${s.endTime} (${s.location.name}, ${s.assignments.length}/${s.requiredHeadcount})`,
      href: `/admin/shifts?locationId=${s.locationId}&week=${mondayOf(d)}`,
    });
  }
  if (under.length > 4) {
    insights.push({ severity: "warn", message: `… und ${under.length - 4} weitere unterbesetzte Schichten in 14 Tagen.`, href: "/admin/shifts" });
  }

  // 2) Apothekerpflicht verletzt (nächste 14 Tage)
  for (const s of upcoming) {
    const need = ((s.requiredRoles ?? {}) as Record<string, number>).APOTHEKER ?? 0;
    if (need > 0) {
      const have = s.assignments.filter((a) => a.employee.type === "APOTHEKER").length;
      if (have < need) {
        const d = s.date.toISOString().slice(0, 10);
        insights.push({
          severity: "warn",
          message: `⚕ Apothekerpflicht offen: ${weekdayShort(d)} ${formatDayLabel(d)} ${s.startTime} (${s.location.name}, ${have}/${need})`,
          href: `/admin/shifts?locationId=${s.locationId}&week=${mondayOf(d)}`,
        });
        if (insights.length > 8) break;
      }
    }
  }

  // 3) Stunden-Soll-Abweichung in der laufenden Woche (>25% unter Soll)
  const hoursBy = new Map<string, number>();
  for (const s of weekShifts) {
    const h = hours(s.startTime, s.endTime);
    for (const a of s.assignments) hoursBy.set(a.employeeId, (hoursBy.get(a.employeeId) ?? 0) + h);
  }
  const lagging = employees
    .filter((e) => e.weeklyHoursTarget !== null && e.weeklyHoursTarget > 0)
    .map((e) => ({ e, actual: hoursBy.get(e.id) ?? 0 }))
    .filter(({ e, actual }) => actual < e.weeklyHoursTarget! * 0.75)
    .slice(0, 3);
  for (const { e, actual } of lagging) {
    insights.push({
      severity: "info",
      message: `${e.firstName} ${e.lastName} liegt diese Woche bei ${Math.round(actual)}h von ${e.weeklyHoursTarget}h Soll.`,
      href: `/admin/shifts`,
    });
  }

  // 4) Notdienst-Lücken in den nächsten 14 Tagen je Standort
  const dutySet = new Set(duties.filter((d) => d.employeeId).map((d) => `${d.locationId}:${d.date.toISOString().slice(0, 10)}`));
  for (const loc of locations) {
    let missing = 0;
    let firstMissing: string | null = null;
    for (let i = 0; i < 14; i++) {
      const day = addDays(today, i);
      if (!dutySet.has(`${loc.id}:${day}`)) { missing++; if (!firstMissing) firstMissing = day; }
    }
    if (missing >= 7) {
      insights.push({
        severity: "info",
        message: `Notdienst ${loc.name}: ${missing} von 14 Tagen unbesetzt (ab ${firstMissing ? formatDayLabel(firstMissing) : ""}). Auto-Rotation nutzen?`,
        href: "/admin/emergency",
      });
    }
  }

  return insights.slice(0, 10);
}
