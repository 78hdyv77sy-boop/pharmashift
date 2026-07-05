import "server-only";
import { z } from "zod";
import { PERMISSIONS, type PermissionKey } from "@/lib/permissions";
import { createShift, copyWeek } from "@/app/admin/shifts/actions";
import { requestAbsence } from "@/app/admin/absences/actions";
import { setEmergencyDuty } from "@/app/admin/emergency/actions";
import { swapAssignmentsOnDate } from "@/app/admin/shifts/swap-actions";
import { inviteMember } from "@/app/admin/users/actions";
import { ABSENCE_TYPES } from "@/lib/domain/absence-types";
import type { UndoOp } from "@/lib/agent/undo";

type ExecResult = {
  ok: boolean;
  error?: string;
  message?: string;
  id?: string;
  ids?: string[];
  previousEmployeeId?: string | null;
};

interface AgentTool {
  name: string;
  description: string;
  permission: PermissionKey;
  schema: z.ZodTypeAny;
  inputSchema: Record<string, unknown>; // JSON-Schema für Anthropic
  execute: (values: unknown) => Promise<ExecResult>;
  /** Liefert die inverse Operation (8.7 S5); null = nicht rückgängig machbar. */
  buildUndo?: (values: Record<string, unknown>, result: ExecResult) => UndoOp | null;
}

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
const dateRe = /^\d{4}-\d{2}-\d{2}$/;

