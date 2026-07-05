"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { getBlockDef } from "@/lib/cms/blocks";
import { sanitizeBlockData } from "@/lib/cms/blocks-sanitize";

type Result = { ok: boolean; error?: string; message?: string; id?: string };

function slugify(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 80) || "seite";
}

const pageMetaSchema = z.object({
  title: z.string().min(1, "Titel erforderlich").max(160),
  slug: z.string().min(1).max(80),
  status: z.enum(["DRAFT", "PUBLISHED"]),
  metaTitle: z.string().max(160).optional(),
  metaDescription: z.string().max(300).optional(),
});

export async function createPage(input: { title: string }): Promise<Result> {
  const { orgId, userId } = await requirePermission(PERMISSIONS.CMS_PAGE_EDIT);
  const title = (input.title ?? "").trim();
  if (title.length < 1) return { ok: false, error: "Titel erforderlich" };

  let slug = slugify(title);
  let i = 1;
  while (await prisma.page.findFirst({ where: { orgId, slug, locale: "de" } })) slug = `${slugify(title)}-${i++}`;

  const page = await prisma.page.create({ data: { orgId, title, slug, status: "DRAFT", locale: "de" } });
  await prisma.auditLog.create({ data: { orgId, actorId: userId, action: "page.created", entity: "page", entityId: page.id } });
  revalidatePath("/admin/pages");
  return { ok: true, id: page.id, message: "Seite erstellt." };
}

export async function savePageMeta(pageId: string, input: unknown): Promise<Result> {
  const { orgId } = await requirePermission(PERMISSIONS.CMS_PAGE_EDIT);
  const parsed = pageMetaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message };

  const page = await prisma.page.findFirst({ where: { id: pageId, orgId } });
  if (!page) return { ok: false, error: "Seite nicht gefunden." };

  const slug = slugify(parsed.data.slug);
  const clash = await prisma.page.findFirst({
    where: { orgId, slug, locale: "de", NOT: { id: pageId } },
  });
  if (clash) return { ok: false, error: "Slug bereits vergeben." };

  await prisma.page.update({
    where: { id: pageId },
    data: {
      title: parsed.data.title,
      slug,
      status: parsed.data.status,
      seo: { metaTitle: parsed.data.metaTitle ?? "", metaDescription: parsed.data.metaDescription ?? "" },
    },
  });
  revalidatePath("/admin/pages");
  revalidatePath(`/admin/pages/${pageId}`);
  return { ok: true, message: "Seite gespeichert." };
}

export async function deletePage(pageId: string): Promise<Result> {
  const { orgId, userId } = await requirePermission(PERMISSIONS.CMS_PAGE_EDIT);
  const page = await prisma.page.findFirst({ where: { id: pageId, orgId } });
  if (!page) return { ok: false, error: "Seite nicht gefunden." };

  await prisma.page.delete({ where: { id: pageId } });
  await prisma.auditLog.create({ data: { orgId, actorId: userId, action: "page.deleted", entity: "page", entityId: pageId } });
  revalidatePath("/admin/pages");
  return { ok: true, message: "Seite gelöscht." };
}

/**
 * Speichert die komplette Blockliste einer Seite (Reihenfolge + Inhalte) in
 * einem Rutsch. richtext-Felder werden serverseitig sanitized.
 */
export async function saveBlocks(
  pageId: string,
  blocks: { type: string; data: Record<string, unknown> }[],
): Promise<Result> {
  const { orgId } = await requirePermission(PERMISSIONS.CMS_PAGE_EDIT);
  const page = await prisma.page.findFirst({ where: { id: pageId, orgId } });
  if (!page) return { ok: false, error: "Seite nicht gefunden." };

  const sanitized = blocks
    .filter((b) => getBlockDef(b.type))
    .map((b, index) => ({
      pageId,
      type: b.type,
      order: index,
      data: sanitizeBlockData(b.type, b.data) as object,
    }));

  await prisma.$transaction([
    prisma.contentBlock.deleteMany({ where: { pageId } }),
    ...(sanitized.length ? [prisma.contentBlock.createMany({ data: sanitized })] : []),
    prisma.page.update({ where: { id: pageId }, data: { updatedAt: new Date() } }),
  ]);

  revalidatePath(`/admin/pages/${pageId}`);
  return { ok: true, message: "Inhalte gespeichert." };
}
