// Zentrale Zeit-Helfer für Schichtdauern. Pur & client-sicher (per Vitest testbar).
// Behandelt Dienste über Mitternacht korrekt (Ende <= Start => nächster Tag).
// Speicherung bleibt "HH:MM" (kein DB-Umbau) — der destruktive DateTime/UTC-
// Wechsel ist bewusst ein separater Schritt mit lokalem Test.

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Dauer in Minuten. Gleich => 0; Ende vor Start => über Mitternacht (+24h).
export function shiftMinutes(start: string, end: string): number {
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (e === s) return 0;
  return e > s ? e - s : e + 24 * 60 - s;
}

export function shiftHours(start: string, end: string): number {
  return shiftMinutes(start, end) / 60;
}

// Läuft die Schicht über Mitternacht (endet am Folgetag)?
export function crossesMidnight(start: string, end: string): boolean {
  return toMinutes(end) < toMinutes(start);
}
