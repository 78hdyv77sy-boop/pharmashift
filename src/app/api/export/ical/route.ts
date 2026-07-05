import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireOrg } from "@/lib/tenant";
import { getUserPermissions } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { dateAtUTC, addDays, mondayOf, todayISO } from "@/lib/domain/dates";
import { buildICalendar, icalResponse, type ICalEvent } from "@/lib/export/ical";

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
  if (!perms.has(PERMISSIONS.SHIFT_VIEW)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const locationId = sp.get("locationId") ?? "";
  const week = mondayOf(sp.get("week") ?? todayISO());

  const loc = await prisma.location.findFirst({ where: { id: locationId, orgId }, select: { id: true, name: true } });
  if (!loc) return NextResponse.json({ error: "unknown location" }, { status: 404 });

  const start = dateAtUTC(week);
  const end = dateAtUTC(addDays(week, 7));
  const shifts = await prisma.shift.findMany({
    where: { orgId, locationId, deletedAt: null, date: { gte: start, lt: end } },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    include: { assignments: { include: { employee: true } } },
  });

  const events: ICalEvent[] = shifts.map((s) => {
    const names = s.assignments.map((a) => `${a.employee.firstName} ${a.employee.lastName}`);
    return {
      uid: `${s.id}@pharmashift`,
      dateISO: s.date.toISOString().slice(0, 10),
      startTime: s.startTime,
      endTime: s.endTime,
      summary: `Schicht ${loc.name}` + (names.length ? ` (${names.length})` : ""),
      description: names.length ? `Eingeteilt: ${names.join(", ")}` : "Keine Zuweisung",
      location: loc.name,
    };
  });

  const ics = buildICalendar(`PharmaShift – ${loc.name}`, events);
  return icalResponse(`dienstplan-${week}.ics`, ics);
}
