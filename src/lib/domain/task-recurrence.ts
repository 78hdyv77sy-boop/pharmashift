// Aufgaben-Logik: pur & client-sicher (kein Server/Prisma) -> per Vitest testbar.

export type TaskRecurrenceValue = "ONCE" | "DAILY" | "WEEKLY" | "SHIFT";
export type TaskAssigneeValue = "PERSON" | "SHIFT";

export const RECURRENCE_LABEL: Record<TaskRecurrenceValue, string> = {
  ONCE: "Einmalig",
  DAILY: "Täglich",
  WEEKLY: "Wöchentlich",
  SHIFT: "Schichtgebunden",
};

export const ASSIGNEE_LABEL: Record<TaskAssigneeValue, string> = {
  PERSON: "Person",
  SHIFT: "Schicht (wer Dienst hat)",
};

// 0 = Sonntag .. 6 = Samstag (JS getUTCDay). Anzeige Mo-first.
export const WEEKDAY_LABEL: Record<number, string> = {
  1: "Montag", 2: "Dienstag", 3: "Mittwoch", 4: "Donnerstag", 5: "Freitag", 6: "Samstag", 0: "Sonntag",
};
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export interface DueContext {
  recurrence: TaskRecurrenceValue;
  weekday: number | null; // bei WEEKLY
  dueDateIso: string | null; // bei ONCE (YYYY-MM-DD)
}

// Ist die Aufgabe an einem bestimmten Tag fällig?
// dow = getUTCDay() des Tages; shiftPresent = gibt es an dem Tag einen relevanten Dienst?
export function isTaskDue(ctx: DueContext, dateIso: string, dow: number, shiftPresent: boolean): boolean {
  switch (ctx.recurrence) {
    case "ONCE":
      return ctx.dueDateIso === dateIso;
    case "DAILY":
      return true;
    case "WEEKLY":
      return ctx.weekday === dow;
    case "SHIFT":
      return shiftPresent;
    default:
      return false;
  }
}