export const AGENT_TOOLS: Record<string, AgentTool> = {
  generate_week_plan: {
    name: "generate_week_plan",
    description: "Erstellt einen kompletten Wochenplan-Vorschlag auf Basis vergangener Wochen. weekStart = Montag YYYY-MM-DD. Wird dem Nutzer als Vorschau gezeigt.",
    permission: PERMISSIONS.PLAN_MANAGE,
    schema: z.object({ locationId: z.string().min(1), weekStart: z.string().regex(dateRe) }),
    inputSchema: {
      type: "object",
      properties: {
        locationId: { type: "string", description: "ID des Standorts aus dem Kontext" },
        weekStart: { type: "string", description: "Montag der Zielwoche YYYY-MM-DD" },
      },
      required: ["locationId", "weekStart"],
    },
    // Ausführung erfolgt zweistufig über die Plan-Vorschau (Client), nicht hier.
    execute: async () => ({ ok: false, error: "Wochenplan über die Vorschau bestätigen." }),
  },

  find_replacement: {
    name: "find_replacement",
    description: "Schlägt Ersatzkräfte für eine:n abwesende:n Mitarbeiter:in an einem Datum vor. Zeigt dem Nutzer eine Auswahl. date = YYYY-MM-DD.",
    permission: PERMISSIONS.SHIFT_MANAGE,
    schema: z.object({ employeeId: z.string().min(1), date: z.string().regex(dateRe) }),
    inputSchema: {
      type: "object",
      properties: {
        employeeId: { type: "string", description: "ID des/der abwesenden Mitarbeiter:in aus dem Kontext" },
        date: { type: "string", description: "Datum YYYY-MM-DD" },
      },
      required: ["employeeId", "date"],
    },
    execute: async () => ({ ok: false, error: "Ersatz wird über die Auswahl zugewiesen." }),
  },

  create_shift: {
    name: "create_shift",
    description: "Erstellt eine neue Schicht an einem Standort. Datum als YYYY-MM-DD, Zeiten als HH:MM.",
    permission: PERMISSIONS.SHIFT_CREATE,
    schema: z.object({
      locationId: z.string().min(1),
      date: z.string().regex(dateRe),
      startTime: z.string().regex(timeRe),
      endTime: z.string().regex(timeRe),
      requiredHeadcount: z.coerce.number().min(1).max(50),
      notes: z.string().optional(),
    }),
    inputSchema: {
      type: "object",
      properties: {
        locationId: { type: "string", description: "ID des Standorts aus dem Kontext" },
        date: { type: "string", description: "Datum YYYY-MM-DD" },
        startTime: { type: "string", description: "Startzeit HH:MM" },
        endTime: { type: "string", description: "Endzeit HH:MM" },
        requiredHeadcount: { type: "number", description: "Benötigte Personenzahl" },
        notes: { type: "string" },
      },
      required: ["locationId", "date", "startTime", "endTime", "requiredHeadcount"],
    },
    execute: (values) => createShift(values),
    buildUndo: (_v, r) => (r.id ? { kind: "soft_delete_shifts", shiftIds: [r.id] } : null),
  },

  request_absence: {
    name: "request_absence",
    description: "Trägt eine Abwesenheit für eine:n Mitarbeiter:in ein (z. B. 'frei', Urlaub, krank).",
    permission: PERMISSIONS.ABSENCE_REQUEST,
    schema: z.object({
      employeeId: z.string().min(1),
      startDate: z.string().regex(dateRe),
      endDate: z.string().regex(dateRe),
      type: z.enum(ABSENCE_TYPES),
      note: z.string().optional(),
    }),
    inputSchema: {
      type: "object",
      properties: {
        employeeId: { type: "string", description: "ID des/der Mitarbeiter:in aus dem Kontext" },
        startDate: { type: "string", description: "Startdatum YYYY-MM-DD" },
        endDate: { type: "string", description: "Enddatum YYYY-MM-DD (bei einem Tag = Startdatum)" },
        type: { type: "string", enum: [...ABSENCE_TYPES] },
        note: { type: "string" },
      },
      required: ["employeeId", "startDate", "endDate", "type"],
    },
    execute: (values) => requestAbsence(values),
    buildUndo: (_v, r) => (r.id ? { kind: "delete_absence", absenceId: r.id } : null),
  },

  copy_week: {
    name: "copy_week",
    description: "Kopiert alle Schichten einer Woche in eine andere Woche. Wochenstarts als Montag YYYY-MM-DD.",
    permission: PERMISSIONS.PLAN_MANAGE,
    schema: z.object({
      locationId: z.string().min(1),
      fromWeekStart: z.string().regex(dateRe),
      toWeekStart: z.string().regex(dateRe),
    }),
    inputSchema: {
      type: "object",
      properties: {
        locationId: { type: "string" },
        fromWeekStart: { type: "string", description: "Quell-Montag YYYY-MM-DD" },
        toWeekStart: { type: "string", description: "Ziel-Montag YYYY-MM-DD" },
      },
      required: ["locationId", "fromWeekStart", "toWeekStart"],
    },
    execute: (values) => copyWeek(values as { locationId: string; fromWeekStart: string; toWeekStart: string }),
    buildUndo: (_v, r) => (r.ids && r.ids.length ? { kind: "soft_delete_shifts", shiftIds: r.ids } : null),
  },

  swap_shifts: {
    name: "swap_shifts",
    description: "Tauscht zwei Mitarbeiter an einem Datum gegenseitig über die Schichten dieses Tages. date = YYYY-MM-DD.",
    permission: PERMISSIONS.SHIFT_MANAGE,
    schema: z.object({ employeeAId: z.string().min(1), employeeBId: z.string().min(1), date: z.string().regex(dateRe) }),
    inputSchema: {
      type: "object",
      properties: {
        employeeAId: { type: "string", description: "ID der ersten Person aus dem Kontext" },
        employeeBId: { type: "string", description: "ID der zweiten Person aus dem Kontext" },
        date: { type: "string", description: "Datum YYYY-MM-DD" },
      },
      required: ["employeeAId", "employeeBId", "date"],
    },
    execute: (v) => {
      const d = v as { employeeAId: string; employeeBId: string; date: string };
      return swapAssignmentsOnDate(d.employeeAId, d.employeeBId, d.date);
    },
    buildUndo: (v) => {
      const d = v as { employeeAId?: string; employeeBId?: string; date?: string };
      return d.employeeAId && d.employeeBId && d.date
        ? { kind: "swap_back", employeeAId: d.employeeAId, employeeBId: d.employeeBId, date: d.date }
        : null;
    },
  },

  set_emergency_duty: {
    name: "set_emergency_duty",
    description: "Weist den Notdienst für einen Standort an einem Datum zu (oder leert ihn bei leerer employeeId). date = YYYY-MM-DD.",
    permission: PERMISSIONS.PLAN_MANAGE,
    schema: z.object({ locationId: z.string().min(1), date: z.string().regex(dateRe), employeeId: z.string().optional() }),
    inputSchema: {
      type: "object",
      properties: {
        locationId: { type: "string", description: "ID des Notdienst-Standorts aus dem Kontext" },
        date: { type: "string", description: "Datum YYYY-MM-DD" },
        employeeId: { type: "string", description: "ID des/der Mitarbeiter:in (leer = entfernen)" },
      },
      required: ["locationId", "date"],
    },
    execute: (v) => {
      const d = v as { locationId: string; date: string; employeeId?: string };
      return setEmergencyDuty(d.locationId, d.date, d.employeeId || null);
    },
    buildUndo: (v, r) => {
      const d = v as { locationId?: string; date?: string };
      if (!d.locationId || !d.date || r.previousEmployeeId === undefined) return null;
      return { kind: "set_emergency", locationId: d.locationId, date: d.date, employeeId: r.previousEmployeeId };
    },
  },

  invite_member: {
    name: "invite_member",
    description: "Lädt eine Person per E-Mail mit einer Rolle in die Organisation ein.",
    permission: PERMISSIONS.USER_INVITE,
    schema: z.object({ email: z.string().email(), roleId: z.string().min(1) }),
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string" },
        roleId: { type: "string", description: "ID der Rolle aus dem Kontext" },
      },
      required: ["email", "roleId"],
    },
    execute: (values) => inviteMember(values),
  },
};

export function anthropicToolDefs() {
  return Object.values(AGENT_TOOLS).map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));
}

/** Validiert und führt ein Tool aus (die Server-Action prüft RBAC erneut). */
export async function executeTool(name: string, values: unknown): Promise<ExecResult> {
  const tool = AGENT_TOOLS[name];
  if (!tool) return { ok: false, error: "Unbekannte Aktion." };
  const parsed = tool.schema.safeParse(values);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? "Ungültige Eingabe." };
  return tool.execute(parsed.data);
}
