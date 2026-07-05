"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { dateAtUTC, addDays } from "@/lib/domain/dates";

type Result = { ok: boolean; error?: string; message?: string };

/**
 * Tauscht zwei Mitarbeiter an einem Datum gegenseitig: In Schichten, in denen
 * nur A eingeteilt ist, übernimmt B – und umgekehrt. Schichten mit beiden oder
 * keinem der beiden bleiben unverändert.
 */
export async function swapAssignmentsOnDate(employeeAId: string, employeeBId: string, date: string): Promise<Result> {
  const { orgId, userId } = await requirePermission(PERMISSIONS.SHIFT_MANAGE);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Ungültiges Datum." };
  if (employeeAId === employeeBId) return { ok: false, error: "Bitte zwei verschiedene Personen wählen." };

  const [a, b] = await Promise.all([
    prisma.employee.findFirst({ where: { id: employeeAId, orgId }, select: { id: true, firstName: true, lastName: true } }),
    prisma.employee.findFirst({ where: { id: employeeBId, orgId }, select: { id: true, firstName: true, lastName: true } }),
  ]);
  if (!a || !b) return { ok: false, error: "Mitarbeiter nicht gefunden." };

  const dayStart = dateAtUTC(date);
  const dayEnd = dateAtUTC(addDays(date, 1));
  const shifts = await prisma.shift.findMany({
    where: { orgId, deletedAt: null, date: { gte: dayStart, lt: dayEnd } },
    include: { assignments: true },
  });

  // P0: Tausch atomar – kein Zustand "entfernt, aber Ersatz fehlt" (Standard 3.10)
  let swapped = 0;
  await prisma.$transaction(async (tx) => {
    for (const s of shifts) {
      const hasA = s.assignments.some((x) => x.employeeId === employeeAId);
      const hasB = s.assignments.some((x) => x.employeeId === employeeBId);
      if (hasA === hasB) continue; // beide oder keiner -> unverändert

      const from = hasA ? employeeAId : employeeBId;
      const to = hasA ? employeeBId : employeeAId;
      await tx.shiftAssignment.deleteMany({ where: { shiftId: s.id, employeeId: from } });
      await tx.shiftAssignment.upsert({
        where: { shiftId_employeeId: { shiftId: s.id, employeeId: to } },
        update: {},
        create: { shiftId: s.id, employeeId: to, status: "ASSIGNED" },
      });
      swapped++;
    }
    if (swapped > 0) {
      await tx.auditLog.create({
        data: { orgId, actorId: userId, action: "shift.swapped", entity: "shift", meta: { date, a: employeeAId, b: employeeBId, swapped } },
      });
    }
  });

  if (swapped === 0) return { ok: false, error: "Nichts zu tauschen (keine passenden Schichten an dem Tag)." };

  revalidatePath("/admin/shifts");
  return { ok: true, message: `${swapped} Schicht(en) zwischen ${a.firstName} ${a.lastName} und ${b.firstName} ${b.lastName} getauscht.` };
}
