import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireOrg } from "@/lib/tenant";
import { getUserPermissions } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { listAbsences } from "@/lib/domain/absences";
import { parseListParams } from "@/lib/list/query";
import { AbsencesTable } from "./absences-table";

export default async function AbsencesPage({
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
  const canView = perms.has(PERMISSIONS.SHIFT_VIEW) || perms.has(PERMISSIONS.ABSENCE_APPROVE) || perms.has(PERMISSIONS.ABSENCE_REQUEST);
  if (!canView) return <p className="text-sm text-destructive">Keine Berechtigung.</p>;

  const sp = await searchParams;
  const params = parseListParams(sp, { filterKeys: ["status", "type"], defaultSort: "startDate", defaultDir: "desc" });

  const [data, employees] = await Promise.all([
    listAbsences(orgId, params),
    prisma.employee.findMany({ where: { orgId, deletedAt: null, active: true }, orderBy: { lastName: "asc" }, select: { id: true, firstName: true, lastName: true } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Abwesenheiten</h1>
        <p className="text-sm text-muted-foreground">Urlaub, Krankheit & Co. – Anträge und Genehmigungen.</p>
      </div>
      <AbsencesTable
        rows={data.rows}
        total={data.total}
        page={data.page}
        pageSize={data.pageSize}
        totalPages={data.totalPages}
        sort={params.sort}
        dir={params.dir}
        search={params.search}
        activeFilters={params.filters}
        employees={employees.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}` }))}
        canRequest={perms.has(PERMISSIONS.ABSENCE_REQUEST) || perms.has(PERMISSIONS.ABSENCE_APPROVE)}
        canApprove={perms.has(PERMISSIONS.ABSENCE_APPROVE)}
      />
    </div>
  );
}
