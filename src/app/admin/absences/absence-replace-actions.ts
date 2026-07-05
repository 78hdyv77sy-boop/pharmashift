"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { mondayOf } from "@/lib/domain/dates";
import { buildSolverInputs } from "@/lib/domain/solver-source";
import { findHardConflicts, suggestReassignment } from "@/lib/domain/solver";
import type { AbsenceReplacementDraft, AbsenceReplacementItem } from "./absence-replace-types";

// Autonomie MIT Schranke (Plan 8.6 V6): bei genehmigter Abwesenheit wird ein
// Ersatz-ENTWURF vorbereitet — nie automatisch ausgeführt. Der Mensch bestätigt.

export async function prepareAbsenceReplacements(absenceId: string): Promise<AbsenceReplacementDraft> {
  const { orgId } = await requirePermission(PERMISSIONS.ABSENCE_APPROVE);

  const absence = await prisma.absence.findFirst({
    where: { id: absenceId, employee: { orgId } },
    include: { employee: { select: { id: true, firstName: true, lastName: true } } },
  });
  if (!absence) return { ok: false, error: "Abwesenheit nicht gefunden.", absentName: "", items: [] };

  const absentId = absence.employeeId;
  const absentName = `${absence.employee.firstName} ${absence.employee.lastName}`;

  // Betroffene Dienste: die abwesende Person ist im Zeitraum eingeteilt
  const asgs = await prisma.shiftAssignment.findMany({
    where: { employeeId: absentId, shift: { orgId, deletedAt: null, date: { gte: absence.startDate, lte: absence.endDate } } },
    include: { shift: { include: { location: { select: { name: true } } } } },
  });
  if (asgs.length === 0) return { ok: true, absentName, items: [] };

  const shiftMeta = new Map(
    asgs.map((a) => [a.shift.id, {
      date: a.shift.date.toISOString().slice(0, 10),
      time: `${a.shift.startTime}–${a.shift.endTime}`,
      loc: a.shift.location.name,
    }] as const),
  );

  // Nach (Standort, Woche) gruppieren, damit der Solver-Kontext stimmt
  const groups = new Map<string, { locationId: string; dateIso: string }>();
  for (const a of asgs) {
    const dateIso = a.shift.date.toISOString().slice(0, 10);
    const key = `${a.shift.locationId}|${mondayOf(dateIso)}`;
    if (!groups.has(key)) groups.set(key, { locationId: a.shift.locationId, dateIso });
  }

  const items: AbsenceReplacementItem[] = [];
  for (const { locationId, dateIso } of groups.values()) {
    const inputs = await buildSolverInputs(orgId, locationId, dateIso);
    if (!inputs) continue;
    // Abwesende Person erzeugt jetzt "abwesend"-Konflikte auf ihren Diensten
    const conflicts = findHardConflicts(inputs.solverShifts, inputs.solverEmployees).filter((c) => c.employeeId === absentId);
    for (const c of conflicts) {
      const meta = shiftMeta.get(c.shiftId);
      if (!meta) continue; // nur Dienste aus DIESEM Abwesenheitszeitraum
      const sug = suggestReassignment(c, inputs.solverShifts, inputs.solverEmployees);
      items.push({
        shiftId: c.shiftId,
        date: meta.date,
        time: meta.time,
        locationName: meta.loc,
        fromEmployeeId: absentId,
        fromName: absentName,
        toEmployeeId: sug ? sug.toEmployeeId : null,
        toName: sug ? inputs.nameOf.get(sug.toEmployeeId) ?? null : null,
        reason: sug ? sug.reason : "Kein passender Ersatz gefunden – bitte manuell",
      });
    }
  }

  items.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  return { ok: true, absentName, items };
}

export async function applyAbsenceReplacements(
  moves: { shiftId: string; fromEmployeeId: string; toEmployeeId: string }[],
): Promise<{ ok: boolean; error?: string; message?: string; count?: number; interactionId?: string; canUndo?: boolean }> {
  const { orgId, userId } = await requirePermission(PERMISSIONS.SHIFT_MANAGE);
  const clean0 = (moves ?? []).filter((m) => m.shiftId && m.fromEmployeeId && m.toEmployeeId);
  if (clean0.length === 0) return { ok: false, error: "Nichts ausgewählt." };
  if (clean0.length > 100) return { ok: false, error: "Zu viele Einträge." };

  const shiftIds = [...new Set(clean0.map((m) => m.shiftId))];
  const owned = await prisma.shift.findMany({ where: { id: { in: shiftIds }, orgId, deletedAt: null }, select: { id: true } });
  const ownedSet = new Set(owned.map((s) => s.id));
  const clean = clean0.filter((m) => ownedSet.has(m.shiftId));
  if (clean.length === 0) return { ok: false, error: "Keine gültigen Dienste." };

  const undo = [{ toolName: "auto_reassign", op: { kind: "reassign_back" as const, pairs: clean } }];

  const interaction = await prisma.$transaction(async (tx) => {
    for (const m of clean) {
      await tx.shiftAssignment.deleteMany({ where: { shiftId: m.shiftId, employeeId: m.fromEmployeeId } });
      await tx.shiftAssignment.upsert({
        where: { shiftId_employeeId: { shiftId: m.shiftId, employeeId: m.toEmployeeId } },
        update: { status: "ASSIGNED" },
        create: { shiftId: m.shiftId, employeeId: m.toEmployeeId, status: "ASSIGNED" },
      });
      await tx.auditLog.create({
        data: { orgId, actorId: userId, action: "absence.replacement", entity: "shift", entityId: m.shiftId, meta: { fromEmployeeId: m.fromEmployeeId, toEmployeeId: m.toEmployeeId } },
      });
    }
    return tx.agentInteraction.create({
      data: {
        orgId, userId,
        transcript: `[absence-replace] ${clean.length} Ersatz-Umbuchung(en)`,
        parsedIntent: "execute",
        toolName: "auto_reassign",
        payload: { moves: clean, undo } as object,
        status: "EXECUTED",
      },
    });
  });

  revalidatePath("/admin/shifts");
  revalidatePath("/admin/absences");
  return { ok: true, message: `${clean.length} Ersatz übernommen.`, count: clean.length, interactionId: interaction.id, canUndo: true };
}
