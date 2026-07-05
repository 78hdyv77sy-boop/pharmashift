import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireOrg } from "@/lib/tenant";
import { getUserPermissions } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { listPages } from "@/lib/cms/pages";
import { parseListParams } from "@/lib/list/query";
import { PagesTable } from "./pages-table";
import { CreatePageDialog } from "./create-page-dialog";

export default async function PagesPage({
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

  const canView = perms.has(PERMISSIONS.CMS_PAGE_VIEW) || perms.has(PERMISSIONS.CMS_PAGE_EDIT);
  if (!canView) return <p className="text-sm text-destructive">Keine Berechtigung für das CMS.</p>;

  const sp = await searchParams;
  const params = parseListParams(sp, { filterKeys: ["status"], defaultSort: "updatedAt", defaultDir: "desc" });
  const data = await listPages(orgId, params);
  const canEdit = perms.has(PERMISSIONS.CMS_PAGE_EDIT);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Seiten</h1>
          <p className="text-sm text-muted-foreground">Alle Inhalte werden hier gepflegt – nichts ist hartcodiert.</p>
        </div>
        {canEdit && <CreatePageDialog />}
      </div>

      <PagesTable
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
