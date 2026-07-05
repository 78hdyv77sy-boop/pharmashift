import { prisma } from "@/lib/prisma";

export async function listMenus(orgId: string) {
  return prisma.menu.findMany({
    where: { orgId },
    orderBy: { name: "asc" },
    include: { _count: { select: { items: true } } },
  });
}

export async function getMenuWithItems(orgId: string, menuId: string) {
  return prisma.menu.findFirst({
    where: { id: menuId, orgId },
    include: { items: { orderBy: { order: "asc" } } },
  });
}

export interface PublicMenuItem {
  id: string;
  label: string;
  href: string;
  target: string | null;
  children: PublicMenuItem[];
}

/**
 * Lädt ein Menü für die öffentliche Ausgabe und löst interne Seitenlinks
 * (pageId) zu /{orgSlug}/{slug} auf. Baut zugleich die 2-Ebenen-Hierarchie.
 */
export async function getPublicMenu(orgSlug: string, menuSlug: string): Promise<PublicMenuItem[]> {
  const org = await prisma.organization.findUnique({ where: { slug: orgSlug } });
  if (!org) return [];

  const menu = await prisma.menu.findFirst({
    where: { orgId: org.id, slug: menuSlug },
    include: { items: { orderBy: { order: "asc" } } },
  });
  if (!menu) return [];

  const pageIds = menu.items.map((i) => i.pageId).filter((x): x is string => !!x);
  const pages = pageIds.length
    ? await prisma.page.findMany({ where: { id: { in: pageIds } }, select: { id: true, slug: true } })
    : [];
  const slugById = new Map<string, string>(pages.map((p) => [p.id, p.slug] as const));

  const toHref = (item: { href: string | null; pageId: string | null }) => {
    if (item.pageId && slugById.has(item.pageId)) return `/${orgSlug}/${slugById.get(item.pageId)}`;
    return item.href ?? "#";
  };

  const byId = new Map<string, PublicMenuItem>();
  const roots: PublicMenuItem[] = [];

  for (const item of menu.items) {
    byId.set(item.id, { id: item.id, label: item.label, href: toHref(item), target: item.target, children: [] });
  }
  for (const item of menu.items) {
    const node = byId.get(item.id)!;
    if (item.parentId && byId.has(item.parentId)) byId.get(item.parentId)!.children.push(node);
    else roots.push(node);
  }
  return roots;
}
