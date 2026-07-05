import { prisma } from "@/lib/prisma";
import { SYSTEM_ROLES } from "@/lib/permissions";

/**
 * Legt für eine frisch erstellte Organisation die Default-Rollen
 * (OrgAdmin, Manager, Mitarbeiter, Viewer) inkl. ihrer Permissions an.
 * Gibt die Role-ID von "OrgAdmin" zurück.
 */
export async function provisionOrgRoles(orgId: string): Promise<string> {
  let orgAdminRoleId = "";

  for (const [roleName, permKeys] of Object.entries(SYSTEM_ROLES)) {
    const role = await prisma.role.create({
      data: { orgId, name: roleName, isSystem: true, description: `${roleName} (System)` },
    });
    if (roleName === "OrgAdmin") orgAdminRoleId = role.id;

    const permissions = await prisma.permission.findMany({ where: { key: { in: permKeys } } });
    if (permissions.length) {
      await prisma.rolePermission.createMany({
        data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
        skipDuplicates: true,
      });
    }
  }
  return orgAdminRoleId;
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 48);
}

/** Erzeugt einen eindeutigen Org-Slug. */
export async function uniqueOrgSlug(name: string): Promise<string> {
  const base = slugify(name) || "org";
  let slug = base;
  let i = 1;
  while (await prisma.organization.findUnique({ where: { slug } })) {
    slug = `${base}-${i++}`;
  }
  return slug;
}
