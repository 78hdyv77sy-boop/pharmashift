import { prisma } from "@/lib/prisma";
import {
  type ListParams,
  type ListResult,
  paginate,
  computeTotalPages,
  buildOrderBy,
} from "@/lib/list/query";
import type { Prisma } from "@prisma/client";

export interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissionCount: number;
  memberCount: number;
}

export async function listRoles(orgId: string, p: ListParams): Promise<ListResult<RoleRow>> {
  const where: Prisma.RoleWhereInput = {
    orgId,
    ...(p.search ? { name: { contains: p.search } } : {}),
  };
  const orderBy = buildOrderBy(p, { name: "name" }, { name: "asc" }) as Prisma.RoleOrderByWithRelationInput;
  const { skip, take } = paginate(p);

  const [roles, total] = await Promise.all([
    prisma.role.findMany({
      where,
      orderBy,
      skip,
      take,
      include: { _count: { select: { rolePermissions: true, userRoles: true } } },
    }),
    prisma.role.count({ where }),
  ]);

  const rows: RoleRow[] = roles.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    permissionCount: r._count.rolePermissions,
    memberCount: r._count.userRoles,
  }));

  return { rows, total, page: p.page, pageSize: p.pageSize, totalPages: computeTotalPages(total, p.pageSize) };
}

export async function getRolePermissionKeys(orgId: string, roleId: string): Promise<string[] | null> {
  const role = await prisma.role.findFirst({
    where: { id: roleId, orgId },
    include: { rolePermissions: { include: { permission: true } } },
  });
  if (!role) return null;
  return role.rolePermissions.map((rp) => rp.permission.key);
}
