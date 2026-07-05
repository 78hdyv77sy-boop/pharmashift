"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import {
  resolveTier,
  isAustrianHoliday,
  NIGHTDUTY_TARIFFS_2026,
  NIGHTDUTY_PAUSCHALE_2026,
} from "@/lib/domain/nightduty-tariffs";
import type { NightDutyTier } from "@/lib/domain/nightduty-tariffs";

type Result = { ok: boolean; error?: string; message?: string; id?: string };

// Hilfsfunktion: aktiver Mitarbeiter-Datensatz des eingeloggten Users in der Org,
// inkl. Prüfung dass es eine Apotheker:in ist (oder Leitung mit VIEW_ALL).
async function resolveSelfEmployee(orgId: string, userId: string) {
  return prisma.employee.findFirst({
    where: { orgId, userId, deletedAt: null, active: true },
    select: { id: true, type: true, locationId: true, firstName: true, lastName: true },
  });
}

/**
 * Startet einen Nachtdienst für den eingeloggten Apotheker.
 * Tarife werden als Snapshot gespeichert (historisch stabil bei KV-Änderung).
 */
export async function startNightDuty(input: {
  date: string; // YYYY-MM-DD
  startTime: string; // "18:00"
  endTime: string; // "08:00"
  dutyType?: "NACHT" | "SAMSTAG" | "SONNFEIER";
}): Promise<Result> {
  const { orgId, userId } = await requirePermission(PERMISSIONS.NIGHTDUTY_USE);
  const me = await resolveSelfEmployee(orgId, userId);
  if (!me) return { ok: false, error: "Kein verknüpfter Mitarbeiter gefunden." };
  if (me.type !== "APOTHEKER") return { ok: false, error: "Nachtdienst ist nur für Apotheker:innen." };

  const duty = await prisma.nightDuty.create({
    data: {
      orgId,
      locationId: me.locationId,
      employeeId: me.id,
      date: new Date(`${input.date}T00:00:00`),
      startTime: input.startTime,
      endTime: input.endTime,
      dutyType: input.dutyType ?? "NACHT",
      baseWage: NIGHTDUTY_PAUSCHALE_2026.baseWage,
      nightBonus: NIGHTDUTY_PAUSCHALE_2026.nightBonus,
    },
  });
  revalidatePath("/admin/nightduty");
  return { ok: true, id: duty.id, message: "Nachtdienst gestartet." };
}

/**
 * Erfasst eine Inanspruchnahme ("Kunde"-Knopfdruck).
 * Tarif wird serverseitig aus dem aktuellen Zeitpunkt + Feiertagslogik bestimmt
 * (nicht clientseitig — Manipulationsschutz).
 */
export async function recordCustomer(nightDutyId: string): Promise<Result & { tier?: NightDutyTier; amount?: number }> {
  const { orgId, userId } = await requirePermission(PERMISSIONS.NIGHTDUTY_USE);

  const duty = await prisma.nightDuty.findFirst({
    where: { id: nightDutyId, orgId },
    include: { employee: { select: { userId: true } } },
  });
  if (!duty) return { ok: false, error: "Nachtdienst nicht gefunden." };
  if (duty.closedAt) return { ok: false, error: "Dienst ist bereits abgeschlossen." };
  // Eigentums-Check: nur der diensthabende Apotheker darf erfassen
  if (duty.employee.userId !== userId) return { ok: false, error: "Nur der/die Diensthabende kann erfassen." };

  const now = new Date();
  const tier = resolveTier(now, isAustrianHoliday(now));
  if (!tier) {
    // Außerhalb der gebührenpflichtigen Fenster (z.B. werktags 8–18) — trotzdem
    // erfassbar als günstigster Tarif? Nein: wir lehnen ab, um Falschbeträge zu vermeiden.
    return { ok: false, error: "Aktuell kein gebührenpflichtiges Zeitfenster." };
  }
  const t = NIGHTDUTY_TARIFFS_2026[tier];
  await prisma.nightDutyCustomer.create({
    data: { nightDutyId, tier, baseAmount: t.base, bonusAmount: t.bonus },
  });
  revalidatePath("/admin/nightduty");
  return { ok: true, tier, amount: t.base + t.bonus };
}

