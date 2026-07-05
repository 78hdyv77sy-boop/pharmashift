// Nachtdienst-Tarife VAAÖ 2026 — pure Logik (kein Server/Prisma), Vitest-testbar.
// Quelle: VAAÖ "Bezüge für pharmazeutische Fachkräfte ab 1. Jänner 2026",
// Abschnitt II d) "Entlohnung pro Inanspruchnahme (Abs 8)".

export type NightDutyTier = "TAG_332" | "ABEND_652" | "NACHT_1444";

// Beträge in CENT (Ganzzahl-Arithmetik gegen Rundungsfehler bei Geld).
// Pro Inanspruchnahme: Grundlohn + Zuschlag (beide gleich hoch; Zuschlag
// steuerbegünstigt, daher getrennt geführt).
export interface TierTariff {
  base: number; // Grundlohn-Anteil (Cent)
  bonus: number; // Zuschlag-Anteil (Cent)
}

export const NIGHTDUTY_TARIFFS_2026: Record<NightDutyTier, TierTariff> = {
  TAG_332: { base: 166, bonus: 166 }, // 3,32 €
  ABEND_652: { base: 326, bonus: 326 }, // 6,52 €
  NACHT_1444: { base: 722, bonus: 722 }, // 14,44 €
};

// Pauschale je voller Nachtbereitschaft (Abs 6), in Cent.
export const NIGHTDUTY_PAUSCHALE_2026 = {
  baseWage: 13434, // Grundlohn 134,34 €
  nightBonus: 11747, // Nachtarbeitszuschlag 117,47 €
};

export function tierTotal(tier: NightDutyTier, tariffs = NIGHTDUTY_TARIFFS_2026): number {
  const t = tariffs[tier];
  return t.base + t.bonus;
}

/**
 * Ermittelt den Inanspruchnahme-Tarif für einen Zeitpunkt.
 * Regeln (VAAÖ Abs 8):
 *  - 1:00–7:00 täglich            -> NACHT_1444 (14,44 €)
 *  - 20:00–01:00 und 7:00–8:00    -> ABEND_652 (6,52 €)
 *  - So/Feiertag 8:00–20:00       -> TAG_332 (3,32 €)
 *  - werktags 18:00–20:00         -> TAG_332
 *  - Samstag 12:00–18:00          -> TAG_332
 * Außerhalb dieser Fenster: kein Inanspruchnahme-Tarif (Dienst läuft normal,
 * aber tagsüber werktags gibt es keine Nachtdienstgebühr) -> wir geben den
 * nächstliegenden gültigen Tarif NICHT zurück, sondern null.
 *
 * @param date  Lokales Datum/Uhrzeit der Inanspruchnahme
 * @param isHoliday  true, wenn der Tag ein (bundesweiter) Feiertag ist
 */
export function resolveTier(date: Date, isHoliday: boolean): NightDutyTier | null {
  const day = date.getDay(); // 0=So .. 6=Sa
  const minutes = date.getHours() * 60 + date.getMinutes();

  const h1 = 1 * 60;
  const h7 = 7 * 60;
  const h8 = 8 * 60;
  const h12 = 12 * 60;
  const h18 = 18 * 60;
  const h20 = 20 * 60;

  // 1:00–7:00 täglich = höchster Tarif
  if (minutes >= h1 && minutes < h7) return "NACHT_1444";

  // 20:00–24:00 ODER 00:00–01:00 ODER 7:00–8:00 = mittlerer Tarif
  if (minutes >= h20 || minutes < h1 || (minutes >= h7 && minutes < h8)) return "ABEND_652";

  // Ab hier: 8:00–20:00 -> nur an bestimmten Tagen/Zeiten Tagtarif
  const isSunOrHoliday = day === 0 || isHoliday;
  if (isSunOrHoliday && minutes >= h8 && minutes < h20) return "TAG_332";

  const isSaturday = day === 6;
  if (isSaturday && minutes >= h12 && minutes < h18) return "TAG_332";

  // werktags (Mo–Fr) 18:00–20:00
  const isWeekday = day >= 1 && day <= 5;
  if (isWeekday && !isHoliday && minutes >= h18 && minutes < h20) return "TAG_332";

  // werktags tagsüber 8–18: keine Inanspruchnahme-Gebühr
  return null;
}

// Österreichische BUNDESWEITE gesetzliche Feiertage.
// Bewegliche Feiertage (Ostermontag, Christi Himmelfahrt, Pfingstmontag,
// Fronleichnam) werden aus dem Ostersonntag (Gauß/Butcher) berechnet.
export function austrianHolidays(year: number): Set<string> {
  const fixed = [
    [1, 1], // Neujahr
    [1, 6], // Heilige Drei Könige
    [5, 1], // Staatsfeiertag
    [8, 15], // Mariä Himmelfahrt
    [10, 26], // Nationalfeiertag
    [11, 1], // Allerheiligen
    [12, 8], // Mariä Empfängnis
    [12, 25], // Christtag
    [12, 26], // Stefanitag
  ];
  const set = new Set<string>();
  const iso = (m: number, d: number) => `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  for (const [m, d] of fixed) set.add(iso(m, d));

  // Ostersonntag (Meeus/Jones/Butcher-Algorithmus)
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const dd = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - dd - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const dayE = ((h + l - 7 * m + 114) % 31) + 1;
  const easter = new Date(Date.UTC(year, month - 1, dayE));

  const addDays = (base: Date, n: number) => {
    const x = new Date(base);
    x.setUTCDate(x.getUTCDate() + n);
    return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}-${String(x.getUTCDate()).padStart(2, "0")}`;
  };
  set.add(addDays(easter, 1)); // Ostermontag
  set.add(addDays(easter, 39)); // Christi Himmelfahrt
  set.add(addDays(easter, 50)); // Pfingstmontag
  set.add(addDays(easter, 60)); // Fronleichnam

  return set;
}

export function isAustrianHoliday(date: Date): boolean {
  const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return austrianHolidays(date.getFullYear()).has(iso);
}

// Cent -> "12,34 €"
export function formatEuro(cent: number): string {
  return `${(cent / 100).toFixed(2).replace(".", ",")} €`;
}
