import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireOrg } from "@/lib/tenant";
import { getUserPermissions } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { ImportClient } from "./import-client";

export default async function EmployeeImportPage() {
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
  if (!perms.has(PERMISSIONS.EMPLOYEE_MANAGE)) {
    return <p className="text-sm text-destructive">Keine Berechtigung zum Importieren.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Mitarbeiter importieren</h1>
        <p className="text-sm text-muted-foreground">Mehrere Mitarbeiter per CSV anlegen – mit Vorschau und Validierung.</p>
      </div>
      <ImportClient />
    </div>
  );
}
