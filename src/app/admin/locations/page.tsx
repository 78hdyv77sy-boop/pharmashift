import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireOrg } from "@/lib/tenant";
import { getUserPermissions } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { LocationsClient } from "./locations-client";

export default async function LocationsPage() {
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
  const canManage = perms.has(PERMISSIONS.LOCATION_MANAGE);
  if (!canManage && !perms.has(PERMISSIONS.EMPLOYEE_VIEW)) {
    return <p className="text-sm text-destructive">Keine Berechtigung für Standorte.</p>;
  }

  const locations = await prisma.location.findMany({
    where: { orgId, deletedAt: null },
    orderBy: { name: "asc" },
    include: { _count: { select: { employees: true } } },
  });

  const rows = locations.map((l) => ({
    id: l.id,
    name: l.name,
    address: l.address,
    isEmergency: l.isEmergency,
    employeeCount: l._count.employees,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Standorte</h1>
        <p className="text-sm text-muted-foreground">Filialen der Organisation – inkl. Notdienst-Teilnahme.</p>
      </div>
      <LocationsClient initial={rows} canManage={canManage} />
    </div>
  );
}
