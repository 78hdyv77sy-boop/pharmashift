"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { dateAtUTC, addDays, mondayOf } from "@/lib/domain/dates";

function headcountOf(requiredRoles: unknown): number {
  if (requiredRoles && typeof requiredRoles === "object" && "count" in requiredRoles) {
    const c = (requiredRoles as { count?: unknown }).count;
    if (typeof c === "number" && c > 0) return c;
  }
  return 1;
}

const schema = z.object({
  locationId: z.string().min(1),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  selections: z.array(z.object({ templateId: z.string().min(1), weekdays: z.array(z.number().min(0).max(6)) })),
});

export async function applyTemplatesToWeek(input: unknown): Promise<{ ok: boolean; error?: string; message?: string }> {
  const { orgId } = await requirePermission(PERMISSIONS.PLAN_MANAGE);
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message };
  const { locationId, selections } = parsed.data;
  const weekStart = mondayOf(parsed.data.weekStart);

  const loc = await prisma.location.findFirst({ where: { id: locationId, orgId } });
  if (!loc) return { ok: false, error: "Unbekannter Standort." };

  const ids = selections.map((s) => s.templateId);
  const templates = await prisma.shiftTemplate.findMany({ where: { id: { in: ids }, orgId } });

  // Schichten in-memory vorbereiten, dann atomar schreiben (Standard 3.10)
  const toCreate: { date: string; startTime: string; endTime: string; requiredHeadcount: number; templateId: string }[] = [];
  for (const sel of selections) {
    const t = templates.find((x) => x.id === sel.templateId);
    if (!t) continue;
    for (const wd of sel.weekdays) {
      const offset = (wd + 6) % 7; // Montag=0 … Sonntag=6
      toCreate.push({
        date: addDays(weekStart, offset),
        startTime: t.startTime,
        endTime: t.endTime,
        requiredHeadcount: headcountOf(t.requiredRoles),
        templateId: t.id,
      });
    }
  }

  if (toCreate.length === 0) return { ok: false, error: "Keine Wochentage ausgewählt." };

  await prisma.shift.createMany({
    data: toCreate.map((c) => ({
      orgId,
      locationId,
      templateId: c.templateId,
      date: dateAtUTC(c.date),
      startTime: c.startTime,
      endTime: c.endTime,
      requiredHeadcount: c.requiredHeadcount,
    })),
  });
  const created = toCreate.length;
  revalidatePath("/admin/shifts");
  return { ok: true, message: `${created} Schicht(en) aus Vorlagen erstellt.` };
}
