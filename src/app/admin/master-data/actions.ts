"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";

type Result = { ok: boolean; error?: string };
const nameSchema = z.string().min(1).max(60);

export async function addQualification(name: string): Promise<Result> {
  const { orgId } = await requirePermission(PERMISSIONS.EMPLOYEE_MANAGE);
  const parsed = nameSchema.safeParse(name.trim());
  if (!parsed.success) return { ok: false, error: "Name erforderlich." };
  const exists = await prisma.qualification.findFirst({ where: { orgId, name: parsed.data } });
  if (exists) return { ok: false, error: "Existiert bereits." };
  await prisma.qualification.create({ data: { orgId, name: parsed.data } });
  revalidatePath("/admin/master-data");
  return { ok: true };
}

export async function deleteQualification(id: string): Promise<Result> {
  const { orgId } = await requirePermission(PERMISSIONS.EMPLOYEE_MANAGE);
  const q = await prisma.qualification.findFirst({ where: { id, orgId } });
  if (!q) return { ok: false, error: "Nicht gefunden." };
  await prisma.qualification.delete({ where: { id } });
  revalidatePath("/admin/master-data");
  return { ok: true };
}

export async function addResponsibility(name: string): Promise<Result> {
  const { orgId } = await requirePermission(PERMISSIONS.EMPLOYEE_MANAGE);
  const parsed = nameSchema.safeParse(name.trim());
  if (!parsed.success) return { ok: false, error: "Name erforderlich." };
  const exists = await prisma.responsibility.findFirst({ where: { orgId, name: parsed.data } });
  if (exists) return { ok: false, error: "Existiert bereits." };
  await prisma.responsibility.create({ data: { orgId, name: parsed.data } });
  revalidatePath("/admin/master-data");
  return { ok: true };
}

export async function deleteResponsibility(id: string): Promise<Result> {
  const { orgId } = await requirePermission(PERMISSIONS.EMPLOYEE_MANAGE);
  const r = await prisma.responsibility.findFirst({ where: { id, orgId } });
  if (!r) return { ok: false, error: "Nicht gefunden." };
  await prisma.responsibility.delete({ where: { id } });
  revalidatePath("/admin/master-data");
  return { ok: true };
}
