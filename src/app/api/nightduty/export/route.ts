import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireOrg } from "@/lib/tenant";
import { getUserPermissions } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { toCSV, csvResponse } from "@/lib/export/csv";

export const runtime = "nodejs";

// Cent -> "12,34" (deutsches Dezimalkomma, ohne €-Zeichen für CSV-Weiterverarbeitung)
function eur(cent: number): string {
  return (cent / 100).toFixed(2).replace(".", ",");
}

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
  if (!perms.has(PERMISSIONS.NIGHTDUTY_USE)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const viewAll = perms.has(PERMISSIONS.NIGHTDUTY_VIEW_ALL);

  // Monat aus ?month=YYYY-MM
  const sp = new URL(req.url).searchParams;
  const month = sp.get("month") ?? "";
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return NextResponse.json({ error: "month=YYYY-MM erforderlich" }, { status: 400 });
  const year = Number(m[1]);
  const mon = Number(m[2]);
  const start = new Date(year, mon - 1, 1);
  const end = new Date(year, mon, 1);

  // eigener Mitarbeiter (falls nicht viewAll)
  let selfEmployeeId: string | null = null;
  if (!viewAll) {
    const me = await prisma.employee.findFirst({
      where: { orgId, userId: session.user.id, deletedAt: null },
      select: { id: true },
    });
    selfEmployeeId = me?.id ?? "__none__";
  }

  const duties = await prisma.nightDuty.findMany({
    where: {
      orgId,
      date: { gte: start, lt: end },
      ...(selfEmployeeId ? { employeeId: selfEmployeeId } : {}),
    },
    include: { employee: { select: { firstName: true, lastName: true } }, customers: true },
    orderBy: { date: "asc" },
  });

  const rows = duties.map((d) => {
    const n1444 = d.customers.filter((c) => c.tier === "NACHT_1444");
    const a652 = d.customers.filter((c) => c.tier === "ABEND_652");
    const t332 = d.customers.filter((c) => c.tier === "TAG_332");
    const ianSum = d.customers.reduce((s, c) => s + c.baseAmount + c.bonusAmount, 0);
    const pauschale = d.baseWage + d.nightBonus;
    return [
      d.date.toLocaleDateString("de-AT"),
      `${d.employee.firstName} ${d.employee.lastName}`,
      `${d.startTime}-${d.endTime}`,
      eur(pauschale),
      String(t332.length),
      String(a652.length),
      String(n1444.length),
      String(d.customers.length),
      eur(ianSum),
      eur(pauschale + ianSum),
    ];
  });

  const csv = toCSV(
    [
      "Datum", "Apotheker:in", "Dienstzeit", "Pauschale €",
      "IAN 3,32", "IAN 6,52", "IAN 14,44", "Kunden gesamt",
      "Inanspruchnahmen €", "Gesamt €",
    ],
    rows,
  );
  return csvResponse(`nachtdienste-${month}.csv`, csv);
}
