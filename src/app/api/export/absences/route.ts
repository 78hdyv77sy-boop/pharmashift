import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireOrg } from "@/lib/tenant";
import { getUserPermissions } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { parseListParams } from "@/lib/list/query";
import { toCSV, csvResponse, spToRecord } from "@/lib/export/csv";
import { ABSENCE_TYPE_LABEL, ABSENCE_STATUS_LABEL } from "@/lib/domain/absence-types";
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
  if (!perms.has(PERMISSIONS.SHIFT_VIEW) && !perms.has(PERMISSIONS.ABSENCE_APPROVE) && !perms.has(PERMISSIONS.ABSENCE_REQUEST)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const sp = new URL(req.url).searchParams;
  const p = parseListParams(spToRecord(sp), { filterKeys: ["status", "type"], defaultSort: "startDate", defaultDir: "desc" });

  const where: Prisma.AbsenceWhereInput = {
    employee: { orgId, ...(p.search ? { OR: [{ firstName: { contains: p.search } }, { lastName: { contains: p.search } }] } : {}) },
    ...(p.filters.status ? { status: p.filters.status as Prisma.AbsenceWhereInput["status"] } : {}),
    ...(p.filters.type ? { type: p.filters.type as Prisma.AbsenceWhereInput["type"] } : {}),
  };

  const absences = await prisma.absence.findMany({
    where, take: 5000, orderBy: { startDate: "desc" }, include: { employee: true },
  });

  const csv = toCSV(
    ["Mitarbeiter", "Von", "Bis", "Typ", "Status", "Notiz"],
    absences.map((a) => [
      `${a.employee.firstName} ${a.employee.lastName}`,
      a.startDate.toISOString().slice(0, 10),
      a.endDate.toISOString().slice(0, 10),
      ABSENCE_TYPE_LABEL[a.type] ?? a.type,
      ABSENCE_STATUS_LABEL[a.status] ?? a.status,
      a.note ?? "",
    ]),
  );
  return csvResponse("abwesenheiten.csv", csv);
}
