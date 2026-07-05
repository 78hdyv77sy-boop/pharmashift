// Kollektivvertrags-Referenzdaten Österreich, Stand 1. Jänner 2026.
// PUR (kein Server/Prisma) — testbar und in Client wie Server nutzbar.
//
// Quellen (offiziell):
//  - VAAÖ "Bezüge für pharmazeutische Fachkräfte ab 1.1.2026"
//  - Apothekerkammer/GPA "Gehalts- und Lohnordnung PKA & Apothekenhilfspersonal 2026"
//  - AZG (Arbeitszeitgesetz), MSchG (Mutterschutzgesetz)
//
// WICHTIG: Beträge sind MINDESTbezüge (Überzahlung möglich) und reine REFERENZ
// zum Nachschlagen. Die App berechnet daraus KEINE Löhne (bewusste Entscheidung,
// siehe Plan §16). Beträge in EURO (nicht Cent), da reine Anzeige.

// ---------------------------------------------------------------------------
// KATEGORIE B — GEHALTSTABELLEN (Nachschlagen)
// ---------------------------------------------------------------------------

export interface SalaryRow {
  label: string; // z.B. "Stufe I (1.–2. Dienstjahr)"
  amount: number; // Monatsbrutto EUR 2026
}

// Berufsberechtigte Apotheker:innen (Gehaltskasse, 2026) — 18 Stufen
export const APOTHEKER_SALARY_2026: SalaryRow[] = [
  { label: "I · 1.–2. Dienstjahr", amount: 3599 },
  { label: "II · 3.–4.", amount: 3762 },
  { label: "III · 5.–6.", amount: 3928 },
  { label: "IV · 7.–8.", amount: 4091 },
  { label: "V · 9.–10.", amount: 4287 },
  { label: "VI · 11.–12.", amount: 4524 },
  { label: "VII · 13.–14.", amount: 4793 },
  { label: "VIII · 15.–16.", amount: 5061 },
  { label: "IX · 17.–18.", amount: 5346 },
  { label: "X · 19.–20.", amount: 5603 },
  { label: "XI · 21.–22.", amount: 5823 },
  { label: "XII · 23.–24.", amount: 6003 },
  { label: "XIII · 25.–26.", amount: 6182 },
  { label: "XIV · 27.–28.", amount: 6309 },
  { label: "XV · 29.–30.", amount: 6428 },
  { label: "XVI · 31.–32.", amount: 6521 },
  { label: "XVII · 33.–34.", amount: 6614 },
  { label: "XVIII · ab 35.", amount: 6700 },
];

// Aspirant:in (Gehaltskasse 2026, Entlohnung) — Pauschale
export const ASPIRANT_SALARY_2026 = { label: "Aspirant:in (Gehaltskasse)", amount: 2104 };

// PKA Beschäftigungsgruppe 4 (geprüfte PKA) — 2026
export const PKA_BG4_SALARY_2026: SalaryRow[] = [
  { label: "1.–2. Berufsjahr", amount: 2372 },
  { label: "3.–4.", amount: 2404 },
  { label: "5.–6.", amount: 2468 },
  { label: "7.–8.", amount: 2632 },
  { label: "9.–10.", amount: 2837 },
  { label: "11.–12.", amount: 3021 },
  { label: "13.–14.", amount: 3173 },
  { label: "15.–16.", amount: 3401 },
  { label: "17.–18.", amount: 3495 },
  { label: "19.–20.", amount: 3651 },
  { label: "ab 20.", amount: 3816 },
];

// Lehrlinge PKA (ohne Matura) — 2026
export const LEHRLING_SALARY_2026: SalaryRow[] = [
  { label: "1. Lehrjahr", amount: 974 },
  { label: "2. Lehrjahr", amount: 1207 },
  { label: "3. Lehrjahr", amount: 1560 },
];

export interface SalaryTable {
  group: string;
  source: string;
  rows: SalaryRow[];
}

export const SALARY_TABLES_2026: SalaryTable[] = [
  { group: "Apotheker:in", source: "VAAÖ Gehaltskasse 2026", rows: APOTHEKER_SALARY_2026 },
  { group: "Aspirant:in", source: "VAAÖ Gehaltskasse 2026", rows: [ASPIRANT_SALARY_2026] },
  { group: "PKA (Beschäftigungsgruppe 4)", source: "Apothekerverband/GPA 2026", rows: PKA_BG4_SALARY_2026 },
  { group: "Lehrling PKA (ohne Matura)", source: "Apothekerverband/GPA 2026", rows: LEHRLING_SALARY_2026 },
];

