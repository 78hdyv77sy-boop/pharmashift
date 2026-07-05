// Geteilte Typen für den Schichttausch-Genehmigungs-Ablauf (client-sicher).

export type SwapStatusValue = "REQUESTED" | "ACCEPTED" | "DECLINED" | "CANCELLED";

export interface AssignedShiftOption {
  assignmentId: string;
  label: string; // z. B. "Di 16.06. · 08:00–14:00 · Filiale Nord"
  date: string; // ISO YYYY-MM-DD
}

export interface SwapEmployeeOption {
  id: string;
  name: string;
}

export interface SwapRow {
  id: string;
  status: SwapStatusValue;
  createdAt: string; // ISO
  requesterName: string; // Antragsteller:in (Mitarbeiter:in)
  fromLabel: string; // deren Schicht
  targetName: string; // Tauschpartner:in
  toLabel: string | null; // deren Gegen-Schicht (null = reine Übergabe)
  note: string | null;
  canDecide: boolean; // darf annehmen/ablehnen (Zielperson oder Leitung)
  canCancel: boolean; // darf zurückziehen (Antragsteller:in oder Leitung)
}
