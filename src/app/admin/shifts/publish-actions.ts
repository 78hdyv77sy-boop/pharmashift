"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { dateAtUTC, addDays, mondayOf, weekdayShort, formatDayLabel } from "@/lib/domain/dates";
import { sendPlanPublishedEmail, type PublishedShiftLine } from "@/lib/email/resend";

export async function publishWeek(
  locationId: string,
  weekStartRaw: string,
): Promise<{ ok: boolean; error?: string; message?: string }> {
  const { orgId, userId } = await requirePermission(PERMISSIONS.PLAN_PUBLISH);
  const weekStart = mondayOf(weekStartRaw);
  const loc = await prisma.location.findFirst({ where: { id: locationId, orgId } });
  if (!loc) return { ok: false, error: "Unbekannter Standort." };

  const periodStart = dateAtUTC(weekStart);
  const periodEnd = dateAtUTC(addDays(weekStart, 6));
  const rangeEnd = dateAtUTC(addDays(weekStart, 7));

  const shifts = await prisma.shift.findMany({
    where: { orgId, locationId, deletedAt: null, date: { gte: periodStart, lt: rangeEnd } },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    include: { assignments: { include: { employee: { include: { user: true } } } } },
  });
  if (shifts.length === 0) return { ok: false, error: "Keine Schichten in dieser Woche." };

  // P0: Plan + Verknüpfung + Audit atomar (Standard 3.10)
  const noEmail = (() => {
    let n = 0;
    for (const s of shifts) for (const a of s.assignments) if (!a.employee.user?.email) n++;
    return n;
  })();

  const plan = await prisma.$transaction(async (tx) => {
    const existing = await tx.shiftPlan.findFirst({ where: { orgId, locationId, periodStart } });
    const p = existing
      ? await tx.shiftPlan.update({ where: { id: existing.id }, data: { status: "PUBLISHED", periodEnd } })
      : await tx.shiftPlan.create({ data: { orgId, locationId, periodStart, periodEnd, status: "PUBLISHED", createdById: userId } });
    await tx.shift.updateMany({ where: { id: { in: shifts.map((s) => s.id) } }, data: { planId: p.id } });
    await tx.auditLog.create({ data: { orgId, actorId: userId, action: "plan.published", entity: "shiftPlan", entityId: p.id } });
    return p;
  });

  // Schichten je Mitarbeiter sammeln
  const perEmployee = new Map<string, { name: string; email: string | null; lines: PublishedShiftLine[] }>();
  for (const s of shifts) {
    for (const a of s.assignments) {
      const e = a.employee;
      const key = e.id;
      if (!perEmployee.has(key)) {
        perEmployee.set(key, { name: `${e.firstName} ${e.lastName}`, email: e.user?.email ?? null, lines: [] });
      }
      perEmployee.get(key)!.lines.push({
        date: `${weekdayShort(s.date.toISOString().slice(0, 10))} ${formatDayLabel(s.date.toISOString().slice(0, 10))}`,
        startTime: s.startTime,
        endTime: s.endTime,
        locationName: loc.name,
      });
    }
  }

  // P0: externe Calls NICHT im Request-Pfad (Standard 3.12).
  // after() läuft nach der Response; allSettled = paralleler Versand,
  // Einzelfehler reißen nichts mit. Ergebnis wird nachträglich auditiert.
  const weekLabel = `Woche ab ${formatDayLabel(weekStart)}`;
  const recipients = Array.from(perEmployee.values()).filter((r) => r.email);
  after(async () => {
    const results = await Promise.allSettled(
      recipients.map((r) => sendPlanPublishedEmail(r.email!, r.name, weekLabel, r.lines)),
    );
    const sent = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - sent;
    await prisma.auditLog.create({
      data: { orgId, actorId: userId, action: "plan.notify.result", entity: "shiftPlan", entityId: plan.id, meta: { sent, failed, noEmail } },
    }).catch(() => {});
  });

  revalidatePath("/admin/shifts");
  return { ok: true, message: `Plan veröffentlicht. ${recipients.length} Benachrichtigung(en) werden versendet${noEmail ? `, ${noEmail} Zuweisung(en) ohne E-Mail` : ""}.` };
}
