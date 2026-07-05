"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import type { MenuItemInput } from "./types";

type Result = { ok: boolean; error?: string; message?: string; id?: string };

function slugify(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 40) || "menu";
}

const createSchema = z.object({ name: z.string().min(2).max(40), slug: z.string().min(2).max(40) });

export async function createMenu(input: { name: string; slug: string }): Promise<Result> {
  const { orgId, userId } = await requirePermission(PERMISSIONS.CMS_MENU_EDIT);
  const parsed = createSchema.safeParse({ name: input.name, slug: slugify(input.slug || input.name) });
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message };

  const exists = await prisma.menu.findFirst({ where: { orgId, slug: parsed.data.slug } });
  if (exists) return { ok: false, error: "Slug bereits vergeben (z. B. main/footer)." };

  const menu = await prisma.menu.create({ data: { orgId, name: parsed.data.name, slug: parsed.data.slug } });
  await prisma.auditLog.create({ data: { orgId, actorId: userId, action: "menu.created", entity: "menu", entityId: menu.id } });
  revalidatePath("/admin/menus");
  return { ok: true, id: menu.id, message: "Menü erstellt." };
}

export async function deleteMenu(menuId: string): Promise<Result> {
  const { orgId } = await requirePermission(PERMISSIONS.CMS_MENU_EDIT);
  const menu = await prisma.menu.findFirst({ where: { id: menuId, orgId } });
  if (!menu) return { ok: false, error: "Menü nicht gefunden." };
  await prisma.menu.delete({ where: { id: menuId } });
  revalidatePath("/admin/menus");
  return { ok: true, message: "Menü gelöscht." };
}

/**
 * Speichert alle Menü-Items in einem Rutsch (Reihenfolge + Hierarchie).
 * Zwei Pässe: erst Eltern anlegen (clientId->dbId), dann Kinder mit parentId.
 */
export async function saveMenuItems(menuId: string, items: MenuItemInput[]): Promise<Result> {
  const { orgId } = await requirePermission(PERMISSIONS.CMS_MENU_EDIT);
  const menu = await prisma.menu.findFirst({ where: { id: menuId, orgId } });
  if (!menu) return { ok: false, error: "Menü nicht gefunden." };

  await prisma.menuItem.deleteMany({ where: { menuId } });

  const idMap = new Map<string, string>();
  const resolve = (it: MenuItemInput) => ({
    label: it.label.trim() || "Ohne Titel",
    pageId: it.linkType === "page" ? it.pageId ?? null : null,
    href: it.linkType === "url" ? it.href ?? null : null,
    target: it.target ?? null,
  });

  // Pass 1: Top-Level
  let order = 0;
  for (const it of items.filter((i) => !i.parentClientId)) {
    const created = await prisma.menuItem.create({ data: { menuId, order: order++, ...resolve(it) } });
    idMap.set(it.clientId, created.id);
  }
  // Pass 2: Kinder
  let childOrder = 0;
  for (const it of items.filter((i) => i.parentClientId)) {
    const parentId = it.parentClientId ? idMap.get(it.parentClientId) ?? null : null;
    await prisma.menuItem.create({ data: { menuId, order: childOrder++, parentId, ...resolve(it) } });
  }

  revalidatePath("/admin/menus");
  revalidatePath(`/admin/menus/${menuId}`);
  return { ok: true, message: "Menü gespeichert." };
}
