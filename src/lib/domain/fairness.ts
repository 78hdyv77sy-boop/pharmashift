// Fairness-Engine (nur Anzeige): gewichteter Score aus unbeliebten Diensten.
// Pur & client-sicher (per Vitest testbar). Beeinflusst NICHT die Zuteilung.

export type FairnessRange = "90d" | "year" | "all";

export const RANGE_LABEL: Record<FairnessRange, string> = {
  "90d": "Letzte 90 Tage",
  year: "Laufendes Jahr",
  all: "Gesamte Historie",
};

// Gewichtung laut Konzept: Nacht 5×, Feiertag 3×, Wochenende 2×, Abend 1×.
export const FAIRNESS_WEIGHTS = { night: 5, holiday: 3, weekend: 2, evening: 1 } as const;

// Abendschicht = endet um 17:00 oder später.
export const EVENING_END_MIN = 17 * 60;

export interface FairnessCounts {
  night: number;
  holiday: number;
  weekend: number;
  evening: number;
}

export function rawScore(c: FairnessCounts): number {
  return (
    c.night * FAIRNESS_WEIGHTS.night +
    c.holiday * FAIRNESS_WEIGHTS.holiday +
    c.weekend * FAIRNESS_WEIGHTS.weekend +
    c.evening * FAIRNESS_WEIGHTS.evening
  );
}

export function isEveningEnd(endTime: string): boolean {
  const [h, m] = endTime.split(":").map(Number);
  return h * 60 + m >= EVENING_END_MIN;
}

export function isWeekendDow(dow: number): boolean {
  return dow === 0 || dow === 6; // So oder Sa
}

// Normalisiert Rohwerte einer Gruppe auf 0..100 (höchste Last = 100).
export function normalizeScores(raws: number[]): number[] {
  const max = Math.max(0, ...raws);
  if (max === 0) return raws.map(() => 0);
  return raws.map((r) => Math.round((r / max) * 100));
}