/** Letzte Inanspruchnahme rückgängig (Fehlklick). */
export async function undoLastCustomer(nightDutyId: string): Promise<Result> {
  const { orgId, userId } = await requirePermission(PERMISSIONS.NIGHTDUTY_USE);
  const duty = await prisma.nightDuty.findFirst({
    where: { id: nightDutyId, orgId },
    include: { employee: { select: { userId: true } } },
  });
  if (!duty) return { ok: false, error: "Nicht gefunden." };
  if (duty.employee.userId !== userId) return { ok: false, error: "Nicht berechtigt." };

  const last = await prisma.nightDutyCustomer.findFirst({
    where: { nightDutyId },
    orderBy: { at: "desc" },
  });
  if (!last) return { ok: false, error: "Keine Inanspruchnahme zum Entfernen." };
  await prisma.nightDutyCustomer.delete({ where: { id: last.id } });
  revalidatePath("/admin/nightduty");
  return { ok: true, message: "Letzte Inanspruchnahme entfernt." };
}

/** Dienst abschließen (sperrt weitere Erfassung). */
export async function closeNightDuty(nightDutyId: string): Promise<Result> {
  const { orgId, userId } = await requirePermission(PERMISSIONS.NIGHTDUTY_USE);
  const duty = await prisma.nightDuty.findFirst({
    where: { id: nightDutyId, orgId },
    include: { employee: { select: { userId: true } } },
  });
  if (!duty) return { ok: false, error: "Nicht gefunden." };
  if (duty.employee.userId !== userId) return { ok: false, error: "Nicht berechtigt." };

  await prisma.nightDuty.update({ where: { id: nightDutyId }, data: { closedAt: new Date() } });
  revalidatePath("/admin/nightduty");
  return { ok: true, message: "Nachtdienst abgeschlossen." };
}

/**
 * NACHTRAGEN: Inanspruchnahme mit selbst gewähltem Zeitpunkt erfassen
 * (z. B. wenn der Knopfdruck in der Nacht vergessen wurde). Tarif wird
 * serverseitig aus DEM ANGEGEBENEN Zeitpunkt bestimmt – identische Logik
 * wie live. Erlaubt auch nach Dienst-Abschluss (bis 7 Tage, nur Diensthabende,
 * auditiert), damit ehrliches Korrigieren möglich bleibt.
 */
export async function recordCustomerAt(nightDutyId: string, atIso: string): Promise<Result & { tier?: NightDutyTier; amount?: number }> {
  const { orgId, userId } = await requirePermission(PERMISSIONS.NIGHTDUTY_USE);

  const duty = await prisma.nightDuty.findFirst({
    where: { id: nightDutyId, orgId },
    include: { employee: { select: { userId: true } } },
  });
  if (!duty) return { ok: false, error: "Nachtdienst nicht gefunden." };
  if (duty.employee.userId !== userId) return { ok: false, error: "Nur der/die Diensthabende kann nachtragen." };

  const at = new Date(atIso);
  if (isNaN(at.getTime())) return { ok: false, error: "Ungültiger Zeitpunkt." };

  // Plausibilität: Zeitpunkt muss zum Dienst gehören (Diensttag bis Folgetag-Mittag)
  const dayStart = new Date(duty.date);
  const windowEnd = new Date(dayStart.getTime() + 36 * 60 * 60 * 1000); // +36h
  if (at < dayStart || at > windowEnd) {
    return { ok: false, error: "Zeitpunkt liegt außerhalb dieses Dienstes." };
  }
  // Nachträge nur bis 7 Tage nach dem Dienst (Abrechnungsschutz)
  if (Date.now() - dayStart.getTime() > 7 * 24 * 60 * 60 * 1000) {
    return { ok: false, error: "Nachtragen ist nur bis 7 Tage nach dem Dienst möglich." };
  }

  const tier = resolveTier(at, isAustrianHoliday(at));
  if (!tier) return { ok: false, error: "Zu diesem Zeitpunkt gilt kein gebührenpflichtiges Zeitfenster." };

  const t = NIGHTDUTY_TARIFFS_2026[tier];
  await prisma.nightDutyCustomer.create({ data: { nightDutyId, at, tier, baseAmount: t.base, bonusAmount: t.bonus } });
  await prisma.auditLog.create({
    data: { orgId, actorId: userId, action: "nightduty.backfill", entity: "nightDuty", entityId: nightDutyId, meta: { at: at.toISOString(), tier } },
  });
  revalidatePath("/admin/nightduty");
  return { ok: true, tier, amount: t.base + t.bonus, message: "Inanspruchnahme nachgetragen." };
}
