// Client-sicher: nur Metadaten für die Modal-Formulare. Keine Server-Imports.
// Jeder Voice-Use-Case == ein Tool == ein Formular == eine Server-Action.

export type AgentFieldType = "text" | "textarea" | "date" | "time" | "number" | "select";

export interface AgentField {
  key: string;
  label: string;
  type: AgentFieldType;
  optionSource?: "employees" | "locations" | "roles" | "absenceTypes"; // für select
}

export interface AgentToolMeta {
  name: string;
  title: string;
  description: string;
  fields: AgentField[];
}

export const AGENT_TOOLS: AgentToolMeta[] = [
  {
    name: "generate_week_plan",
    title: "Wochenplan generieren",
    description: "Erstellt auf Basis vergangener Wochen einen kompletten Dienstplan-Vorschlag (mit Vorschau).",
    fields: [
      { key: "locationId", label: "Standort", type: "select", optionSource: "locations" },
      { key: "weekStart", label: "Woche ab (Montag)", type: "date" },
    ],
  },
  {
    name: "create_shift",
    title: "Schicht erstellen",
    description: "Legt eine neue Schicht an einem Standort an.",
    fields: [
      { key: "locationId", label: "Standort", type: "select", optionSource: "locations" },
      { key: "date", label: "Datum", type: "date" },
      { key: "startTime", label: "Von", type: "time" },
      { key: "endTime", label: "Bis", type: "time" },
      { key: "requiredHeadcount", label: "Benötigte Personen", type: "number" },
      { key: "notes", label: "Notiz", type: "text" },
    ],
  },
  {
    name: "find_replacement",
    title: "Ersatz finden",
    description: "Schlägt Ersatzkräfte für eine:n Mitarbeiter:in an einem Tag vor.",
    fields: [
      { key: "employeeId", label: "Mitarbeiter (abwesend)", type: "select", optionSource: "employees" },
      { key: "date", label: "Datum", type: "date" },
    ],
  },
  {
    name: "request_absence",
    title: "Abwesenheit eintragen",
    description: "Trägt eine Abwesenheit (z. B. 'frei') für eine:n Mitarbeiter:in ein.",
    fields: [
      { key: "employeeId", label: "Mitarbeiter", type: "select", optionSource: "employees" },
      { key: "startDate", label: "Von", type: "date" },
      { key: "endDate", label: "Bis", type: "date" },
      { key: "type", label: "Typ", type: "select", optionSource: "absenceTypes" },
      { key: "note", label: "Notiz", type: "text" },
    ],
  },
  {
    name: "copy_week",
    title: "Woche kopieren",
    description: "Kopiert die Schichten einer Woche in eine andere Woche.",
    fields: [
      { key: "locationId", label: "Standort", type: "select", optionSource: "locations" },
      { key: "fromWeekStart", label: "Quelle (Montag)", type: "date" },
      { key: "toWeekStart", label: "Ziel (Montag)", type: "date" },
    ],
  },
  {
    name: "swap_shifts",
    title: "Schichten tauschen",
    description: "Tauscht zwei Mitarbeiter an einem Tag gegenseitig.",
    fields: [
      { key: "employeeAId", label: "Person A", type: "select", optionSource: "employees" },
      { key: "employeeBId", label: "Person B", type: "select", optionSource: "employees" },
      { key: "date", label: "Datum", type: "date" },
    ],
  },
  {
    name: "set_emergency_duty",
    title: "Notdienst zuweisen",
    description: "Weist den Notdienst für einen Standort an einem Tag zu.",
    fields: [
      { key: "locationId", label: "Notdienst-Standort", type: "select", optionSource: "locations" },
      { key: "date", label: "Datum", type: "date" },
      { key: "employeeId", label: "Mitarbeiter", type: "select", optionSource: "employees" },
    ],
  },
  {
    name: "invite_member",
    title: "Mitglied einladen",
    description: "Lädt eine Person per E-Mail mit einer Rolle ein.",
    fields: [
      { key: "email", label: "E-Mail", type: "text" },
      { key: "roleId", label: "Rolle", type: "select", optionSource: "roles" },
    ],
  },
];

export const AGENT_TOOL_MAP: Record<string, AgentToolMeta> = Object.fromEntries(
  AGENT_TOOLS.map((t) => [t.name, t]),
);

/** Tools mit eigenem interaktiven Flow (kein generisches Formular, kein Changeset). */
export const INTERACTIVE_TOOLS = new Set(["generate_week_plan", "find_replacement"]);

/** Ein Element eines Aktionsbündels (8.6 V2). */
export interface ChangesetItem {
  toolName: string;
  values: Record<string, unknown>;
}

export interface ExecuteOutcome {
  ok: boolean;
  error?: string;
  message?: string;
  interactionId?: string;
  canUndo?: boolean;
}

export interface ChangesetOutcome extends ExecuteOutcome {
  results: { toolName: string; ok: boolean; message?: string; error?: string }[];
}
