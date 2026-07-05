import { describe, it, expect } from "vitest";
import { buildICalendar } from "@/lib/export/ical";

describe("iCal-Builder", () => {
  it("baut gültige VEVENT-Struktur mit Escaping", () => {
    const ics = buildICalendar("Plan; Test", [
      { uid: "1@x", dateISO: "2026-06-12", startTime: "08:00", endTime: "16:00", summary: "Schicht, früh", description: "Zeile1\nZeile2" },
    ]);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("X-WR-CALNAME:Plan\\; Test");
    expect(ics).toContain("DTSTART:20260612T080000");
    expect(ics).toContain("SUMMARY:Schicht\\, früh");
    expect(ics).toContain("DESCRIPTION:Zeile1\\nZeile2");
    expect(ics.endsWith("END:VCALENDAR")).toBe(true);
  });
});
