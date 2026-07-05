import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireOrg } from "@/lib/tenant";
import { getUserPermissions } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { TagManager } from "./tag-manager";
import { addQualification, deleteQualification, addResponsibility, deleteResponsibility } from "./actions";

export default async function MasterDataPage() {
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
  if (!canView) return <p className="text-sm text-destructive">Keine Berechtigung.</p>;
  const canManage = perms.has(PERMISSIONS.EMPLOYEE_MANAGE);

  const [qualifications, responsibilities] = await Promise.all([
    prisma.qualification.findMany({ where: { orgId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.responsibility.findMany({ where: { orgId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Stammdaten</h1>
        <p className="text-sm text-muted-foreground">Qualifikationen und Zuständigkeiten für die Mitarbeiterprofile.</p>
      </div>

      <TagManager
        title="Qualifikationen"
        description="z. B. Approbation, Notdienst-Erlaubnis, BtM-Berechtigung."
        items={qualifications}
        canManage={canManage}
        onAdd={addQualification}
        onDelete={deleteQualification}
      />
      <TagManager
        title="Zuständigkeiten"
        description="z. B. Rezeptur, Bestellwesen, Kasse, Beratung."
        items={responsibilities}
        canManage={canManage}
        onAdd={addResponsibility}
        onDelete={deleteResponsibility}
      />
    </div>
  );
}
