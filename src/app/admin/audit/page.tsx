import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireOrg } from "@/lib/tenant";
import { getUserPermissions } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { listAuditLogs } from "@/lib/domain/audit";
import { parseListParams } from "@/lib/list/query";
import { AuditTable } from "./audit-table";

export default async function AuditPage({
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
  if (!perms.has(PERMISSIONS.ORG_MANAGE)) {
    return <p className="text-sm text-destructive">Nur für Organisations-Administratoren.</p>;
  }

  const sp = await searchParams;
  const params = parseListParams(sp, { filterKeys: ["entity"], defaultSort: "createdAt", defaultDir: "desc" });
  const data = await listAuditLogs(orgId, params);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Audit-Log</h1>
        <p className="text-sm text-muted-foreground">Protokoll sicherheits- und planungsrelevanter Aktionen in dieser Organisation.</p>
      </div>
      <AuditTable
        rows={data.rows}
        total={data.total}
        page={data.page}
        pageSize={data.pageSize}
        totalPages={data.totalPages}
        sort={params.sort}
        dir={params.dir}
        search={params.search}
        activeFilters={params.filters}
      />
    </div>
  );
}
