// Client-sicher: keine Prisma-/Server-Imports. Wird von Client-Komponenten
// (Dialoge, Tabellen) UND von server-seitigen Modulen genutzt.

export const EMPLOYEE_TYPES = ["APOTHEKER", "PKA", "BUERO", "ASPIRANT", "LEHRLING", "SONSTIGE"] as const;
export type EmployeeTypeKey = (typeof EMPLOYEE_TYPES)[number];

export const EMPLOYEE_TYPE_LABEL: Record<string, string> = {
  APOTHEKER: "Apotheker:in",
  PKA: "PKA",
  BUERO: "Bürobedienstete:r",
  ASPIRANT: "Aspirant:in",
  LEHRLING: "Lehrling",
  SONSTIGE: "Sonstiges",
};

export interface EmployeeRow {
  id: string;
  firstName: string;
  lastName: string;
  type: string;
  locationName: string | null;
  weeklyHoursTarget: number | null;
  qualificationCount: number;
  active: boolean;
  color: string | null;
}
