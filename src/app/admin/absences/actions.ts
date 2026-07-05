"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { dateAtUTC } from "@/lib/domain/dates";
import { ABSENCE_TYPES } from "@/lib/domain/absences";

type Result = { ok: boolean; error?: string; message?: string; id?: string; conflicts?: string[] };

const schema = z.object({
  employeeId: z.string().min(1, "Mitarbeiter erforderlich"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Startdatum erforderlich"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enddatum erforderlich"),
  type: z.enum(ABSENCE_TYPES),
  note: z.string().max(300).optional(),
});

export async function requestAbsence(input: unknown): Promise<Result> {
  const { orgId } = await requirePermission(PERMISSIONS.ABSENCE_REQUEST);
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message };
  const d = parsed.data;
  if (d.endDate < d.startDate) return { ok: false, error: "Enddatum vor Startdatum." };

  const emp = await prisma.employee.findFirst({ where: { id: d.employeeId, orgId } });
  if (!emp) return { ok: false, error: "Mitarbeiter nicht gefunden." };

  const created = await prisma.absence.create({
    data: {
      employeeId: d.employeeId,
      startDate: dateAtUTC(d.startDate),
      endDate: dateAtUTC(d.endDate),
      type: d.type,
      note: d.note || null,
      status: "REQUESTED",
    },
  });
  revalidatePath("/admin/absences");
  revalidatePath("/admin/shifts");
  return { ok: true, id: created.id, message: "Abwesenheit beantragt." };
}

export async function setAbsenceStatus(absenceId: string, status: "APPROVED" | "DECLINED", opts?: { force?: boolean }): Promise<Result> {
  const { orgId } = await requirePermission(PERMISSIONS.ABSENCE_APPROVE);
  const absence = await prisma.absence.findFirst({ where: { id: absenceId, employee: { orgId } } });
  if (!absence) return { ok: false, error: "Nicht gefunden." };

  // UX2-P0 N4: Schutz-Genehmigung — vor APPROVED auf bestehende Zuweisungen prüfen.
  // Der "Agent" arbeitet hier im Hintergrund des normalen Klicks (AI-first).
  if (status === "APPROVED" && !opts?.force) {
    const hit = await prisma.shiftAssignment.findMany({
      where: {
        employeeId: absence.employeeId,
        shift: { orgId, deletedAt: null, date: { gte: absence.startDate, lte: absence.endDate } },
      },
      include: { shift: { include: { location: true } } },
      orderBy: { shift: { date: "asc" } },
      take: 10,
    });
    if (hit.length > 0) {
      const conflicts = hit.map((a) => {
        const d = a.shift.date.toISOString().slice(0, 10);
        return `${d} ${a.shift.startTime}–${a.shift.endTime} (${a.shift.location.name})`;
      });
      return { ok: false, conflicts };
    }
  }

  await prisma.absence.update({ where: { id: absenceId }, data: { status } });
  revalidatePath("/admin/absences");
  revalidatePath("/admin/shifts");
  return { ok: true, message: status === "APPROVED" ? "Genehmigt." : "Abgelehnt." };
}

export async function deleteAbsence(absenceId: string): Promise<Result> {
  const { orgId } = await requirePermission(PERMISSIONS.ABSENCE_APPROVE);
  const absence = await prisma.absence.findFirst({ where: { id: absenceId, employee: { orgId } } });
  if (!absence) return { ok: false, error: "Nicht gefunden." };
  await prisma.absence.delete({ where: { id: absenceId } });
  revalidatePath("/admin/absences");
  revalidatePath("/admin/shifts");
  return { ok: true, message: "Gelöscht." };
}
