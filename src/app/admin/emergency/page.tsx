import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireOrg } from "@/lib/tenant";
import { getUserPermissions } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getEmergencyData } from "@/lib/domain/emergency";
import { EmergencyCalendar } from "./emergency-calendar";

export default async function EmergencyPage({
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
    return <p className="text-sm text-destructive">Keine Berechtigung für den Notdienst.</p>;
  }

  const locations = await prisma.location.findMany({
    where: { orgId, deletedAt: null, isEmergency: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  if (locations.length === 0) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Notdienst</h1>
        <p className="text-sm text-muted-foreground">Markiere zuerst unter „Standorte" eine Filiale als Notdienst-Standort (Schalter „nimmt am Notdienst teil").</p>
      </div>
    );
  }

  const sp = await searchParams;
  const now = new Date();
  const locationId = (typeof sp.locationId === "string" && locations.some((l) => l.id === sp.locationId)) ? sp.locationId : locations[0].id;
  const year = typeof sp.year === "string" ? Number(sp.year) : now.getUTCFullYear();
  const month1 = typeof sp.month === "string" ? Number(sp.month) : now.getUTCMonth() + 1;

  const data = await getEmergencyData(orgId, locationId, year, month1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Notdienst</h1>
        <p className="text-sm text-muted-foreground">Monatsweise Notdienst-Rotation je Standort – manuell zuweisen oder automatisch verteilen.</p>
      </div>
      <EmergencyCalendar
        locations={locations}
        locationId={locationId}
        year={year}
        month1={month1}
        data={data}
        canManage={perms.has(PERMISSIONS.PLAN_MANAGE)}
      />
    </div>
  );
}
