import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireOrg } from "@/lib/tenant";
import { getUserPermissions } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { MediaGrid } from "./media-grid";

export default async function MediaPage() {
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
  if (!perms.has(PERMISSIONS.CMS_MEDIA_MANAGE)) {
    return <p className="text-sm text-destructive">Keine Berechtigung für Medien.</p>;
  }

  const media = await prisma.media.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    select: { id: true, url: true, alt: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Medien</h1>
        <p className="text-sm text-muted-foreground">Bilder zentral verwalten und in Blöcken verwenden.</p>
      </div>
      <MediaGrid initial={media} />
    </div>
  );
}
