import { prisma } from "@/lib/prisma";
import {
  type ListParams,
  type ListResult,
  paginate,
  computeTotalPages,
  buildOrderBy,
} from "@/lib/list/query";
import type { Prisma } from "@prisma/client";

export interface PageRow {
  id: string;
  slug: string;
  title: string;
  status: string;
  blockCount: number;
  updatedAt: Date;
}

export async function listPages(orgId: string, p: ListParams): Promise<ListResult<PageRow>> {
  const status = p.filters.status;
  const where: Prisma.PageWhereInput = {
    orgId,
    ...(status ? { status: status as "DRAFT" | "PUBLISHED" } : {}),
    ...(p.search
      ? { OR: [{ title: { contains: p.search } }, { slug: { contains: p.search } }] }
      : {}),
  };
  const orderBy = buildOrderBy(
    p,
    { title: "title", slug: "slug", updatedAt: "updatedAt", status: "status" },
    { updatedAt: "desc" },
  ) as Prisma.PageOrderByWithRelationInput;
  const { skip, take } = paginate(p);

  const [pages, total] = await Promise.all([
    prisma.page.findMany({ where, orderBy, skip, take, include: { _count: { select: { blocks: true } } } }),
    prisma.page.count({ where }),
  ]);

  const rows: PageRow[] = pages.map((pg) => ({
    id: pg.id,
    slug: pg.slug,
    title: pg.title,
    status: pg.status,
    blockCount: pg._count.blocks,
    updatedAt: pg.updatedAt,
  }));

  return { rows, total, page: p.page, pageSize: p.pageSize, totalPages: computeTotalPages(total, p.pageSize) };
}

export async function getPageWithBlocks(orgId: string, pageId: string) {
  return prisma.page.findFirst({
    where: { id: pageId, orgId },
    include: { blocks: { orderBy: { order: "asc" } } },
  });
}

export async function getPublishedPage(orgSlug: string, pageSlug: string) {
  const org = await prisma.organization.findUnique({ where: { slug: orgSlug } });
  if (!org) return null;
  return prisma.page.findFirst({
    where: { orgId: org.id, slug: pageSlug, status: "PUBLISHED" },
    include: { blocks: { orderBy: { order: "asc" } } },
  });
}
