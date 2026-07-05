import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublishedPage } from "@/lib/cms/pages";
import { BlockRenderer } from "@/components/cms/block-renderer";

type Params = { orgSlug: string; slug?: string[] };

function resolveSlug(slug?: string[]) {
  return slug && slug.length ? slug.join("/") : "home";
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { orgSlug, slug } = await params;
  const page = await getPublishedPage(orgSlug, resolveSlug(slug));
  if (!page) return { title: "Nicht gefunden" };
  const seo = (page.seo as { metaTitle?: string; metaDescription?: string } | null) ?? {};
  return {
    title: seo.metaTitle || page.title,
    description: seo.metaDescription || undefined,
  };
}

export default async function PublicPage({ params }: { params: Promise<Params> }) {
  const { orgSlug, slug } = await params;
  const page = await getPublishedPage(orgSlug, resolveSlug(slug));
  if (!page) notFound();

  const blocks = page.blocks.map((b) => ({
    id: b.id,
    type: b.type,
    data: (b.data as Record<string, unknown>) ?? {},
  }));

  return (
    <main className="min-h-screen">
      {blocks.length === 0 ? (
        <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
          Diese Seite hat noch keinen Inhalt.
        </div>
      ) : (
        <BlockRenderer blocks={blocks} />
      )}
    </main>
  );
}
