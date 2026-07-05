"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";

type Result = { ok: boolean; error?: string; message?: string; id?: string };

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
const schema = z.object({
  name: z.string().min(1, "Name erforderlich").max(80),
  locationId: z.string().optional(),
  startTime: z.string().regex(timeRe, "Startzeit HH:MM"),
  endTime: z.string().regex(timeRe, "Endzeit HH:MM"),
  requiredHeadcount: z.coerce.number().min(1).max(50),
  color: z.string().max(20).optional(),
});

async function resolveLocation(orgId: string, locationId?: string) {
  if (!locationId) return null;
  const loc = await prisma.location.findFirst({ where: { id: locationId, orgId } });
  return loc?.id ?? null;
}

export async function createTemplate(input: unknown): Promise<Result> {
  const { orgId } = await requirePermission(PERMISSIONS.SHIFT_MANAGE);
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message };
  const d = parsed.data;
  if (d.endTime <= d.startTime) return { ok: false, error: "Endzeit muss nach Startzeit liegen." };

  const t = await prisma.shiftTemplate.create({
    data: {
      orgId,
      locationId: await resolveLocation(orgId, d.locationId),
      name: d.name,
      startTime: d.startTime,
      endTime: d.endTime,
      requiredRoles: { count: d.requiredHeadcount },
      color: d.color || null,
    },
  });
  revalidatePath("/admin/templates");
  return { ok: true, id: t.id, message: "Vorlage angelegt." };
}

export async function updateTemplate(id: string, input: unknown): Promise<Result> {
  const { orgId } = await requirePermission(PERMISSIONS.SHIFT_MANAGE);
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message };
  const d = parsed.data;
  if (d.endTime <= d.startTime) return { ok: false, error: "Endzeit muss nach Startzeit liegen." };
  const existing = await prisma.shiftTemplate.findFirst({ where: { id, orgId } });
  if (!existing) return { ok: false, error: "Vorlage nicht gefunden." };

  await prisma.shiftTemplate.update({
    where: { id },
    data: {
      locationId: await resolveLocation(orgId, d.locationId),
      name: d.name,
      startTime: d.startTime,
      endTime: d.endTime,
      requiredRoles: { count: d.requiredHeadcount },
      color: d.color || null,
    },
  });
  revalidatePath("/admin/templates");
  return { ok: true, message: "Vorlage aktualisiert." };
}

export async function deleteTemplate(id: string): Promise<Result> {
  const { orgId } = await requirePermission(PERMISSIONS.SHIFT_MANAGE);
  const existing = await prisma.shiftTemplate.findFirst({ where: { id, orgId } });
  if (!existing) return { ok: false, error: "Nicht gefunden." };
  await prisma.shiftTemplate.delete({ where: { id } });
  revalidatePath("/admin/templates");
  return { ok: true, message: "Vorlage gelöscht." };
}
