import type { AgentContext } from "@/lib/agent/context";
import type { ChangesetItem } from "@/lib/agent/tool-meta";
import { addDays, todayISO } from "@/lib/domain/dates";

// Pure Agent-Logik ohne Server-Abhängigkeiten (AI-P2 / 8.7 S4):
// testbar mit Vitest, importiert von run.ts.

export type AgentProposal =
  | { type: "tool"; toolName: string; values: Record<string, unknown>; message?: string }
  | { type: "changeset"; items: ChangesetItem[]; message?: string }
  | { type: "answer"; message: string }
  | { type: "error"; message: string };

// --- ID-Wachhund (8.7 S1) ----------------------------------------------------
// Validiert vom Modell gelieferte IDs gegen den Kontext. Unbekannte IDs werden
// geleert (kein stilles Vorausfüllen falscher Personen) + Hinweis an den User.
const ID_FIELD_SOURCE: Record<string, "employees" | "locations" | "roles"> = {
  employeeId: "employees",
  employeeAId: "employees",
  employeeBId: "employees",
  locationId: "locations",
  roleId: "roles",
};

export function guardIds(
  values: Record<string, unknown>,
  ctx: AgentContext,
): { values: Record<string, unknown>; warnings: string[] } {
  const sets = {
    employees: new Set(ctx.employees.map((e) => e.id)),
    locations: new Set(ctx.locations.map((l) => l.id)),
    roles: new Set(ctx.roles.map((r) => r.id)),
  };
  const out: Record<string, unknown> = { ...values };
  const warnings: string[] = [];
  for (const [key, source] of Object.entries(ID_FIELD_SOURCE)) {
    const v = out[key];
    if (typeof v === "string" && v.length > 0 && !sets[source].has(v)) {
      out[key] = "";
      warnings.push(key);
    }
  }
  return {
    values: out,
    warnings: warnings.length
      ? [`Unsichere Zuordnung bei: ${warnings.join(", ")} – bitte selbst wählen.`]
      : [],
  };
}

// --- Heuristik-Fallback (ohne API-Key) -------------------------------------
const WEEKDAYS: Record<string, number> = {
  montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6, sonntag: 0,
};

function nextWeekdayISO(name: string, nextWeek: boolean): string | null {
  const target = WEEKDAYS[name];
  if (target === undefined) return null;
  const today = todayISO();
  const todayDow = new Date(`${today}T00:00:00Z`).getUTCDay();
  let diff = (target - todayDow + 7) % 7;
  if (diff === 0) diff = 7;
  if (nextWeek) diff += 7;
  return addDays(today, diff);
}

export function heuristic(transcript: string, ctx: AgentContext): AgentProposal {
  const t = transcript.toLowerCase();
  const nextWeek = t.includes("nächste woche") || t.includes("naechste woche");
  const emp = ctx.employees.find((e) => t.includes(e.name.toLowerCase().split(" ")[0]));
  const weekday = Object.keys(WEEKDAYS).find((d) => t.includes(d));
  const dateISO = weekday ? nextWeekdayISO(weekday, nextWeek) : null;

  if (/(frei|urlaub|krank)/.test(t)) {
    return {
      type: "tool",
      toolName: "request_absence",
      values: {
        employeeId: emp?.id ?? "",
        startDate: dateISO ?? "",
        endDate: dateISO ?? "",
        type: t.includes("krank") ? "SICK" : t.includes("urlaub") ? "VACATION" : "OTHER",
        note: "",
      },
      message: "Ohne KI-Schlüssel: einfache Heuristik – bitte Felder prüfen.",
    };
  }
  if (/(schicht|dienst)/.test(t)) {
    return {
      type: "tool",
      toolName: "create_shift",
      values: {
        locationId: ctx.locations[0]?.id ?? "",
        date: dateISO ?? "",
        startTime: t.includes("abend") ? "16:00" : "08:00",
        endTime: t.includes("abend") ? "20:00" : "16:00",
        requiredHeadcount: 1,
        notes: "",
      },
      message: "Ohne KI-Schlüssel: einfache Heuristik – bitte Felder prüfen.",
    };
  }
  return {
    type: "answer",
    message: "Kein ANTHROPIC_API_KEY gesetzt. Aktionen mit 'frei/Urlaub/krank' oder 'Schicht/Dienst' können per Heuristik vorbefüllt werden; für vollwertiges Verstehen bitte den Key konfigurieren.",
  };
}
