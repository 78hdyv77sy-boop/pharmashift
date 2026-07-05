// Minimaler iCalendar-Generator (RFC 5545, Kernfelder). Floating local time
// (ohne Z), damit Kalender die Zeiten als lokale Apothekenzeit interpretieren.

import { crossesMidnight } from "@/lib/domain/time";
import { addDays } from "@/lib/domain/dates";

export interface ICalEvent {
  uid: string;
  dateISO: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  summary: string;
  description?: string;
  location?: string;
}

function esc(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function dt(dateISO: string, time: string): string {
  return `${dateISO.replace(/-/g, "")}T${time.replace(":", "")}00`;
}

function nowStamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function buildICalendar(calName: string, events: ICalEvent[]): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PharmaShift//Dienstplan//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(calName)}`,
  ];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${nowStamp()}`,
      `DTSTART:${dt(e.dateISO, e.startTime)}`,
      `DTEND:${dt(crossesMidnight(e.startTime, e.endTime) ? addDays(e.dateISO, 1) : e.dateISO, e.endTime)}`,
      `SUMMARY:${esc(e.summary)}`,
    );
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function icalResponse(filename: string, ics: string): Response {
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
