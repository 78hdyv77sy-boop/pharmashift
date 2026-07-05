"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { dateAtUTC } from "@/lib/domain/dates";
import { AVAILABILITY_TYPES } from "@/lib/domain/availability-types";

type Result = { ok: boolean; error?: string; message?: string };

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
const schema = z
  .object({
    employeeId: z.string().min(1, "Mitarbeiter erforderlich"),
    mode: z.enum(["recurring", "once"]),
    weekday: z.coerce.number().min(0).max(6).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    startTime: z.string().regex(timeRe, "Startzeit HH:MM"),
    endTime: z.string().regex(timeRe, "Endzeit HH:MM"),
    type: z.enum(AVAILABILITY_TYPES),
  })
  .refine((d) => (d.mode === "recurring" ? d.weekday !== undefined : !!d.date), {
    message: "Wochentag bzw. Datum erforderlich.",
  });

export async function addAvailability(input: unknown): Promise<Result> {
  const { orgId } = await requirePermission(PERMISSIONS.EMPLOYEE_MANAGE);
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message };
  const d = parsed.data;
  if (d.endTime <= d.startTime) return { ok: false, error: "Endzeit muss nach Startzeit liegen." };

  const emp = await prisma.employee.findFirst({ where: { id: d.employeeId, orgId } });
  if (!emp) return { ok: false, error: "Mitarbeiter nicht gefunden." };

  await prisma.availability.create({
    data: {
      employeeId: d.employeeId,
      recurring: d.mode === "recurring",
      weekday: d.mode === "recurring" ? d.weekday! : null,
      date: d.mode === "once" ? dateAtUTC(d.date!) : null,
      startTime: d.startTime,
      endTime: d.endTime,
      type: d.type,
    },
  });
  revalidatePath("/admin/availability");
  return { ok: true, message: "Verfügbarkeit gespeichert." };
}

export async function deleteAvailability(id: string): Promise<Result> {
  const { orgId } = await requirePermission(PERMISSIONS.EMPLOYEE_MANAGE);
  const entry = await prisma.availability.findFirst({ where: { id, employee: { orgId } } });
  if (!entry) return { ok: false, error: "Nicht gefunden." };
  await prisma.availability.delete({ where: { id } });
  revalidatePath("/admin/availability");
  return { ok: true, message: "Gelöscht." };
}
