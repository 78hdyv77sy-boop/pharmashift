import { describe, it, expect } from "vitest";
import { isTaskDue, type DueContext } from "@/lib/domain/task-recurrence";

const daily: DueContext = { recurrence: "DAILY", weekday: null, dueDateIso: null };
const weeklyMon: DueContext = { recurrence: "WEEKLY", weekday: 1, dueDateIso: null };
const onceX: DueContext = { recurrence: "ONCE", weekday: null, dueDateIso: "2026-06-15" };
const shift: DueContext = { recurrence: "SHIFT", weekday: null, dueDateIso: null };

describe("Aufgaben: isTaskDue", () => {
  it("DAILY ist immer fällig", () => {
    expect(isTaskDue(daily, "2026-06-15", 1, false)).toBe(true);
    expect(isTaskDue(daily, "2026-06-20", 6, false)).toBe(true);
  });

  it("WEEKLY nur am passenden Wochentag", () => {
    expect(isTaskDue(weeklyMon, "2026-06-15", 1, false)).toBe(true); // Montag
    expect(isTaskDue(weeklyMon, "2026-06-16", 2, false)).toBe(false); // Dienstag
  });

  it("ONCE nur am Datum", () => {
    expect(isTaskDue(onceX, "2026-06-15", 1, false)).toBe(true);
    expect(isTaskDue(onceX, "2026-06-16", 2, false)).toBe(false);
  });

  it("SHIFT nur wenn ein Dienst vorhanden ist", () => {
    expect(isTaskDue(shift, "2026-06-15", 1, true)).toBe(true);
    expect(isTaskDue(shift, "2026-06-15", 1, false)).toBe(false);
  });
});
