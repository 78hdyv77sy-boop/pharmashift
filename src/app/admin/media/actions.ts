"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";

type Result = { ok: boolean; error?: string; message?: string };

const addSchema = z.object({
  url: z.string().url("Gültige Bild-URL erforderlich"),
  alt: z.string().max(200).optional(),
});

export async function addMedia(input: { url: string; alt?: string }): Promise<Result> {
  const { orgId, userId } = await requirePermission(PERMISSIONS.CMS_MEDIA_MANAGE);
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message };

  await prisma.media.create({
    data: { orgId, url: parsed.data.url, alt: parsed.data.alt ?? "", uploadedById: userId },
  });
  revalidatePath("/admin/media");
  return { ok: true, message: "Medium hinzugefügt." };
}

export async function deleteMedia(mediaId: string): Promise<Result> {
  const { orgId } = await requirePermission(PERMISSIONS.CMS_MEDIA_MANAGE);
  const m = await prisma.media.findFirst({ where: { id: mediaId, orgId } });
  if (!m) return { ok: false, error: "Nicht gefunden." };
  await prisma.media.delete({ where: { id: mediaId } });
  revalidatePath("/admin/media");
  return { ok: true, message: "Gelöscht." };
}
