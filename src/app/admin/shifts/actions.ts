"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { dateAtUTC, addDays } from "@/lib/domain/dates";

type Result = { ok: boolean; error?: string; message?: string; id?: string; ids?: string[] };

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
const shiftSchema = z.object({
  locationId: z.string().min(1, "Standort erforderlich"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum erforderlich"),
  startTime: z.string().regex(timeRe, "Startzeit HH:MM"),
  endTime: z.string().regex(timeRe, "Endzeit HH:MM"),
  requiredHeadcount: z.coerce.number().min(1).max(50),
  requiredPharmacists: z.coerce.number().min(0).max(10).optional(), // AI-P3/D1: Apothekerpflicht
  expectedVersion: z.coerce.number().int().min(0).optional(), // Arch-P1: Optimistic Locking
  notes: z.string().max(500).optional(),
});

function rolesJson(requiredPharmacists?: number): Record<string, number> | undefined {
  return requiredPharmacists && requiredPharmacists > 0 ? { APOTHEKER: requiredPharmacists } : undefined;
}

export async function createShift(input: unknown): Promise<Result> {
  const { orgId, userId } = await requirePermission(PERMISSIONS.SHIFT_CREATE);
  const parsed = shiftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message };
  const d = parsed.data;

  const loc = await prisma.location.findFirst({ where: { id: d.locationId, orgId } });
  if (!loc) return { ok: false, error: "Unbekannter Standort." };

  const shift = await prisma.shift.create({
    data: {
      orgId,
      locationId: d.locationId,
      date: dateAtUTC(d.date),
      startTime: d.startTime,
      endTime: d.endTime,
      requiredHeadcount: d.requiredHeadcount,
      requiredRoles: rolesJson(d.requiredPharmacists),
      notes: d.notes || null,
    },
  });
  await prisma.auditLog.create({ data: { orgId, actorId: userId, action: "shift.created", entity: "shift", entityId: shift.id } });
  revalidatePath("/admin/shifts");
  return { ok: true, id: shift.id, message: "Schicht angelegt." };
}

export async function updateShift(shiftId: string, input: unknown): Promise<Result> {
  const { orgId } = await requirePermission(PERMISSIONS.SHIFT_MANAGE);
  const parsed = shiftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message };
  const d = parsed.data;
  const existing = await prisma.shift.findFirst({ where: { id: shiftId, orgId } });
  if (!existing) return { ok: false, error: "Schicht nicht gefunden." };

  // Arch-P1: Optimistic Locking — schlägt fehl, wenn jemand zwischenzeitlich gespeichert hat
  const res = await prisma.shift.updateMany({
    where: { id: shiftId, orgId, ...(d.expectedVersion !== undefined ? { version: d.expectedVersion } : {}) },
    data: {
      locationId: d.locationId,
      date: dateAtUTC(d.date),
      startTime: d.startTime,
      endTime: d.endTime,
      requiredHeadcount: d.requiredHeadcount,
      requiredRoles: rolesJson(d.requiredPharmacists) ?? Prisma.DbNull,
      notes: d.notes || null,
      version: { increment: 1 },
    },
  });
  if (res.count === 0) {
    return { ok: false, error: "Konflikt: Die Schicht wurde zwischenzeitlich geändert. Bitte neu laden." };
  }
  revalidatePath("/admin/shifts");
  return { ok: true, message: "Schicht aktualisiert." };
}

export async function deleteShift(shiftId: string): Promise<Result> {
  const { orgId } = await requirePermission(PERMISSIONS.SHIFT_MANAGE);
  const existing = await prisma.shift.findFirst({ where: { id: shiftId, orgId } });
  if (!existing) return { ok: false, error: "Nicht gefunden." };
  await prisma.shift.update({ where: { id: shiftId }, data: { deletedAt: new Date() } });
  revalidatePath("/admin/shifts");
  return { ok: true, message: "Schicht gelöscht." };
}

export async function assignEmployee(shiftId: string, employeeId: string): Promise<Result> {
  const { orgId } = await requirePermission(PERMISSIONS.SHIFT_MANAGE);
  const shift = await prisma.shift.findFirst({ where: { id: shiftId, orgId } });
  if (!shift) return { ok: false, error: "Schicht nicht gefunden." };
  const emp = await prisma.employee.findFirst({ where: { id: employeeId, orgId } });
  if (!emp) return { ok: false, error: "Mitarbeiter nicht gefunden." };

  // Konflikt: genehmigte Abwesenheit an dem Tag?
  const absence = await prisma.absence.findFirst({
    where: { employeeId, status: "APPROVED", startDate: { lte: shift.date }, endDate: { gte: shift.date } },
  });

  await prisma.shiftAssignment.upsert({
    where: { shiftId_employeeId: { shiftId, employeeId } },
    update: {},
    create: { shiftId, employeeId, status: "ASSIGNED" },
  });
  revalidatePath("/admin/shifts");
  return { ok: true, message: absence ? "Zugewiesen – Achtung: Mitarbeiter ist an dem Tag abwesend." : "Zugewiesen." };
}

export async function unassignEmployee(shiftId: string, employeeId: string): Promise<Result> {
  const { orgId } = await requirePermission(PERMISSIONS.SHIFT_MANAGE);
  const shift = await prisma.shift.findFirst({ where: { id: shiftId, orgId } });
  if (!shift) return { ok: false, error: "Schicht nicht gefunden." };
  await prisma.shiftAssignment.deleteMany({ where: { shiftId, employeeId } });
  revalidatePath("/admin/shifts");
  return { ok: true, message: "Entfernt." };
}

/** Kopiert alle Schichten einer Woche (inkl. Zuweisungen) in eine Zielwoche. */
export async function copyWeek(input: { locationId: string; fromWeekStart: string; toWeekStart: string }): Promise<Result> {
  const { orgId } = await requirePermission(PERMISSIONS.PLAN_MANAGE);
  const from = dateAtUTC(input.fromWeekStart);
  const fromEnd = dateAtUTC(addDays(input.fromWeekStart, 7));
  const offsetDays = Math.round((dateAtUTC(input.toWeekStart).getTime() - from.getTime()) / 86_400_000);

  const source = await prisma.shift.findMany({
    where: { orgId, locationId: input.locationId, deletedAt: null, date: { gte: from, lt: fromEnd } },
    include: { assignments: true },
  });
  if (source.length === 0) return { ok: false, error: "Quellwoche enthält keine Schichten." };

  // P0: alles-oder-nichts (Standard 3.10)
  const createdIds: string[] = [];
  await prisma.$transaction(async (tx) => {
    for (const s of source) {
      const created = await tx.shift.create({
        data: {
          orgId,
          locationId: s.locationId,
          date: new Date(s.date.getTime() + offsetDays * 86_400_000),
          startTime: s.startTime,
          endTime: s.endTime,
          requiredHeadcount: s.requiredHeadcount,
          notes: s.notes,
        },
      });
      createdIds.push(created.id);
      if (s.assignments.length) {
        await tx.shiftAssignment.createMany({
          data: s.assignments.map((a) => ({ shiftId: created.id, employeeId: a.employeeId, status: "ASSIGNED" as const })),
          skipDuplicates: true,
        });
      }
    }
  });
  revalidatePath("/admin/shifts");
  return { ok: true, ids: createdIds, message: `${source.length} Schichten kopiert.` };
}
