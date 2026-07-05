"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { dateAtUTC, mondayOf } from "@/lib/domain/dates";
import { generateWeekProposal, type PlanProposal } from "@/lib/domain/planner";

export async function generatePlanProposal(
  locationId: string,
  weekStart: string,
): Promise<{ ok: boolean; proposal?: PlanProposal; error?: string }> {
  const { orgId } = await requirePermission(PERMISSIONS.PLAN_MANAGE);
  const loc = await prisma.location.findFirst({ where: { id: locationId, orgId } });
  if (!loc) return { ok: false, error: "Unbekannter Standort." };
  const proposal = await generateWeekProposal(orgId, locationId, mondayOf(weekStart));
  return { ok: true, proposal };
}

const commitSchema = z.object({
  locationId: z.string().min(1),
  shifts: z.array(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      startTime: z.string(),
      endTime: z.string(),
      requiredHeadcount: z.coerce.number().min(1).max(50),
      notes: z.string().nullable().optional(),
      assignedEmployeeIds: z.array(z.string()),
    }),
  ),
});

export async function commitPlanProposal(input: unknown): Promise<{ ok: boolean; error?: string; message?: string }> {
  const { orgId, userId } = await requirePermission(PERMISSIONS.PLAN_MANAGE);
  const parsed = commitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message };
  const { locationId, shifts } = parsed.data;

  const loc = await prisma.location.findFirst({ where: { id: locationId, orgId } });
  if (!loc) return { ok: false, error: "Unbekannter Standort." };

  // Mitarbeiter-IDs einmal vorab validieren (org-fremde IDs verwerfen)
  const allIds = Array.from(new Set(shifts.flatMap((s) => s.assignedEmployeeIds)));
  const validEmployees = await prisma.employee.findMany({ where: { id: { in: allIds }, orgId }, select: { id: true } });
  const validIds = new Set(validEmployees.map((e) => e.id));

  // P0: alles-oder-nichts (Standard 3.10)
  let created = 0;
  await prisma.$transaction(async (tx) => {
    for (const s of shifts) {
      const shift = await tx.shift.create({
        data: {
          orgId, locationId,
          date: dateAtUTC(s.date),
          startTime: s.startTime,
          endTime: s.endTime,
          requiredHeadcount: s.requiredHeadcount,
          notes: s.notes || null,
        },
      });
      const ids = s.assignedEmployeeIds.filter((id) => validIds.has(id));
      if (ids.length) {
        await tx.shiftAssignment.createMany({
          data: ids.map((employeeId) => ({ shiftId: shift.id, employeeId, status: "ASSIGNED" as const })),
          skipDuplicates: true,
        });
      }
      created++;
    }
    await tx.auditLog.create({ data: { orgId, actorId: userId, action: "plan.generated", entity: "shiftPlan", meta: { count: created } } });
  });
  revalidatePath("/admin/shifts");
  return { ok: true, message: `${created} Schichten erstellt.` };
}
