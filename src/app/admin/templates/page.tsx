import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireOrg } from "@/lib/tenant";
import { getUserPermissions } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { listTemplates } from "@/lib/domain/templates";
import { TemplatesManager } from "./templates-manager";

export default async function TemplatesPage() {
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
  if (!perms.has(PERMISSIONS.SHIFT_VIEW) && !perms.has(PERMISSIONS.SHIFT_MANAGE)) {
    return <p className="text-sm text-destructive">Keine Berechtigung.</p>;
  }

  const [rows, locations] = await Promise.all([
    listTemplates(orgId),
    prisma.location.findMany({ where: { orgId, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Schicht-Vorlagen</h1>
        <p className="text-sm text-muted-foreground">Wiederverwendbare Schicht-Definitionen – im Dienstplan per „Aus Vorlagen" auf eine Woche anwenden.</p>
      </div>
      <TemplatesManager rows={rows} locations={locations} canManage={perms.has(PERMISSIONS.SHIFT_MANAGE)} />
    </div>
  );
}
