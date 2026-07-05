// Wiederverwendbare Schicht-Presets für die Apotheke (Ein-Klick-Zeiten).
// Nachtdienste sind BEWUSST getrennt (eigenes Nachtdienst-Tool) und hier NICHT enthalten.
// Client-sicher (reine Daten).

export interface ShiftPreset {
  label: string;
  start: string; // HH:MM
  end: string; // HH:MM
}

export const SHIFT_PRESETS: ShiftPreset[] = [
  { label: "Vormittag", start: "08:00", end: "12:00" },
  { label: "Nachmittag", start: "14:00", end: "18:00" },
  { label: "Ganztags", start: "08:00", end: "18:00" },
];
