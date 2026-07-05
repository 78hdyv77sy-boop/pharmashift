export const ABSENCE_TYPES = ["VACATION", "SICK", "TRAINING", "OTHER"] as const;
export type AbsenceTypeKey = (typeof ABSENCE_TYPES)[number];

export const ABSENCE_TYPE_LABEL: Record<string, string> = {
  VACATION: "Urlaub",
  SICK: "Krank",
  TRAINING: "Fortbildung",
  OTHER: "Sonstiges",
};
export const ABSENCE_STATUS_LABEL: Record<string, string> = {
  REQUESTED: "Beantragt",
  APPROVED: "Genehmigt",
  DECLINED: "Abgelehnt",
};

export interface AbsenceRow {
  id: string;
  employeeId: string;
  employeeName: string;
  startDate: string;
  endDate: string;
  type: string;
  status: string;
  note: string | null;
}
