import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireOrg } from "@/lib/tenant";
import { getUserPermissions } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getWeekData } from "@/lib/domain/shifts";
import { findWeekConflicts } from "@/lib/domain/solver-source";
import { listTemplates } from "@/lib/domain/templates";
import { mondayOf, todayISO } from "@/lib/domain/dates";
import { ShiftCalendar } from "./shift-calendar";

export default async function ShiftsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  let orgId: string;
  try {
    ({ orgId } = await requireOrg());
  } catch {
    return <p className="text-sm text-muted-foreground">Keine aktive Organisation.</p>;
  }

  const perms = session.user.isSuperAdmin
    ? new Set(Object.values(PERMISSIONS))
    : await getUserPermissions(session.user.id, orgId);
  if (!perms.has(PERMISSIONS.SHIFT_VIEW)) {
    return <p className="text-sm text-destructive">Keine Berechtigung für den Dienstplan.</p>;
  }

  const locations = await prisma.location.findMany({
    where: { orgId, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  if (locations.length === 0) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Dienstplan</h1>
        <p className="text-sm text-muted-foreground">Lege zuerst unter „Standorte" eine Filiale an.</p>
      </div>
    );
  }

  const sp = await searchParams;
  const locationId = (typeof sp.locationId === "string" && locations.some((l) => l.id === sp.locationId))
    ? sp.locationId
    : locations[0].id;
  const week = mondayOf(typeof sp.week === "string" ? sp.week : todayISO());

  const data = await getWeekData(orgId, locationId, week);
  const templates = await listTemplates(orgId);
  const canManage = perms.has(PERMISSIONS.SHIFT_MANAGE) || perms.has(PERMISSIONS.SHIFT_CREATE);
  // AZG-Konflikte der Woche nur für Verwalter:innen berechnen (für das Banner)
  const conflicts = perms.has(PERMISSIONS.SHIFT_MANAGE)
    ? await findWeekConflicts(orgId, locationId, week)
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dienstplan</h1>
        <p className="text-sm text-muted-foreground">Wochenansicht je Standort – Schichten anlegen und Mitarbeiter zuweisen.</p>
      </div>
      <ShiftCalendar
        locations={locations}
        locationId={locationId}
        weekStart={week}
        data={data}
        canManage={canManage}
        canPlan={perms.has(PERMISSIONS.PLAN_MANAGE)}
        canPublish={perms.has(PERMISSIONS.PLAN_PUBLISH)}
        templates={templates}
        conflicts={conflicts}
      />
    </div>
  );
}
