import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { requireOrg } from "@/lib/tenant";
import { getUserPermissions } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { getPageWithBlocks } from "@/lib/cms/pages";
import { prisma } from "@/lib/prisma";
import { PageMetaForm } from "./page-meta-form";
import { PageEditor } from "./page-editor";

export default async function PageEditorRoute({ params }: { params: Promise<{ id: string }> }) {
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
  if (!perms.has(PERMISSIONS.CMS_PAGE_EDIT)) {
    return <p className="text-sm text-destructive">Keine Berechtigung für das CMS.</p>;
  }

  const page = await getPageWithBlocks(orgId, id);
  if (!page) notFound();

  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { slug: true } });
  const seo = (page.seo as { metaTitle?: string; metaDescription?: string } | null) ?? {};

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/pages" className="text-sm text-muted-foreground hover:underline">← Alle Seiten</Link>
          <h1 className="text-2xl font-semibold">{page.title}</h1>
        </div>
        {page.status === "PUBLISHED" && org && (
          <Link
            href={`/${org.slug}/${page.slug}`}
            target="_blank"
            className="text-sm text-primary hover:underline"
          >
            Live ansehen ↗
          </Link>
        )}
      </div>

      <PageMetaForm
        pageId={page.id}
        initial={{
          title: page.title,
          slug: page.slug,
          status: page.status,
          metaTitle: seo.metaTitle ?? "",
          metaDescription: seo.metaDescription ?? "",
        }}
      />

      <div>
        <h2 className="mb-3 text-lg font-semibold">Inhalt</h2>
        <PageEditor
          pageId={page.id}
          initialBlocks={page.blocks.map((b) => ({ type: b.type, data: (b.data as Record<string, unknown>) ?? {} }))}
        />
      </div>
    </div>
  );
}
