"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { EMPLOYEE_TYPES, EMPLOYEE_TYPE_LABEL } from "@/lib/domain/employee-types";
import type { ImportRow, ImportResult } from "./types";

function resolveType(raw: string): string | null {
  const v = (raw ?? "").trim();
  if (!v) return "SONSTIGE";
  const upper = v.toUpperCase();
  if ((EMPLOYEE_TYPES as readonly string[]).includes(upper)) return upper;
  const byLabel = Object.entries(EMPLOYEE_TYPE_LABEL).find(([, label]) => label.toLowerCase() === v.toLowerCase());
  if (byLabel) return byLabel[0];
  if (/apothek/i.test(v)) return "APOTHEKER";
  return null;
}

export async function importEmployees(rows: ImportRow[]): Promise<ImportResult> {
  const { orgId } = await requirePermission(PERMISSIONS.EMPLOYEE_MANAGE);
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, created: 0, errors: [], error: "Keine Zeilen." };
  if (rows.length > 1000) return { ok: false, created: 0, errors: [], error: "Maximal 1000 Zeilen pro Import." };

  const locations = await prisma.location.findMany({ where: { orgId, deletedAt: null }, select: { id: true, name: true } });
  const locByName = new Map<string, string>(locations.map((l) => [l.name.trim().toLowerCase(), l.id] as const));

  const errors: { line: number; message: string }[] = [];
  const toCreate: { firstName: string; lastName: string; type: string; locationId: string | null; weeklyHoursTarget: number | null }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const line = i + 2; // inkl. Kopfzeile
    const r = rows[i];
    const firstName = (r.firstName ?? "").trim();
    const lastName = (r.lastName ?? "").trim();
    if (!firstName || !lastName) { errors.push({ line, message: "Vor- und Nachname erforderlich." }); continue; }

    const type = resolveType(r.type);
    if (!type) { errors.push({ line, message: `Unbekannter Typ „${r.type}".` }); continue; }

    let locationId: string | null = null;
    const locName = (r.locationName ?? "").trim();
    if (locName) {
      const found = locByName.get(locName.toLowerCase());
      if (!found) { errors.push({ line, message: `Standort „${locName}" nicht gefunden.` }); continue; }
      locationId = found;
    }

    let weeklyHoursTarget: number | null = null;
    const wh = (r.weeklyHours ?? "").trim().replace(",", ".");
    if (wh) {
      const n = Number(wh);
      if (Number.isNaN(n) || n < 0 || n > 80) { errors.push({ line, message: `Ungültige Wochenstunden „${r.weeklyHours}".` }); continue; }
      weeklyHoursTarget = n;
    }

    toCreate.push({ firstName, lastName, type, locationId, weeklyHoursTarget });
  }

  // P0: erst vollständig validieren, dann EIN atomarer Write (Standard 3.10).
  // Ungültige Zeilen werden gemeldet, gültige als Ganzes angelegt.
  let created = 0;
  if (toCreate.length > 0) {
    try {
      const res = await prisma.employee.createMany({
        data: toCreate.map((e) => ({
          orgId,
          firstName: e.firstName,
          lastName: e.lastName,
          type: e.type as never,
          locationId: e.locationId,
          weeklyHoursTarget: e.weeklyHoursTarget,
          active: true,
        })),
      });
      created = res.count;
    } catch {
      return { ok: false, created: 0, errors, error: "Import fehlgeschlagen – keine Zeile wurde angelegt." };
    }
  }

  if (created > 0) revalidatePath("/admin/employees");
  return { ok: true, created, errors };
}
