import "server-only";
import { prisma } from "@/lib/prisma";
import { dateAtUTC, addDays } from "@/lib/domain/dates";

// Inverse Operationen für ausgeführte Agent-Aktionen (Abschnitt 8.7 S5).
// Jede Op ist org-gescoped; Multi-Writes laufen transaktional (Standard 3.10).

export type UndoOp =
  | { kind: "soft_delete_shifts"; shiftIds: string[] }
  | { kind: "remove_assignments"; pairs: { shiftId: string; employeeId: string }[] }
  | { kind: "delete_absence"; absenceId: string }
  | { kind: "swap_back"; employeeAId: string; employeeBId: string; date: string }
  | { kind: "reassign_back"; pairs: { shiftId: string; fromEmployeeId: string; toEmployeeId: string }[] }
  | { kind: "set_emergency"; locationId: string; date: string; employeeId: string | null };

export async function applyUndo(orgId: string, op: UndoOp): Promise<{ ok: boolean; error?: string }> {
  switch (op.kind) {
    case "remove_assignments": {
      // Inverse zum Solver-Apply: genau diese Zuweisungen wieder entfernen
      const shiftIds = [...new Set(op.pairs.map((p) => p.shiftId))];
      const owned = await prisma.shift.findMany({ where: { id: { in: shiftIds }, orgId }, select: { id: true } });
      const ownedSet = new Set(owned.map((s) => s.id));
      const valid = op.pairs.filter((p) => ownedSet.has(p.shiftId));
      if (valid.length) {
        await prisma.shiftAssignment.deleteMany({
          where: { OR: valid.map((p) => ({ shiftId: p.shiftId, employeeId: p.employeeId })) },
        });
      }
      return { ok: true };
    }
    case "soft_delete_shifts": {
      await prisma.shift.updateMany({
        where: { id: { in: op.shiftIds }, orgId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      return { ok: true };
    }
    case "delete_absence": {
      const absence = await prisma.absence.findFirst({ where: { id: op.absenceId, employee: { orgId } } });
      if (!absence) return { ok: true }; // bereits weg -> idempotent ok
      await prisma.absence.delete({ where: { id: op.absenceId } });
      return { ok: true };
    }
    case "reassign_back": {
      // Inverse zur Auto-Umbuchung: Ersatz entfernen, Ursprungsperson zurück.
      const shiftIds = [...new Set(op.pairs.map((p) => p.shiftId))];
      const owned = await prisma.shift.findMany({ where: { id: { in: shiftIds }, orgId }, select: { id: true } });
      const ownedSet = new Set(owned.map((s) => s.id));
      const valid = op.pairs.filter((p) => ownedSet.has(p.shiftId));
      await prisma.$transaction(async (tx) => {
        for (const p of valid) {
          await tx.shiftAssignment.deleteMany({ where: { shiftId: p.shiftId, employeeId: p.toEmployeeId } });
          await tx.shiftAssignment.upsert({
            where: { shiftId_employeeId: { shiftId: p.shiftId, employeeId: p.fromEmployeeId } },
            update: { status: "ASSIGNED" },
            create: { shiftId: p.shiftId, employeeId: p.fromEmployeeId, status: "ASSIGNED" },
          });
        }
      });
      return { ok: true };
    }
    case "swap_back": {
      // Selbst-invers: identischer Tausch in einer Transaktion
      const dayStart = dateAtUTC(op.date);
      const dayEnd = dateAtUTC(addDays(op.date, 1));
      const shifts = await prisma.shift.findMany({
        where: { orgId, deletedAt: null, date: { gte: dayStart, lt: dayEnd } },
        include: { assignments: true },
      });
      await prisma.$transaction(async (tx) => {
        for (const s of shifts) {
          const hasA = s.assignments.some((x) => x.employeeId === op.employeeAId);
          const hasB = s.assignments.some((x) => x.employeeId === op.employeeBId);
          if (hasA === hasB) continue;
          const from = hasA ? op.employeeAId : op.employeeBId;
          const to = hasA ? op.employeeBId : op.employeeAId;
          await tx.shiftAssignment.deleteMany({ where: { shiftId: s.id, employeeId: from } });
          await tx.shiftAssignment.upsert({
            where: { shiftId_employeeId: { shiftId: s.id, employeeId: to } },
            update: {},
            create: { shiftId: s.id, employeeId: to, status: "ASSIGNED" },
          });
        }
      });
      return { ok: true };
    }
    case "set_emergency": {
      const loc = await prisma.location.findFirst({ where: { id: op.locationId, orgId } });
      if (!loc) return { ok: false, error: "Standort unbekannt." };
      const dutyDate = dateAtUTC(op.date);
      if (op.employeeId === null) {
        await prisma.emergencyDuty.deleteMany({ where: { locationId: op.locationId, date: dutyDate } });
      } else {
        await prisma.emergencyDuty.upsert({
          where: { locationId_date: { locationId: op.locationId, date: dutyDate } },
          update: { employeeId: op.employeeId },
          create: { locationId: op.locationId, date: dutyDate, employeeId: op.employeeId },
        });
      }
      return { ok: true };
    }
  }
}
