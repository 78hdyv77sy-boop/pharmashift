// Arbeitet mit reinen Datums-Strings "YYYY-MM-DD" und UTC-Mitternacht,
// um Zeitzonen-Drift im Wochenraster zu vermeiden.

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function dateAtUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function addDays(iso: string, n: number): string {
  const d = dateAtUTC(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISODate(d);
}

/** Montag der Woche, in der `iso` liegt (ISO-Wochenstart). */
export function mondayOf(iso: string): string {
  const d = dateAtUTC(iso);
  const day = d.getUTCDay(); // 0=So..6=Sa
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return toISODate(d);
}

export function weekDays(weekStartISO: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStartISO, i));
}

const WD = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
export function weekdayShort(iso: string): string {
  const day = dateAtUTC(iso).getUTCDay();
  return WD[day === 0 ? 6 : day - 1];
}

export function formatDayLabel(iso: string): string {
  const d = dateAtUTC(iso);
  return `${d.getUTCDate()}.${d.getUTCMonth() + 1}.`;
}

export function todayISO(): string {
  return toISODate(new Date());
}
