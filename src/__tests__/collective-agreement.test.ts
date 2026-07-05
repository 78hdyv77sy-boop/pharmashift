import { describe, it, expect } from "vitest";
import {
  noticePeriodForYears,
  violatesMaternityNightRule,
  requiredRestAfterDuty,
  SALARY_TABLES_2026,
  APOTHEKER_SALARY_2026,
  PKA_BG4_SALARY_2026,
} from "@/lib/domain/collective-agreement";

describe("KV: Kündigungsfristen (Dienstgeber)", () => {
  it("staffelt korrekt nach Dienstdauer", () => {
    expect(noticePeriodForYears(1).weeks).toBe(6);
    expect(noticePeriodForYears(3).months).toBe(2);
    expect(noticePeriodForYears(10).months).toBe(3);
    expect(noticePeriodForYears(20).months).toBe(4);
    expect(noticePeriodForYears(30).months).toBe(5);
  });
  it("Grenzfälle: exakt an der Jahresgrenze", () => {
    expect(noticePeriodForYears(2).months).toBe(2); // ab 2 Jahren
    expect(noticePeriodForYears(5).months).toBe(3); // ab 5 Jahren
  });
});

describe("KV: Schwangeren-Nachtarbeitsverbot (MSchG §6, 20–6 Uhr)", () => {
  it("verbietet Nachtdienst 18–08", () => {
    expect(violatesMaternityNightRule("18:00", "08:00")).toBe(true);
  });
  it("verbietet Spätschicht bis 22 Uhr", () => {
    expect(violatesMaternityNightRule("14:00", "22:00")).toBe(true);
  });
  it("erlaubt reine Tagschicht 08–18", () => {
    expect(violatesMaternityNightRule("08:00", "18:00")).toBe(false);
  });
  it("erlaubt Vormittag 08–12", () => {
    expect(violatesMaternityNightRule("08:00", "12:00")).toBe(false);
  });
});

describe("KV: Verlängerte Ruhezeit nach Dienst", () => {
  it("normaler Dienst (≤13h) = 11h Ruhe", () => {
    expect(requiredRestAfterDuty(8)).toBe(11);
    expect(requiredRestAfterDuty(13)).toBe(11);
  });
  it("verlängerter Dienst (>13h, <25h) = 22h Ruhe", () => {
    expect(requiredRestAfterDuty(14)).toBe(22);
    expect(requiredRestAfterDuty(24)).toBe(22);
  });
  it("25h-Dienst = 23h Ruhe", () => {
    expect(requiredRestAfterDuty(25)).toBe(23);
  });
});

describe("KV: Gehaltstabellen-Integrität", () => {
  it("4 Gruppen hinterlegt", () => {
    expect(SALARY_TABLES_2026).toHaveLength(4);
  });
  it("Apotheker hat 18 Stufen, aufsteigend", () => {
    expect(APOTHEKER_SALARY_2026).toHaveLength(18);
    for (let i = 1; i < APOTHEKER_SALARY_2026.length; i++) {
      expect(APOTHEKER_SALARY_2026[i].amount).toBeGreaterThan(APOTHEKER_SALARY_2026[i - 1].amount);
    }
  });
  it("PKA BG4 Einstieg 2026 = 2.372 €", () => {
    expect(PKA_BG4_SALARY_2026[0].amount).toBe(2372);
  });
});
