"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, ALL_PERMISSIONS } from "@/lib/permissions";

type Result = { ok: boolean; error?: string; message?: string };

const nameSchema = z.string().min(2, "Name zu kurz").max(40);

async function audit(orgId: string, actorId: string, action: string, entityId?: string, meta?: object) {
  await prisma.auditLog.create({
    data: { orgId, actorId, action, entity: "role", entityId, meta: meta as object },
  });
}

export async function loadRolePermissions(
  roleId: string,
): Promise<{ ok: boolean; keys?: string[]; error?: string }> {
  const { orgId } = await requirePermission(PERMISSIONS.ROLE_MANAGE);
  const role = await prisma.role.findFirst({
    where: { id: roleId, orgId },
    include: { rolePermissions: { include: { permission: true } } },
  });
  if (!role) return { ok: false, error: "Rolle nicht gefunden." };
  return { ok: true, keys: role.rolePermissions.map((rp) => rp.permission.key) };
}

export async function createRole(input: { name: string; description?: string }): Promise<Result> {
  const { orgId, userId } = await requirePermission(PERMISSIONS.ROLE_MANAGE);
  const name = nameSchema.safeParse(input.name);
  if (!name.success) return { ok: false, error: name.error.errors[0]?.message };

  const exists = await prisma.role.findFirst({ where: { orgId, name: name.data } });
  if (exists) return { ok: false, error: "Eine Rolle mit diesem Namen existiert bereits." };

  const role = await prisma.role.create({
    data: { orgId, name: name.data, description: input.description, isSystem: false },
  });
  await audit(orgId, userId, "role.created", role.id, { name: name.data });
  revalidatePath("/admin/roles");
  return { ok: true, message: "Rolle erstellt." };
}

export async function renameRole(roleId: string, name: string, description?: string): Promise<Result> {
  const { orgId, userId } = await requirePermission(PERMISSIONS.ROLE_MANAGE);
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message };

  const role = await prisma.role.findFirst({ where: { id: roleId, orgId } });
  if (!role) return { ok: false, error: "Rolle nicht gefunden." };

  await prisma.role.update({ where: { id: roleId }, data: { name: parsed.data, description } });
  await audit(orgId, userId, "role.renamed", roleId, { name: parsed.data });
  revalidatePath("/admin/roles");
  return { ok: true, message: "Rolle aktualisiert." };
}

export async function setRolePermissions(roleId: string, permissionKeys: string[]): Promise<Result> {
  const { orgId, userId } = await requirePermission(PERMISSIONS.ROLE_MANAGE);

  const role = await prisma.role.findFirst({ where: { id: roleId, orgId } });
  if (!role) return { ok: false, error: "Rolle nicht gefunden." };

  // OrgAdmin behält immer alle Rechte (Aussperr-Schutz)
  const keys = role.name === "OrgAdmin" ? ALL_PERMISSIONS : permissionKeys.filter((k) => ALL_PERMISSIONS.includes(k as never));

  const permissions = await prisma.permission.findMany({ where: { key: { in: keys } } });

  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId } }),
    prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId, permissionId: p.id })),
      skipDuplicates: true,
    }),
  ]);
  await audit(orgId, userId, "role.permissions_set", roleId, { count: permissions.length });
  revalidatePath("/admin/roles");
  return { ok: true, message: "Berechtigungen gespeichert." };
}

export async function deleteRole(roleId: string): Promise<Result> {
  const { orgId, userId } = await requirePermission(PERMISSIONS.ROLE_MANAGE);

  const role = await prisma.role.findFirst({
    where: { id: roleId, orgId },
    include: { _count: { select: { userRoles: true } } },
  });
  if (!role) return { ok: false, error: "Rolle nicht gefunden." };
  if (role.isSystem) return { ok: false, error: "System-Rollen können nicht gelöscht werden." };
  if (role._count.userRoles > 0) return { ok: false, error: "Rolle ist noch zugewiesen. Erst Mitglieder umstufen." };

  await prisma.role.delete({ where: { id: roleId } });
  await audit(orgId, userId, "role.deleted", roleId, { name: role.name });
  revalidatePath("/admin/roles");
  return { ok: true, message: "Rolle gelöscht." };
}
