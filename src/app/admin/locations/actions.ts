"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";

type Result = { ok: boolean; error?: string; message?: string };

const schema = z.object({
  name: z.string().min(1, "Name erforderlich").max(80),
  address: z.string().max(200).optional(),
  isEmergency: z.boolean().optional(),
});

export async function createLocation(input: unknown): Promise<Result> {
  const { orgId } = await requirePermission(PERMISSIONS.LOCATION_MANAGE);
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message };
  await prisma.location.create({
    data: { orgId, name: parsed.data.name, address: parsed.data.address || null, isEmergency: parsed.data.isEmergency ?? false },
  });
  revalidatePath("/admin/locations");
  return { ok: true, message: "Standort angelegt." };
}

export async function updateLocation(locationId: string, input: unknown): Promise<Result> {
  const { orgId } = await requirePermission(PERMISSIONS.LOCATION_MANAGE);
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message };
  const loc = await prisma.location.findFirst({ where: { id: locationId, orgId } });
  if (!loc) return { ok: false, error: "Nicht gefunden." };
  await prisma.location.update({
    where: { id: locationId },
    data: { name: parsed.data.name, address: parsed.data.address || null, isEmergency: parsed.data.isEmergency ?? false },
  });
  revalidatePath("/admin/locations");
  return { ok: true, message: "Standort aktualisiert." };
}

export async function deleteLocation(locationId: string): Promise<Result> {
  const { orgId } = await requirePermission(PERMISSIONS.LOCATION_MANAGE);
  const loc = await prisma.location.findFirst({ where: { id: locationId, orgId } });
  if (!loc) return { ok: false, error: "Nicht gefunden." };
  await prisma.location.update({ where: { id: locationId }, data: { deletedAt: new Date() } });
  revalidatePath("/admin/locations");
  return { ok: true, message: "Standort gelöscht." };
}
