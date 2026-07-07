import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireOrg } from "@/lib/tenant";
import { getUserPermissions } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { NewsFeed } from "./news-feed";

export default async function NewsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  let orgId: string;
  try {
    ({ orgId } = await requireOrg());
  } catch {
    return <p className="p-6 text-sm text-muted-foreground">Keine aktive Organisation.</p>;
  }
  const perms = session.user.isSuperAdmin
    ? new Set(Object.values(PERMISSIONS))
    : await getUserPermissions(session.user.id, orgId);
  if (!perms.has(PERMISSIONS.NEWS_VIEW)) return <p className="p-6 text-sm text-destructive">Keine Berechtigung.</p>;

  const me = await prisma.employee.findFirst({
    where: { orgId, userId: session.user.id, deletedAt: null },
    select: { locationId: true },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Neuigkeiten</h1>
        <p className="text-sm text-muted-foreground">Das Schwarze Brett deiner Apotheke – Beiträge, Dateien, Umfragen.</p>
      </div>
      <NewsFeed canPost={perms.has(PERMISSIONS.NEWS_POST)} myLocationId={me?.locationId ?? null} />
    </div>
  );
}
