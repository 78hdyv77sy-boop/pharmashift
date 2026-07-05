import { prisma } from "@/lib/prisma";
import {
  type ListParams,
  type ListResult,
  paginate,
  computeTotalPages,
  buildOrderBy,
} from "@/lib/list/query";
import type { Prisma } from "@prisma/client";

export interface MemberRow {
  userId: string;
  name: string | null;
  email: string;
  status: string;
  emailVerified: boolean;
  roles: { id: string; name: string }[];
  createdAt: Date;
}

export async function listOrgMembers(orgId: string, p: ListParams): Promise<ListResult<MemberRow>> {
  const status = p.filters.status;
  const where: Prisma.MembershipWhereInput = {
    orgId,
    ...(status ? { status: status as "ACTIVE" | "INVITED" | "SUSPENDED" } : {}),
    user: {
      deletedAt: null,
      ...(p.search
        ? { OR: [{ name: { contains: p.search } }, { email: { contains: p.search } }] }
        : {}),
    },
  };

  const orderBy = buildOrderBy(
    p,
    { name: ["user", "name"], email: ["user", "email"], createdAt: "createdAt" },
    { createdAt: "desc" },
  ) as Prisma.MembershipOrderByWithRelationInput;

  const { skip, take } = paginate(p);

  const [memberships, total] = await Promise.all([
    prisma.membership.findMany({ where, orderBy, skip, take, include: { user: true } }),
    prisma.membership.count({ where }),
  ]);

  const userIds = memberships.map((m) => m.userId);
  const userRoles = await prisma.userRole.findMany({
    where: { orgId, userId: { in: userIds } },
    include: { role: true },
  });
  const rolesByUser = new Map<string, { id: string; name: string }[]>();
  for (const ur of userRoles) {
    const arr = rolesByUser.get(ur.userId) ?? [];
    arr.push({ id: ur.role.id, name: ur.role.name });
    rolesByUser.set(ur.userId, arr);
  }

  const rows: MemberRow[] = memberships.map((m) => ({
    userId: m.userId,
    name: m.user.name,
    email: m.user.email,
    status: m.status,
    emailVerified: !!m.user.emailVerified,
    roles: rolesByUser.get(m.userId) ?? [],
    createdAt: m.createdAt,
  }));

  return { rows, total, page: p.page, pageSize: p.pageSize, totalPages: computeTotalPages(total, p.pageSize) };
}

export async function getOrgRoles(orgId: string) {
  return prisma.role.findMany({ where: { orgId }, orderBy: { name: "asc" }, select: { id: true, name: true } });
}
