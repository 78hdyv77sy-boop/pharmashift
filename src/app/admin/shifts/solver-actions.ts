"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { solveWeekGaps, findHardConflicts, suggestReassignment } from "@/lib/domain/solver";
import { buildSolverInputs } from "@/lib/domain/solver-source";
import type { SolverPlanItem, SolverPlan, AutoReassignResult, ReassignMove, WeekConflict } from "@/lib/domain/solver-types";

// AI-P3 / 8.6 V4: "Lücken automatisch füllen" — deterministischer Solver,
// Mensch bestätigt (nie Auto-Ausführen, immer Auto-Vorbereiten).

export async function proposeWeekFill(locationId: string, week: string): Promise<SolverPlan> {
  const { orgId } = await requirePermission(PERMISSIONS.SHIFT_MANAGE);
  const inputs = await buildSolverInputs(orgId, locationId, week);
  if (!inputs) return { ok: false, error: "Standort unbekannt.", items: [], warnings: [] };

  const { solverShifts, solverEmployees, nameOf } = inputs;
  const result = solveWeekGaps(solverShifts, solverEmployees);
  const shiftOf = new Map(solverShifts.map((s) => [s.id, s] as const));

  const items: SolverPlanItem[] = result.assignments.map((a) => {
    const s = shiftOf.get(a.shiftId)!;
    return {
      shiftId: a.shiftId,
      employeeId: a.employeeId,
      employeeName: nameOf.get(a.employeeId) ?? a.employeeId,
      date: s.date,
      time: `${s.startTime}–${s.endTime}`,
      reason: a.reason,
    };
  });

  return { ok: true, items, warnings: result.warnings.map((w) => w.message) };
}

export async function applyWeekFill(items: { shiftId: string; employeeId: string }[]): Promise<{ ok: boolean; error?: string; message?: string; interactionId?: string; canUndo?: boolean }> {
  const { orgId, userId } = await requirePermission(PERMISSIONS.SHIFT_MANAGE);
  if (!Array.isArray(items) || items.length === 0) return { ok: false, error: "Nichts auszuführen." };
  if (items.length > 100) return { ok: false, error: "Zu viele Einträge." };

  // Org-Validierung beider Seiten
  const shiftIds = [...new Set(items.map((i) => i.shiftId))];
  const empIds = [...new Set(items.map((i) => i.employeeId))];
  const [validShifts, validEmps] = await Promise.all([
    prisma.shift.findMany({ where: { id: { in: shiftIds }, orgId, deletedAt: null }, select: { id: true } }),
    prisma.employee.findMany({ where: { id: { in: empIds }, orgId }, select: { id: true } }),
  ]);
  const sOk = new Set(validShifts.map((s) => s.id));
  const eOk = new Set(validEmps.map((e) => e.id));
  const clean = items.filter((i) => sOk.has(i.shiftId) && eOk.has(i.employeeId));
  if (clean.length === 0) return { ok: false, error: "Keine gültigen Einträge." };

  // P0-Standard 3.10: ein atomarer Write — inkl. Undo-Deskriptor (UX2-P0 N3)
  const undo = [{ toolName: "solver_fill", op: { kind: "remove_assignments" as const, pairs: clean } }];
  const [, , interaction] = await prisma.$transaction([
    prisma.shiftAssignment.createMany({
      data: clean.map((i) => ({ shiftId: i.shiftId, employeeId: i.employeeId, status: "ASSIGNED" as const })),
      skipDuplicates: true,
    }),
    prisma.auditLog.create({
      data: { orgId, actorId: userId, action: "plan.solver.applied", entity: "shift", meta: { count: clean.length } },
    }),
    prisma.agentInteraction.create({
      data: {
        orgId, userId,
        transcript: `[solver] ${clean.length} Zuweisungen`,
        parsedIntent: "execute",
        toolName: "solver_fill",
        payload: { items: clean, undo } as object,
        status: "EXECUTED",
      },
    }),
  ]);

  revalidatePath("/admin/shifts");
  return { ok: true, message: `${clean.length} Zuweisung(en) übernommen.`, interactionId: interaction.id, canUndo: true };
}