// ---------------------------------------------------------------------------
// KATEGORIE A — KÜNDIGUNGSFRISTEN (Dienstgeber-Kündigung, nach Dienstdauer)
// Quelle: VAAÖ FAQ / Angestelltengesetz. Für Personalplanung relevant.
// ---------------------------------------------------------------------------

export interface NoticePeriod {
  maxYears: number | null; // Obergrenze der Dienstdauer (null = darüber)
  label: string;
  weeks?: number;
  months?: number;
}

export const NOTICE_PERIODS_EMPLOYER: NoticePeriod[] = [
  { maxYears: 2, label: "unter 2 Jahre", weeks: 6 },
  { maxYears: 5, label: "2 bis 5 Jahre", months: 2 },
  { maxYears: 15, label: "5 bis 15 Jahre", months: 3 },
  { maxYears: 25, label: "15 bis 25 Jahre", months: 4 },
  { maxYears: null, label: "über 25 Jahre", months: 5 },
];

// PKA-Lehrling-Sonderfall: Kündigungsfrist 4 Monate (bzw. 3 bei Neubesetzung).
export const NOTICE_LEHRLING_MONTHS = 4;

/** Liefert die anzuwendende Dienstgeber-Kündigungsfrist für eine Dienstdauer. */
export function noticePeriodForYears(years: number): NoticePeriod {
  for (const p of NOTICE_PERIODS_EMPLOYER) {
    if (p.maxYears === null) return p;
    if (years < p.maxYears) return p;
  }
  return NOTICE_PERIODS_EMPLOYER[NOTICE_PERIODS_EMPLOYER.length - 1];
}

// ---------------------------------------------------------------------------
// KATEGORIE A — ARBEITSZEIT-REGELN (AZG / MSchG) für Solver & Warnungen
// ---------------------------------------------------------------------------

export const WORKTIME_RULES = {
  minRestMinutes: 11 * 60, // §12 AZG tägliche Ruhezeit
  maxWeekHours: 48, // §9 AZG Wochenhöchstgrenze
  // Verlängerter Dienst (Nachtdienst): max 25h wenn ≥1/3 Bereitschaft.
  maxExtendedDutyHours: 25,
  // Verlängerte Ruhezeit nach verlängertem Dienst: immer 22h
  // (nur nach 25h-Dienst: 23h).
  extendedRestHours: 22,
  extendedRest25hHours: 23,
  // MSchG §6: Nachtarbeitsverbot Schwangere/Stillende 20:00–06:00
  maternityNightStart: 20 * 60,
  maternityNightEnd: 6 * 60,
};

/**
 * Prüft, ob eine Schicht ins Schwangeren-Nachtarbeitsverbot (20–6 Uhr) fällt.
 * Behandelt Schichten über Mitternacht.
 */
export function violatesMaternityNightRule(startTime: string, endTime: string): boolean {
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const s = toMin(startTime);
  let e = toMin(endTime);
  if (e <= s) e += 24 * 60; // über Mitternacht

  const nightStart = WORKTIME_RULES.maternityNightStart; // 20:00
  const nightEnd = WORKTIME_RULES.maternityNightEnd + 24 * 60; // 06:00 nächster Tag (für Vergleich)

  // Überlappt [s,e) mit [20:00, 06:00+24)? (vereinfachte, konservative Prüfung)
  // Verbotsfenster im selben Tagesraster: 20:00–30:00 (= 6:00 Folgetag)
  return s < nightEnd && e > nightStart;
}

/**
 * Verlängerte Ruhezeit nach einem (verlängerten) Nachtdienst.
 * @param dutyHours Dauer des Dienstes in Stunden
 * @returns benötigte Ruhezeit in Stunden
 */
export function requiredRestAfterDuty(dutyHours: number): number {
  if (dutyHours <= 13) return WORKTIME_RULES.minRestMinutes / 60; // normal 11h
  if (dutyHours >= 25) return WORKTIME_RULES.extendedRest25hHours; // 23h
  return WORKTIME_RULES.extendedRestHours; // 22h
}
