import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireOrg } from "@/lib/tenant";
import { getUserPermissions } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { parseListParams } from "@/lib/list/query";
import { toCSV, csvResponse, spToRecord } from "@/lib/export/csv";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let orgId: string;
  try {
    ({ orgId } = await requireOrg());
  } catch {
    return NextResponse.json({ error: "no org" }, { status: 403 });
  }

  const perms = session.user.isSuperAdmin
    ? new Set(Object.values(PERMISSIONS))
    : await getUserPermissions(session.user.id, orgId);
  if (!perms.has(PERMISSIONS.USER_VIEW)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const p = parseListParams(spToRecord(sp), { filterKeys: ["status"] });

  const where: Prisma.MembershipWhereInput = {
    orgId,
    ...(p.filters.status ? { status: p.filters.status as Prisma.MembershipWhereInput["status"] } : {}),
    user: { deletedAt: null, ...(p.search ? { OR: [{ name: { contains: p.search } }, { email: { contains: p.search } }] } : {}) },
  };

  const memberships = await prisma.membership.findMany({ where, take: 5000, include: { user: true } });
  const userIds = memberships.map((m) => m.userId);
  const userRoles = await prisma.userRole.findMany({ where: { orgId, userId: { in: userIds } }, include: { role: true } });
  const rolesByUser = new Map<string, string[]>();
  for (const ur of userRoles) {
    const arr = rolesByUser.get(ur.userId) ?? [];
    arr.push(ur.role.name);
    rolesByUser.set(ur.userId, arr);
  }

  const csv = toCSV(
    ["Name", "E-Mail", "Rollen", "Status", "E-Mail bestätigt"],
    memberships.map((m) => [
      m.user.name ?? "",
      m.user.email,
      (rolesByUser.get(m.userId) ?? []).join(", "),
      m.status,
      m.user.emailVerified ? "ja" : "nein",
    ]),
  );
  return csvResponse("mitglieder.csv", csv);
}
