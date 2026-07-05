"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";

type Result = { ok: boolean; error?: string; message?: string };

const TIMEZONES = ["Europe/Berlin", "Europe/Vienna", "Europe/Zurich", "Europe/London", "Europe/Lisbon", "America/Sao_Paulo", "UTC"];

const schema = z.object({
  name: z.string().min(1, "Name erforderlich").max(80),
  slug: z.string().regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Slug: nur Kleinbuchstaben, Ziffern, Bindestrich").min(3).max(40),
  timezone: z.string().refine((t) => TIMEZONES.includes(t), "Unbekannte Zeitzone"),
});

export async function updateOrgSettings(input: unknown): Promise<Result> {
  const { orgId, userId } = await requirePermission(PERMISSIONS.ORG_SETTINGS);
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message };
  const d = parsed.data;

  const clash = await prisma.organization.findFirst({ where: { slug: d.slug, NOT: { id: orgId } }, select: { id: true } });
  if (clash) return { ok: false, error: "Dieser Slug ist bereits vergeben." };

  await prisma.organization.update({ where: { id: orgId }, data: { name: d.name, slug: d.slug, timezone: d.timezone } });
  await prisma.auditLog.create({ data: { orgId, actorId: userId, action: "org.settings.updated", entity: "organization", entityId: orgId } });

  revalidatePath("/admin/settings");
  revalidatePath("/admin");
  return { ok: true, message: "Einstellungen gespeichert." };
}

const aliasSchema = z.array(z.object({
  alias: z.string().min(1).max(40),
  targetType: z.enum(["location", "employee"]),
  targetId: z.string().min(1),
})).max(50);

export async function saveAgentAliases(input: unknown): Promise<Result> {
  const { orgId, userId } = await requirePermission(PERMISSIONS.ORG_SETTINGS);
  const parsed = aliasSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Ungültige Alias-Liste." };

  // Ziel-IDs gegen die Org validieren (kein Fremd-Org-Leak ins Prompt)
  const locIds = new Set((await prisma.location.findMany({ where: { orgId }, select: { id: true } })).map((l) => l.id));
  const empIds = new Set((await prisma.employee.findMany({ where: { orgId }, select: { id: true } })).map((e) => e.id));
  const clean = parsed.data.filter((a) => (a.targetType === "location" ? locIds.has(a.targetId) : empIds.has(a.targetId)));

  await prisma.setting.upsert({
    where: { orgId_key: { orgId, key: "agent.aliases" } },
    update: { value: clean },
    create: { orgId, key: "agent.aliases", value: clean },
  });
  await prisma.auditLog.create({ data: { orgId, actorId: userId, action: "agent.aliases.updated", entity: "setting" } });
  revalidatePath("/admin/settings");
  return { ok: true, message: "Aliase gespeichert." };
}
