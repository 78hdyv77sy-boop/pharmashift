import { describe, it, expect } from "vitest";
import { tallyVotes } from "@/lib/domain/poll";

const opts = [{ id: "ja", label: "Ja" }, { id: "nein", label: "Nein" }];

describe("Umfrage-Auszählung", () => {
  it("zählt Optionen und Prozente korrekt", () => {
    const r = tallyVotes(opts, [
      { userId: "a", optionId: "ja", customText: null },
      { userId: "b", optionId: "ja", customText: null },
      { userId: "c", optionId: "nein", customText: null },
      { userId: "d", optionId: null, customText: "Komme später" },
    ]);
    expect(r.total).toBe(4);
    expect(r.rows[0]).toMatchObject({ label: "Ja", count: 2, percent: 50 });
    expect(r.rows[2]).toMatchObject({ label: "„Komme später“", count: 1, percent: 25 });
  });
  it("leer -> 0 Prozent ohne Division durch Null", () => {
    const r = tallyVotes(opts, []);
    expect(r.total).toBe(0);
    expect(r.rows.every((x) => x.percent === 0)).toBe(true);
  });
});
