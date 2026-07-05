import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireOrg } from "@/lib/tenant";
import { getUserPermissions } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { parseListParams, buildOrderBy } from "@/lib/list/query";
import { toCSV, csvResponse, spToRecord } from "@/lib/export/csv";
import { EMPLOYEE_TYPE_LABEL } from "@/lib/domain/employee-types";
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
  if (!perms.has(PERMISSIONS.EMPLOYEE_VIEW) && !perms.has(PERMISSIONS.EMPLOYEE_MANAGE)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const sp = new URL(req.url).searchParams;
  const p = parseListParams(spToRecord(sp), { filterKeys: ["type", "locationId", "active"], defaultSort: "lastName", defaultDir: "asc" });

  const where: Prisma.EmployeeWhereInput = {
    orgId,
    deletedAt: null,
    ...(p.filters.type ? { type: p.filters.type as Prisma.EmployeeWhereInput["type"] } : {}),
    ...(p.filters.locationId ? { locationId: p.filters.locationId } : {}),
    ...(p.filters.active ? { active: p.filters.active === "true" } : {}),
    ...(p.search ? { OR: [{ firstName: { contains: p.search } }, { lastName: { contains: p.search } }] } : {}),
  };
  const orderBy = buildOrderBy(p, { lastName: "lastName", firstName: "firstName", type: "type" }, { lastName: "asc" }) as Prisma.EmployeeOrderByWithRelationInput;

  const employees = await prisma.employee.findMany({
    where, orderBy, take: 5000,
    include: { location: true, _count: { select: { qualifications: true } } },
  });

  const csv = toCSV(
    ["Nachname", "Vorname", "Typ", "Standort", "Wochenstunden", "Qualifikationen", "Aktiv"],
    employees.map((e) => [
      e.lastName, e.firstName, EMPLOYEE_TYPE_LABEL[e.type] ?? e.type,
      e.location?.name ?? "", e.weeklyHoursTarget ?? 0, e._count.qualifications, e.active ? "ja" : "nein",
    ]),
  );
  return csvResponse("mitarbeiter.csv", csv);
}
