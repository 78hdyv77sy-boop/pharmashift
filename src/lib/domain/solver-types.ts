// Client-sichere Typen für den Solver-Flow (AI-P3).
// Getrennt von solver-actions.ts (use-server-Regel 3.x: keine Typ-Exporte dort).

export interface SolverPlanItem {
  shiftId: string;
  employeeId: string;
  employeeName: string;
  date: string;
  time: string;
  reason: string;
}

export interface SolverPlan {
  ok: boolean;
  error?: string;
  items: SolverPlanItem[];
  warnings: string[];
}

// Auto-Umbuchung bei AZG-Konflikt (transparent: Protokoll + Undo, echte Stunden)
export interface WeekConflict {
  shiftId: string;
  employeeId: string;
  employeeName: string;
  date: string;
  time: string;
  reason: string;
}

export interface ReassignMove {
  date: string;
  time: string;
  fromName: string;
  toName: string;
  reason: string;
}

export interface AutoReassignResult {
  ok: boolean;
  error?: string;
  moves: ReassignMove[];
  unresolved: WeekConflict[];
  interactionId?: string;
  canUndo?: boolean;
}
