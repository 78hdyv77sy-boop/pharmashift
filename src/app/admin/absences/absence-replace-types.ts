// Typen für den Ersatz-Entwurf bei genehmigter Abwesenheit (client-sicher).

export interface AbsenceReplacementItem {
  shiftId: string;
  date: string; // ISO
  time: string; // "08:00–14:00"
  locationName: string;
  fromEmployeeId: string;
  fromName: string;
  toEmployeeId: string | null; // Vorschlag; null = kein passender Ersatz
  toName: string | null;
  reason: string;
}

export interface AbsenceReplacementDraft {
  ok: boolean;
  error?: string;
  absentName: string;
  items: AbsenceReplacementItem[];
}
