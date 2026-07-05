import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireOrg } from "@/lib/tenant";
import { getUserPermissions } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getEmployeeAvailabilities } from "@/lib/domain/availability";
import { AvailabilityManager } from "./availability-manager";

export default async function AvailabilityPage({
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
  if (!perms.has(PERMISSIONS.EMPLOYEE_VIEW) && !perms.has(PERMISSIONS.EMPLOYEE_MANAGE)) {
    return <p className="text-sm text-destructive">Keine Berechtigung.</p>;
  }

  const employees = await prisma.employee.findMany({
    where: { orgId, deletedAt: null, active: true },
    orderBy: { lastName: "asc" },
    select: { id: true, firstName: true, lastName: true },
  });

  if (employees.length === 0) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Verfügbarkeiten</h1>
        <p className="text-sm text-muted-foreground">Lege zuerst unter „Mitarbeiter" Personen an.</p>
      </div>
    );
  }

  const sp = await searchParams;
  const employeeId = (typeof sp.employeeId === "string" && employees.some((e) => e.id === sp.employeeId)) ? sp.employeeId : employees[0].id;
  const rows = await getEmployeeAvailabilities(orgId, employeeId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Verfügbarkeiten</h1>
        <p className="text-sm text-muted-foreground">Wiederkehrende oder einmalige Verfügbarkeiten je Mitarbeiter:in pflegen.</p>
      </div>
      <AvailabilityManager
        employees={employees.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}` }))}
        employeeId={employeeId}
        rows={rows}
        canManage={perms.has(PERMISSIONS.EMPLOYEE_MANAGE)}
      />
    </div>
  );
}
