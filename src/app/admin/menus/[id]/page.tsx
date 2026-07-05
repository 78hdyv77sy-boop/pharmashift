import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { requireOrg } from "@/lib/tenant";
import { getUserPermissions } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { getMenuWithItems } from "@/lib/cms/menus";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { MenuEditor } from "./menu-editor";
import { deleteMenu } from "../actions";

export default async function MenuEditorRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  const menu = await getMenuWithItems(orgId, id);
  if (!menu) notFound();

  const pages = await prisma.page.findMany({
    where: { orgId },
    orderBy: { title: "asc" },
    select: { id: true, title: true, slug: true },
  });

  // DB-Items -> Editor-Items (dbId als clientId; parentId als parentClientId)
  const initialItems = menu.items.map((it) => ({
    clientId: it.id,
    parentClientId: it.parentId ?? null,
    label: it.label,
    linkType: (it.pageId ? "page" : "url") as "page" | "url",
    pageId: it.pageId,
    href: it.href,
    target: it.target,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin/menus" className="text-sm text-muted-foreground hover:underline">← Alle Menüs</Link>
          <h1 className="text-2xl font-semibold">{menu.name} <span className="text-base font-normal text-muted-foreground">/{menu.slug}</span></h1>
        </div>
        <form
          action={async () => {
            "use server";
            await deleteMenu(id);
            redirect("/admin/menus");
          }}
        >
          <Button variant="ghost" size="sm" className="text-destructive">Menü löschen</Button>
        </form>
      </div>

      <MenuEditor menuId={menu.id} pages={pages} initialItems={initialItems} />
    </div>
  );
}