// ----------------------------------------------------------------------------
// Auto-Umbuchung bei AZG-Konflikt ("Silent Rotation", aber TRANSPARENT):
// bucht illegale Dienste automatisch auf gültige Kolleg:innen gleicher Rolle um,
// protokolliert jede Umbuchung mit echtem Grund (Audit-Log) und ist 24h
// rückgängig (Undo). Es werden KEINE Stunden gefälscht – wer einen Dienst
// abgibt, verliert genau diesen (illegalen) Dienst; die freie Zeit kann danach
// regulär über "Lücken füllen" neu belegt werden.
// ----------------------------------------------------------------------------
export async function autoReassignConflicts(locationId: string, week: string): Promise<AutoReassignResult> {
  const { orgId, userId } = await requirePermission(PERMISSIONS.SHIFT_MANAGE);
  const inputs = await buildSolverInputs(orgId, locationId, week);
  if (!inputs) return { ok: false, error: "Standort unbekannt.", moves: [], unresolved: [] };

  let solverShifts = inputs.solverShifts;
  const { solverEmployees, nameOf } = inputs;
  const meta = new Map(inputs.solverShifts.map((s) => [s.id, { date: s.date, time: `${s.startTime}–${s.endTime}` }] as const));

  const dbMoves: { shiftId: string; fromEmployeeId: string; toEmployeeId: string }[] = [];
  const moves: ReassignMove[] = [];

  // iterativ lösen: nach jeder Umbuchung neu prüfen (Folgekonflikte berücksichtigen)
  for (let iter = 0; iter < 100; iter++) {
    const conflicts = findHardConflicts(solverShifts, solverEmployees);
    if (conflicts.length === 0) break;
    let progressed = false;
    for (const c of conflicts) {
      const sug = suggestReassignment(c, solverShifts, solverEmployees);
      if (!sug) continue;
      solverShifts = solverShifts.map((s) =>
        s.id === c.shiftId
          ? { ...s, assignedEmployeeIds: s.assignedEmployeeIds.map((id) => (id === c.employeeId ? sug.toEmployeeId : id)) }
          : s,
      );
      dbMoves.push({ shiftId: c.shiftId, fromEmployeeId: c.employeeId, toEmployeeId: sug.toEmployeeId });
      const m = meta.get(c.shiftId);
      moves.push({
        date: m?.date ?? "", time: m?.time ?? "",
        fromName: nameOf.get(c.employeeId) ?? c.employeeId,
        toName: nameOf.get(sug.toEmployeeId) ?? sug.toEmployeeId,
        reason: c.reason,
      });
      progressed = true;
      break;
    }
    if (!progressed) break;
  }

  const unresolved: WeekConflict[] = findHardConflicts(solverShifts, solverEmployees).map((c) => {
    const m = meta.get(c.shiftId);
    return {
      shiftId: c.shiftId, employeeId: c.employeeId,
      employeeName: nameOf.get(c.employeeId) ?? c.employeeId,
      date: m?.date ?? "", time: m?.time ?? "", reason: c.reason,
    };
  });

  if (dbMoves.length === 0) return { ok: true, moves: [], unresolved };

  // Org-Validierung der betroffenen Schichten (Sicherheitsnetz)
  const shiftIds = [...new Set(dbMoves.map((m) => m.shiftId))];
  const owned = await prisma.shift.findMany({ where: { id: { in: shiftIds }, orgId, deletedAt: null }, select: { id: true } });
  const ownedSet = new Set(owned.map((s) => s.id));
  const clean = dbMoves.filter((m) => ownedSet.has(m.shiftId));
  if (clean.length === 0) return { ok: false, error: "Keine gültigen Schichten.", moves: [], unresolved };

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
        data: {
          orgId, actorId: userId, action: "shift.auto_reassign", entity: "shift", entityId: m.shiftId,
          meta: { fromEmployeeId: m.fromEmployeeId, toEmployeeId: m.toEmployeeId },
        },
      });
    }
    return tx.agentInteraction.create({
      data: {
        orgId, userId,
        transcript: `[auto-reassign] ${clean.length} AZG-Umbuchung(en)`,
        parsedIntent: "execute",
        toolName: "auto_reassign",
        payload: { moves: clean, undo } as object,
        status: "EXECUTED",
      },
    });
  });

  revalidatePath("/admin/shifts");
  return { ok: true, moves, unresolved, interactionId: interaction.id, canUndo: true };
}
