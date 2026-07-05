import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type { PermissionKey } from "@/lib/permissions";
import { requireOrg } from "@/lib/tenant";

/**
 * Sammelt alle Permission-Keys eines Users in einer Organisation
 * (über seine zugewiesenen Rollen). SuperAdmin hat implizit alles.
 */
export const getUserPermissions = cache(async function getUserPermissionsImpl(userId: string, orgId: string): Promise<Set<string>> {
  const userRoles = await prisma.userRole.findMany({
    where: { userId, orgId },
    include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
  });
  const keys = new Set<string>();
  for (const ur of userRoles) {
    for (const rp of ur.role.rolePermissions) keys.add(rp.permission.key);
  }
  return keys;
});

export async function hasPermission(key: PermissionKey): Promise<boolean> {
  const { session, orgId, userId } = await requireOrg();
  if (session.user.isSuperAdmin) return true;
  const perms = await getUserPermissions(userId, orgId);
  return perms.has(key);
}

/**
 * Wirft, wenn die Permission fehlt. In jeder geschützten Server-Action
 * am Anfang aufrufen.
 */
export async function requirePermission(key: PermissionKey) {
  const ctx = await requireOrg();
  if (ctx.session.user.isSuperAdmin) return ctx;
  const perms = await getUserPermissions(ctx.userId, ctx.orgId);
  if (!perms.has(key)) throw new Error(`FORBIDDEN: ${key}`);
  return ctx;
}
