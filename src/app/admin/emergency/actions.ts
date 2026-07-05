"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { dateAtUTC } from "@/lib/domain/dates";
import { monthRange } from "@/lib/domain/emergency";

type Result = { ok: boolean; error?: string; message?: string; previousEmployeeId?: string | null };

async function assertEmergencyLocation(orgId: string, locationId: string) {
  return prisma.location.findFirst({ where: { id: locationId, orgId, isEmergency: true, deletedAt: null } });
}

/** Setzt (oder entfernt bei employeeId == null/"") den Notdienst für Standort+Datum. */
export async function setEmergencyDuty(locationId: string, date: string, employeeId: string | null): Promise<Result> {
  const { orgId } = await requirePermission(PERMISSIONS.PLAN_MANAGE);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Ungültiges Datum." };
  const loc = await assertEmergencyLocation(orgId, locationId);
  if (!loc) return { ok: false, error: "Kein Notdienst-Standort." };

  const dutyDate = dateAtUTC(date);
  const previous = await prisma.emergencyDuty.findUnique({
    where: { locationId_date: { locationId, date: dutyDate } },
    select: { employeeId: true },
  });
  const previousEmployeeId = previous ? previous.employeeId : null;

  if (!employeeId) {
    await prisma.emergencyDuty.deleteMany({ where: { locationId, date: dutyDate } });
    revalidatePath("/admin/emergency");
    return { ok: true, previousEmployeeId, message: "Notdienst entfernt." };
  }

  const emp = await prisma.employee.findFirst({ where: { id: employeeId, orgId } });
  if (!emp) return { ok: false, error: "Mitarbeiter nicht gefunden." };

  // P0: atomar via compound unique (kein Race-Fenster mehr)
  await prisma.emergencyDuty.upsert({
    where: { locationId_date: { locationId, date: dutyDate } },
    update: { employeeId },
    create: { locationId, date: dutyDate, employeeId },
  });

  revalidatePath("/admin/emergency");
  revalidatePath("/admin/shifts");
  return { ok: true, previousEmployeeId, message: "Notdienst zugewiesen." };
}

/** Verteilt aktive Mitarbeiter reihum über alle Tage des Monats (überspringt Abwesende). */
export async function autoRotateMonth(locationId: string, year: number, month1: number): Promise<Result> {
  const { orgId } = await requirePermission(PERMISSIONS.PLAN_MANAGE);
  const loc = await assertEmergencyLocation(orgId, locationId);
  if (!loc) return { ok: false, error: "Kein Notdienst-Standort." };

  const employees = await prisma.employee.findMany({ where: { orgId, deletedAt: null, active: true }, orderBy: { lastName: "asc" }, select: { id: true } });
  if (employees.length === 0) return { ok: false, error: "Keine aktiven Mitarbeiter." };

  const { days } = monthRange(year, month1);
  const monthStart = dateAtUTC(days[0]);
  const monthEnd = dateAtUTC(days[days.length - 1]);
  monthEnd.setUTCDate(monthEnd.getUTCDate() + 1);

  const absences = await prisma.absence.findMany({
    where: { status: "APPROVED", employee: { orgId }, startDate: { lt: monthEnd }, endDate: { gte: monthStart } },
    select: { employeeId: true, startDate: true, endDate: true },
  });
  const isAbsent = (eid: string, dayISO: string) =>
    absences.some((a) => a.employeeId === eid && a.startDate.toISOString().slice(0, 10) <= dayISO && a.endDate.toISOString().slice(0, 10) >= dayISO);

  let cursor = 0;
  const picks: { date: string; employeeId: string }[] = [];
  for (const day of days) {
    // nächsten nicht-abwesenden Mitarbeiter rund-robin suchen
    let pick: string | null = null;
    for (let i = 0; i < employees.length; i++) {
      const cand = employees[(cursor + i) % employees.length].id;
      if (!isAbsent(cand, day)) { pick = cand; cursor = (cursor + i + 1) % employees.length; break; }
    }
    if (pick) picks.push({ date: day, employeeId: pick });
  }

  // P0: eine Transaktion statt 60+ Einzelqueries (Standard 3.10)
  await prisma.$transaction([
    prisma.emergencyDuty.deleteMany({ where: { locationId, location: { orgId }, date: { gte: monthStart, lt: monthEnd } } }),
    prisma.emergencyDuty.createMany({
      data: picks.map((p) => ({ locationId, date: dateAtUTC(p.date), employeeId: p.employeeId })),
    }),
  ]);
  const assigned = picks.length;

  revalidatePath("/admin/emergency");
  return { ok: true, message: `${assigned} Tage automatisch belegt.` };
}
