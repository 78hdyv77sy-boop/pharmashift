"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { getUserPermissions } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { dateAtUTC, mondayOf } from "@/lib/domain/dates";
import { buildSolverInputs } from "@/lib/domain/solver-source";
import { findHardConflicts } from "@/lib/domain/solver";
import type { AssignedShiftOption, SwapEmployeeOption, SwapRow, SwapStatusValue } from "./swap-types";

type Result = { ok: boolean; error?: string; message?: string; id?: string };
type Ctx = { orgId: string; userId: string; session: { user: { isSuperAdmin?: boolean } } };

async function hasShiftManage(c: Ctx): Promise<boolean> {
  if (c.session.user.isSuperAdmin) return true;
  const perms = await getUserPermissions(c.userId, c.orgId);
  return perms.has(PERMISSIONS.SHIFT_MANAGE);
}

// Mitarbeiter-IDs, die mit dem aktuellen Login-User verknüpft sind (für "meine Schicht").
async function getMyEmployeeIds(orgId: string, userId: string): Promise<Set<string>> {
  const emps = await prisma.employee.findMany({ where: { orgId, userId, deletedAt: null }, select: { id: true } });
  return new Set(emps.map((e) => e.id));
}

function fmtShiftLabel(shift: { date: Date; startTime: string; endTime: string; location?: { name: string } | null }): string {
  const wd = shift.date.toLocaleDateString("de-AT", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" });
  return `${wd} · ${shift.startTime}–${shift.endTime}${shift.location?.name ? " · " + shift.location.name : ""}`;
}

// ---- Formular-Daten ---------------------------------------------------------

export async function listSwapEmployees(): Promise<SwapEmployeeOption[]> {
  const { orgId } = await requirePermission(PERMISSIONS.SHIFT_VIEW);
  const emps = await prisma.employee.findMany({
    where: { orgId, deletedAt: null, active: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true },
  });
  return emps.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}` }));
}

// Kommende zugewiesene Schichten einer Person (für die Auswahl im Antrag).
export async function listAssignedShifts(employeeId: string): Promise<AssignedShiftOption[]> {
  const { orgId } = await requirePermission(PERMISSIONS.SHIFT_VIEW);
  const emp = await prisma.employee.findFirst({ where: { id: employeeId, orgId }, select: { id: true } });
  if (!emp) return [];
  const todayIso = new Date().toISOString().slice(0, 10);
  const asgs = await prisma.shiftAssignment.findMany({
    where: { employeeId, shift: { orgId, deletedAt: null, date: { gte: dateAtUTC(todayIso) } } },
    include: { shift: { include: { location: { select: { name: true } } } } },
    orderBy: { shift: { date: "asc" } },
    take: 60,
  });
  return asgs.map((a) => ({
    assignmentId: a.id,
    date: a.shift.date.toISOString().slice(0, 10),
    label: fmtShiftLabel(a.shift),
  }));
}

// ---- Antrag stellen ---------------------------------------------------------

export async function createSwapRequest(input: { fromAssignmentId: string; toAssignmentId: string; note?: string }): Promise<Result> {
  const c = (await requirePermission(PERMISSIONS.SHIFT_VIEW)) as Ctx;
  const { orgId, userId } = c;

  if (!input?.fromAssignmentId || !input?.toAssignmentId) return { ok: false, error: "Bitte beide Schichten wählen." };

  const from = await prisma.shiftAssignment.findFirst({
    where: { id: input.fromAssignmentId, shift: { orgId } },
    include: { shift: true, employee: { select: { id: true, userId: true } } },
  });
  if (!from) return { ok: false, error: "Deine Schicht wurde nicht gefunden." };

  const manage = await hasShiftManage(c);
  const mine = from.employee.userId === userId;
  if (!mine && !manage) return { ok: false, error: "Du kannst nur eigene Dienste zum Tausch anbieten." };

  const to = await prisma.shiftAssignment.findFirst({
    where: { id: input.toAssignmentId, shift: { orgId } },
    include: { employee: { select: { id: true } } },
  });
  if (!to) return { ok: false, error: "Die Gegen-Schicht wurde nicht gefunden." };
  if (to.employeeId === from.employeeId) return { ok: false, error: "Bitte zwei verschiedene Personen wählen." };

  const dup = await prisma.shiftSwap.findFirst({ where: { orgId, fromAssignmentId: from.id, status: "REQUESTED" }, select: { id: true } });
  if (dup) return { ok: false, error: "Für diese Schicht gibt es bereits einen offenen Tauschantrag." };

  await prisma.$transaction(async (tx) => {
    const swap = await tx.shiftSwap.create({
      data: {
        orgId,
        fromAssignmentId: from.id,
        toEmployeeId: to.employeeId,
        toAssignmentId: to.id,
        requestedById: userId,
        note: input.note?.slice(0, 300) || null,
        status: "REQUESTED",
      },
    });
    await tx.auditLog.create({ data: { orgId, actorId: userId, action: "swap.requested", entity: "shiftSwap", entityId: swap.id } });
  });

  revalidatePath("/admin/shifts/swaps");
  return { ok: true, message: "Tauschantrag gestellt." };
}

// ---- AZG-Prüfung des Tauschs ------------------------------------------------

async function azgCheckSwap(
  orgId: string,
  a: { shift: { id: string; locationId: string; date: Date }; employeeId: string },
  b: { shift: { id: string; locationId: string; date: Date }; employeeId: string },
): Promise<{ ok: boolean; reasons: string[] }> {
  const keyOf = (locationId: string, dateIso: string) => `${locationId}|${mondayOf(dateIso)}`;
  const items = [a, b];
  const inputsByKey = new Map<string, Awaited<ReturnType<typeof buildSolverInputs>>>();

  for (const it of items) {
    const key = keyOf(it.shift.locationId, it.shift.date.toISOString().slice(0, 10));
    if (!inputsByKey.has(key)) {
      inputsByKey.set(key, await buildSolverInputs(orgId, it.shift.locationId, it.shift.date.toISOString().slice(0, 10)));
    }
  }

  const empSet = new Set([a.employeeId, b.employeeId]);
  const collect = () => {
    const out = new Set<string>();
    const reasons = new Map<string, string>();
    for (const inputs of inputsByKey.values()) {
      if (!inputs) continue;
      for (const c of findHardConflicts(inputs.solverShifts, inputs.solverEmployees)) {
        if (!empSet.has(c.employeeId)) continue;
        const k = `${c.shiftId}|${c.employeeId}`;
        out.add(k);
        reasons.set(k, `${inputs.nameOf.get(c.employeeId) ?? c.employeeId}: ${c.reason}`);
      }
    }
    return { keys: out, reasons };
  };

  const before = collect();

  // Tausch in-memory anwenden: a.employee <-> b.employee auf ihren Schichten
  for (const inputs of inputsByKey.values()) {
    if (!inputs) continue;
    inputs.solverShifts = inputs.solverShifts.map((s) => {
      if (s.id === a.shift.id) return { ...s, assignedEmployeeIds: s.assignedEmployeeIds.map((id) => (id === a.employeeId ? b.employeeId : id)) };
      if (s.id === b.shift.id) return { ...s, assignedEmployeeIds: s.assignedEmployeeIds.map((id) => (id === b.employeeId ? a.employeeId : id)) };
      return s;
    });
  }

  const after = collect();
  const newReasons: string[] = [];
  for (const k of after.keys) if (!before.keys.has(k)) newReasons.push(after.reasons.get(k)!);
  return { ok: newReasons.length === 0, reasons: [...new Set(newReasons)] };
}

// ---- Entscheiden (annehmen/ablehnen) ---------------------------------------

export async function decideSwap(swapId: string, accept: boolean): Promise<Result> {
  const c = (await requirePermission(PERMISSIONS.SHIFT_VIEW)) as Ctx;
  const { orgId, userId } = c;

  const swap = await prisma.shiftSwap.findFirst({
    where: { id: swapId, orgId },
    include: {
      fromAssignment: { include: { shift: true, employee: { select: { id: true } } } },
      toAssignment: { include: { shift: true, employee: { select: { id: true, userId: true } } } },
    },
  });
  if (!swap) return { ok: false, error: "Antrag nicht gefunden." };
  if (swap.status !== "REQUESTED") return { ok: false, error: "Dieser Antrag ist nicht mehr offen." };
  if (!swap.toAssignment) return { ok: false, error: "Gegen-Schicht fehlt." };

  const manage = await hasShiftManage(c);
  const iAmTarget = !!swap.toAssignment.employee.userId && swap.toAssignment.employee.userId === userId;
  if (!iAmTarget && !manage) return { ok: false, error: "Nur die angefragte Person oder die Leitung kann entscheiden." };

  if (!accept) {
    await prisma.$transaction(async (tx) => {
      await tx.shiftSwap.update({ where: { id: swap.id }, data: { status: "DECLINED", decidedById: userId, decidedAt: new Date() } });
      await tx.auditLog.create({ data: { orgId, actorId: userId, action: "swap.declined", entity: "shiftSwap", entityId: swap.id } });
    });
    revalidatePath("/admin/shifts/swaps");
    return { ok: true, message: "Tauschantrag abgelehnt." };
  }

  const fromEmp = swap.fromAssignment.employeeId;
  const toEmp = swap.toAssignment.employeeId;
  const shiftFrom = swap.fromAssignment.shift;
  const shiftTo = swap.toAssignment.shift;

  // sind beide Personen noch auf ihren Schichten?
  const [stillFrom, stillTo] = await Promise.all([
    prisma.shiftAssignment.findFirst({ where: { shiftId: shiftFrom.id, employeeId: fromEmp }, select: { id: true } }),
    prisma.shiftAssignment.findFirst({ where: { shiftId: shiftTo.id, employeeId: toEmp }, select: { id: true } }),
  ]);
  if (!stillFrom || !stillTo) return { ok: false, error: "Eine der Schichten hat sich geändert. Bitte neu beantragen." };

  // AZG-Prüfung: der Tausch darf keinen neuen Verstoß erzeugen
  const azg = await azgCheckSwap(orgId, { shift: shiftFrom, employeeId: fromEmp }, { shift: shiftTo, employeeId: toEmp });
  if (!azg.ok) return { ok: false, error: `Tausch würde das AZG verletzen — ${azg.reasons.join("; ")}` };

  await prisma.$transaction(async (tx) => {
    // shiftFrom: fromEmp raus, toEmp rein
    await tx.shiftAssignment.deleteMany({ where: { shiftId: shiftFrom.id, employeeId: fromEmp } });
    await tx.shiftAssignment.upsert({
      where: { shiftId_employeeId: { shiftId: shiftFrom.id, employeeId: toEmp } },
      update: { status: "ASSIGNED" },
      create: { shiftId: shiftFrom.id, employeeId: toEmp, status: "ASSIGNED" },
    });
    // shiftTo: toEmp raus, fromEmp rein
    await tx.shiftAssignment.deleteMany({ where: { shiftId: shiftTo.id, employeeId: toEmp } });
    await tx.shiftAssignment.upsert({
      where: { shiftId_employeeId: { shiftId: shiftTo.id, employeeId: fromEmp } },
      update: { status: "ASSIGNED" },
      create: { shiftId: shiftTo.id, employeeId: fromEmp, status: "ASSIGNED" },
    });
    await tx.shiftSwap.update({ where: { id: swap.id }, data: { status: "ACCEPTED", decidedById: userId, decidedAt: new Date() } });
    await tx.auditLog.create({
      data: { orgId, actorId: userId, action: "swap.accepted", entity: "shiftSwap", entityId: swap.id, meta: { fromEmp, toEmp, shiftFrom: shiftFrom.id, shiftTo: shiftTo.id } },
    });
  });

  revalidatePath("/admin/shifts/swaps");
  revalidatePath("/admin/shifts");
  return { ok: true, message: "Tausch angenommen und ausgeführt." };
}

export async function cancelSwap(swapId: string): Promise<Result> {
  const c = (await requirePermission(PERMISSIONS.SHIFT_VIEW)) as Ctx;
  const { orgId, userId } = c;
  const swap = await prisma.shiftSwap.findFirst({
    where: { id: swapId, orgId },
    include: { fromAssignment: { include: { employee: { select: { userId: true } } } } },
  });
  if (!swap) return { ok: false, error: "Antrag nicht gefunden." };
  if (swap.status !== "REQUESTED") return { ok: false, error: "Dieser Antrag ist nicht mehr offen." };

  const manage = await hasShiftManage(c);
  const mine = swap.requestedById === userId || swap.fromAssignment.employee.userId === userId;
  if (!mine && !manage) return { ok: false, error: "Keine Berechtigung." };

  await prisma.shiftSwap.update({ where: { id: swap.id }, data: { status: "CANCELLED", decidedById: userId, decidedAt: new Date() } });
  revalidatePath("/admin/shifts/swaps");
  return { ok: true, message: "Tauschantrag zurückgezogen." };
}

// ---- Liste ------------------------------------------------------------------

export async function listSwaps(): Promise<SwapRow[]> {
  const c = (await requirePermission(PERMISSIONS.SHIFT_VIEW)) as Ctx;
  const { orgId, userId } = c;
  const manage = await hasShiftManage(c);
  const myEmp = await getMyEmployeeIds(orgId, userId);

  const swaps = await prisma.shiftSwap.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      fromAssignment: { include: { shift: { include: { location: { select: { name: true } } } }, employee: { select: { id: true, userId: true, firstName: true, lastName: true } } } },
      toAssignment: { include: { shift: { include: { location: { select: { name: true } } } }, employee: { select: { id: true, userId: true, firstName: true, lastName: true } } } },
    },
  });

  const rows: SwapRow[] = [];
  for (const s of swaps) {
    const reqEmp = s.fromAssignment.employee;
    const tgtEmp = s.toAssignment?.employee ?? null;
    const involvesMe =
      myEmp.has(reqEmp.id) || (tgtEmp ? myEmp.has(tgtEmp.id) : false) || s.requestedById === userId;
    if (!manage && !involvesMe) continue;

    const isOpen = s.status === "REQUESTED";
    const iAmTarget = !!tgtEmp?.userId && tgtEmp.userId === userId;
    const iAmRequester = reqEmp.userId === userId || s.requestedById === userId;

    rows.push({
      id: s.id,
      status: s.status as SwapStatusValue,
      createdAt: s.createdAt.toISOString(),
      requesterName: `${reqEmp.firstName} ${reqEmp.lastName}`,
      fromLabel: fmtShiftLabel(s.fromAssignment.shift),
      targetName: tgtEmp ? `${tgtEmp.firstName} ${tgtEmp.lastName}` : "—",
      toLabel: s.toAssignment ? fmtShiftLabel(s.toAssignment.shift) : null,
      note: s.note,
      canDecide: isOpen && (manage || iAmTarget),
      canCancel: isOpen && (manage || iAmRequester),
    });
  }
  return rows;
}
