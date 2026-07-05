import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireOrg } from "@/lib/tenant";
import { getUserPermissions } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { listRoles } from "@/lib/roles";
import { parseListParams } from "@/lib/list/query";
import { RolesTable } from "./roles-table";
import { CreateRoleDialog } from "./create-role-dialog";

export default async function RolesPage({
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

  if (!perms.has(PERMISSIONS.ROLE_MANAGE)) {
    return <p className="text-sm text-destructive">Keine Berechtigung für die Rollenverwaltung.</p>;
  }

  const sp = await searchParams;
  const params = parseListParams(sp, { defaultSort: "name", defaultDir: "asc" });
  const data = await listRoles(orgId, params);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Rollen &amp; Berechtigungen</h1>
          <p className="text-sm text-muted-foreground">Definiere Rollen und steuere granular die Zugriffe.</p>
        </div>
        <CreateRoleDialog />
      </div>

      <RolesTable
        rows={data.rows}
        total={data.total}
        page={data.page}
        pageSize={data.pageSize}
        totalPages={data.totalPages}
        sort={params.sort}
        dir={params.dir}
        search={params.search}
      />
    </div>
  );
}
