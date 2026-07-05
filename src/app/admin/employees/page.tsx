import { redirect } from "next/navigation";
import Link from "next/link";
import { Upload } from "lucide-react";
import { auth } from "@/lib/auth";
import { requireOrg } from "@/lib/tenant";
import { getUserPermissions } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { listEmployees, getOrgMasterData } from "@/lib/domain/employees";
import { parseListParams } from "@/lib/list/query";
import { EmployeesTable } from "./employees-table";

export default async function EmployeesPage({
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
  const canView = perms.has(PERMISSIONS.EMPLOYEE_VIEW) || perms.has(PERMISSIONS.EMPLOYEE_MANAGE);
  if (!canView) return <p className="text-sm text-destructive">Keine Berechtigung für Mitarbeiter.</p>;

  const sp = await searchParams;
  const params = parseListParams(sp, { filterKeys: ["type", "locationId", "active"], defaultSort: "lastName", defaultDir: "asc" });
  const [data, master] = await Promise.all([listEmployees(orgId, params), getOrgMasterData(orgId)]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Mitarbeiter</h1>
          <p className="text-sm text-muted-foreground">Team, Qualifikationen und Zuständigkeiten – Basis für die Dienstplanung.</p>
        </div>
        {perms.has(PERMISSIONS.EMPLOYEE_MANAGE) && (
          <Link
            href="/admin/employees/import"
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent"
          >
            <Upload className="h-4 w-4" /> CSV-Import
          </Link>
        )}
      </div>

      <EmployeesTable
        rows={data.rows}
        total={data.total}
        page={data.page}
        pageSize={data.pageSize}
        totalPages={data.totalPages}
        sort={params.sort}
        dir={params.dir}
        search={params.search}
        activeFilters={params.filters}
        master={master}
        canManage={perms.has(PERMISSIONS.EMPLOYEE_MANAGE)}
      />
    </div>
  );
}
