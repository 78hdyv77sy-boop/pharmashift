export const AVAILABILITY_TYPES = ["AVAILABLE", "PREFERRED", "UNAVAILABLE"] as const;
export type AvailabilityTypeKey = (typeof AVAILABILITY_TYPES)[number];

export const AVAILABILITY_TYPE_LABEL: Record<string, string> = {
  AVAILABLE: "Verfügbar",
  PREFERRED: "Bevorzugt",
  UNAVAILABLE: "Nicht verfügbar",
};

// weekday 0-6 (0 = Sonntag, wie Date.getUTCDay)
export const WEEKDAY_LABEL: Record<number, string> = {
  0: "Sonntag", 1: "Montag", 2: "Dienstag", 3: "Mittwoch", 4: "Donnerstag", 5: "Freitag", 6: "Samstag",
};

export interface AvailabilityRow {
  id: string;
  weekday: number | null;
  date: string | null;
  startTime: string;
  endTime: string;
  type: string;
  recurring: boolean;
}

export interface AvailabilityRule {
  weekday: number | null;
  date: string | null;
  type: string;
  recurring: boolean;
}

/**
 * Effektiver Verfügbarkeitstyp einer Person an einem Tag: einmalige Datums-
 * regeln haben Vorrang vor wiederkehrenden Wochentagsregeln. null = keine Regel.
 */
export function effectiveAvailability(rules: AvailabilityRule[], dateISO: string, weekday: number): string | null {
  const once = rules.find((r) => !r.recurring && r.date === dateISO);
  if (once) return once.type;
  const rec = rules.find((r) => r.recurring && r.weekday === weekday);
  return rec ? rec.type : null;
}
