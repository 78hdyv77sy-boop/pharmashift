import { describe, it, expect } from "vitest";
import {
  resolveTier,
  tierTotal,
  austrianHolidays,
  isAustrianHoliday,
  formatEuro,
  NIGHTDUTY_TARIFFS_2026,
} from "@/lib/domain/nightduty-tariffs";

// Hilfsfunktion: lokales Datum bauen (Wochentag relevant)
function at(y: number, m: number, d: number, hh: number, mm = 0): Date {
  return new Date(y, m - 1, d, hh, mm);
}

describe("Nachtdienst-Tarife: Zeitfenster (werktags)", () => {
  // 2026-06-17 ist ein Mittwoch (Werktag, kein Feiertag)
  it("1:00–7:00 = höchster Tarif (14,44 €)", () => {
    expect(resolveTier(at(2026, 6, 17, 1, 0), false)).toBe("NACHT_1444");
    expect(resolveTier(at(2026, 6, 17, 3, 30), false)).toBe("NACHT_1444");
    expect(resolveTier(at(2026, 6, 17, 6, 59), false)).toBe("NACHT_1444");
  });
  it("20:00–01:00 und 7:00–8:00 = mittlerer Tarif (6,52 €)", () => {
    expect(resolveTier(at(2026, 6, 17, 20, 0), false)).toBe("ABEND_652");
    expect(resolveTier(at(2026, 6, 17, 23, 30), false)).toBe("ABEND_652");
    expect(resolveTier(at(2026, 6, 17, 0, 30), false)).toBe("ABEND_652");
    expect(resolveTier(at(2026, 6, 17, 7, 30), false)).toBe("ABEND_652");
  });
  it("werktags 18:00–20:00 = Tagtarif (3,32 €)", () => {
    expect(resolveTier(at(2026, 6, 17, 18, 0), false)).toBe("TAG_332");
    expect(resolveTier(at(2026, 6, 17, 19, 59), false)).toBe("TAG_332");
  });
  it("werktags 8:00–18:00 = keine Inanspruchnahme-Gebühr", () => {
    expect(resolveTier(at(2026, 6, 17, 10, 0), false)).toBeNull();
    expect(resolveTier(at(2026, 6, 17, 17, 59), false)).toBeNull();
  });
});

describe("Nachtdienst-Tarife: Samstag / Sonntag / Feiertag", () => {
  it("Samstag 12:00–18:00 = Tagtarif", () => {
    // 2026-06-20 = Samstag
    expect(resolveTier(at(2026, 6, 20, 12, 0), false)).toBe("TAG_332");
    expect(resolveTier(at(2026, 6, 20, 17, 59), false)).toBe("TAG_332");
  });
  it("Sonntag 8:00–20:00 = Tagtarif", () => {
    // 2026-06-21 = Sonntag
    expect(resolveTier(at(2026, 6, 21, 8, 0), false)).toBe("TAG_332");
    expect(resolveTier(at(2026, 6, 21, 19, 0), false)).toBe("TAG_332");
  });
  it("Feiertag werktags wie Sonntag behandelt (8–20 Tagtarif)", () => {
    // 2026-10-26 Nationalfeiertag (Montag)
    expect(isAustrianHoliday(at(2026, 10, 26, 12, 0))).toBe(true);
    expect(resolveTier(at(2026, 10, 26, 10, 0), true)).toBe("TAG_332");
  });
  it("Nacht schlägt Feiertag-Tag: 1–7 bleibt 14,44 € auch am Feiertag", () => {
    expect(resolveTier(at(2026, 10, 26, 3, 0), true)).toBe("NACHT_1444");
  });
});

describe("Nachtdienst-Tarife: Beträge & Formatierung", () => {
  it("Tarif-Summen stimmen (Cent)", () => {
    expect(tierTotal("TAG_332")).toBe(332);
    expect(tierTotal("ABEND_652")).toBe(652);
    expect(tierTotal("NACHT_1444")).toBe(1444);
  });
  it("Grundlohn = Zuschlag je Tarif (steuerlich getrennt, gleich hoch)", () => {
    for (const t of Object.values(NIGHTDUTY_TARIFFS_2026)) {
      expect(t.base).toBe(t.bonus);
    }
  });
  it("Euro-Formatierung deutsch", () => {
    expect(formatEuro(332)).toBe("3,32 €");
    expect(formatEuro(1444)).toBe("14,44 €");
    expect(formatEuro(25181)).toBe("251,81 €");
  });
});

describe("Österreichische Feiertage", () => {
  it("2026 enthält feste + bewegliche Feiertage", () => {
    const h = austrianHolidays(2026);
    expect(h.has("2026-01-01")).toBe(true); // Neujahr
    expect(h.has("2026-10-26")).toBe(true); // Nationalfeiertag
    expect(h.has("2026-12-25")).toBe(true); // Christtag
    // Ostersonntag 2026 = 5. April -> Ostermontag 6. April
    expect(h.has("2026-04-06")).toBe(true);
    // Christi Himmelfahrt 2026 = 14. Mai
    expect(h.has("2026-05-14")).toBe(true);
  });
  it("normaler Werktag ist kein Feiertag", () => {
    expect(isAustrianHoliday(at(2026, 6, 17, 12, 0))).toBe(false);
  });
});
