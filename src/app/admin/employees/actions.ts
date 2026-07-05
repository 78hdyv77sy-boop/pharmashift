"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { EMPLOYEE_TYPES } from "@/lib/domain/employees";

type Result = { ok: boolean; error?: string; message?: string; id?: string };

const employeeSchema = z.object({
  firstName: z.string().min(1, "Vorname erforderlich").max(60),
  lastName: z.string().min(1, "Nachname erforderlich").max(60),
  type: z.enum(EMPLOYEE_TYPES),
  locationId: z.string().nullable().optional(),
  weeklyHoursTarget: z.coerce.number().min(0).max(80).optional(),
  color: z.string().max(20).nullable().optional(),
  active: z.boolean().optional(),
  nightWorkRestricted: z.boolean().optional(),
  qualificationIds: z.array(z.string()).optional(),
  responsibilityIds: z.array(z.string()).optional(),
});

async function syncJoins(employeeId: string, qualificationIds: string[], responsibilityIds: string[]) {
  await prisma.$transaction([
    prisma.employeeQualification.deleteMany({ where: { employeeId } }),
    prisma.employeeResponsibility.deleteMany({ where: { employeeId } }),
    ...(qualificationIds.length
      ? [prisma.employeeQualification.createMany({ data: qualificationIds.map((qualificationId) => ({ employeeId, qualificationId })), skipDuplicates: true })]
      : []),
    ...(responsibilityIds.length
      ? [prisma.employeeResponsibility.createMany({ data: responsibilityIds.map((responsibilityId) => ({ employeeId, responsibilityId })), skipDuplicates: true })]
      : []),
  ]);
}

export async function createEmployee(input: unknown): Promise<Result> {
  const { orgId, userId } = await requirePermission(PERMISSIONS.EMPLOYEE_MANAGE);
  const parsed = employeeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message };
  const d = parsed.data;

  // Standort/Qualifikationen müssen zur Org gehören
  if (d.locationId) {
    const loc = await prisma.location.findFirst({ where: { id: d.locationId, orgId } });
    if (!loc) return { ok: false, error: "Unbekannter Standort." };
  }

  const employee = await prisma.employee.create({
    data: {
      orgId,
      firstName: d.firstName,
      lastName: d.lastName,
      type: d.type,
      locationId: d.locationId || null,
      weeklyHoursTarget: d.weeklyHoursTarget ?? 0,
      color: d.color || null,
      active: d.active ?? true,
      nightWorkRestricted: d.nightWorkRestricted ?? false,
    },
  });
  await syncJoins(employee.id, d.qualificationIds ?? [], d.responsibilityIds ?? []);
  await prisma.auditLog.create({ data: { orgId, actorId: userId, action: "employee.created", entity: "employee", entityId: employee.id } });

  revalidatePath("/admin/employees");
  return { ok: true, id: employee.id, message: "Mitarbeiter angelegt." };
}

export async function updateEmployee(employeeId: string, input: unknown): Promise<Result> {
  const { orgId } = await requirePermission(PERMISSIONS.EMPLOYEE_MANAGE);
  const parsed = employeeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message };
  const d = parsed.data;

  const existing = await prisma.employee.findFirst({ where: { id: employeeId, orgId } });
  if (!existing) return { ok: false, error: "Mitarbeiter nicht gefunden." };

  await prisma.employee.update({
    where: { id: employeeId },
    data: {
      firstName: d.firstName,
      lastName: d.lastName,
      type: d.type,
      locationId: d.locationId || null,
      weeklyHoursTarget: d.weeklyHoursTarget ?? 0,
      color: d.color || null,
      active: d.active ?? true,
      nightWorkRestricted: d.nightWorkRestricted ?? false,
    },
  });
  await syncJoins(employeeId, d.qualificationIds ?? [], d.responsibilityIds ?? []);

  revalidatePath("/admin/employees");
  return { ok: true, message: "Mitarbeiter aktualisiert." };
}

export async function setEmployeeActive(employeeId: string, active: boolean): Promise<Result> {
  const { orgId } = await requirePermission(PERMISSIONS.EMPLOYEE_MANAGE);
  const e = await prisma.employee.findFirst({ where: { id: employeeId, orgId } });
  if (!e) return { ok: false, error: "Nicht gefunden." };
  await prisma.employee.update({ where: { id: employeeId }, data: { active } });
  revalidatePath("/admin/employees");
  return { ok: true, message: active ? "Aktiviert." : "Deaktiviert." };
}

export async function deleteEmployee(employeeId: string): Promise<Result> {
  const { orgId, userId } = await requirePermission(PERMISSIONS.EMPLOYEE_MANAGE);
  const e = await prisma.employee.findFirst({ where: { id: employeeId, orgId } });
  if (!e) return { ok: false, error: "Nicht gefunden." };
  // Soft-Delete (Plan 3.6)
  await prisma.employee.update({ where: { id: employeeId }, data: { deletedAt: new Date(), active: false } });
  await prisma.auditLog.create({ data: { orgId, actorId: userId, action: "employee.deleted", entity: "employee", entityId: employeeId } });
  revalidatePath("/admin/employees");
  return { ok: true, message: "Mitarbeiter gelöscht." };
}
