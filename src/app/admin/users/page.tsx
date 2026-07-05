import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireOrg } from "@/lib/tenant";
import { getUserPermissions } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { listOrgMembers, getOrgRoles } from "@/lib/users";
import { parseListParams } from "@/lib/list/query";
import { InviteDialog } from "./invite-dialog";
import { UsersTable } from "./users-table";

export default async function UsersPage({
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

  if (!perms.has(PERMISSIONS.USER_VIEW)) {
    return <p className="text-sm text-destructive">Keine Berechtigung für die Userverwaltung.</p>;
  }

  const sp = await searchParams;
  const params = parseListParams(sp, { filterKeys: ["status"], defaultSort: "createdAt", defaultDir: "desc" });

  const [data, roles] = await Promise.all([listOrgMembers(orgId, params), getOrgRoles(orgId)]);
  const canInvite = perms.has(PERMISSIONS.USER_INVITE);
  const canManage = perms.has(PERMISSIONS.USER_MANAGE);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Userverwaltung</h1>
          <p className="text-sm text-muted-foreground">Mitglieder dieser Organisation, Rollen und Status.</p>
        </div>
        {canInvite && <InviteDialog roles={roles} />}
      </div>

      <UsersTable
        rows={data.rows}
        total={data.total}
        page={data.page}
        pageSize={data.pageSize}
        totalPages={data.totalPages}
        sort={params.sort}
        dir={params.dir}
        search={params.search}
        activeFilters={params.filters}
        roles={roles}
        currentUserId={session.user.id}
        canManage={canManage}
      />
    </div>
  );
}
