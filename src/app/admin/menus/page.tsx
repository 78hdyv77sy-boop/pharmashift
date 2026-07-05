import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { requireOrg } from "@/lib/tenant";
import { getUserPermissions } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { listMenus } from "@/lib/cms/menus";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateMenuDialog } from "./create-menu-dialog";

export default async function MenusPage() {
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
  if (!perms.has(PERMISSIONS.CMS_MENU_EDIT)) {
    return <p className="text-sm text-destructive">Keine Berechtigung für Menüs.</p>;
  }

  const menus = await listMenus(orgId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Menüs</h1>
          <p className="text-sm text-muted-foreground">Navigation für das Frontend (z. B. main, footer).</p>
        </div>
        <CreateMenuDialog />
      </div>

      {menus.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Noch keine Menüs. Lege z. B. „main" und „footer" an.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {menus.map((m) => (
            <Link key={m.id} href={`/admin/menus/${m.id}`}>
              <Card className="transition-colors hover:bg-muted/40">
                <CardHeader className="pb-2"><CardTitle className="text-base">{m.name}</CardTitle></CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  <code>/{m.slug}</code> · {m._count.items} Einträge
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
