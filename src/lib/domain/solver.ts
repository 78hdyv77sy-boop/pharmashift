// Deterministischer Wochen-Solver (AI-P3 / 8.6 V4).
// Leitprinzip: LLM für Sprache, SOLVER für Mathematik, Mensch für Freigabe.
// Pur (kein Prisma/Server) -> vollständig per Vitest testbar.

export interface SolverShift {
  id: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string;
  requiredHeadcount: number;
  requiredRoles: Record<string, number> | null; // z.B. { APOTHEKER: 1 }
  assignedEmployeeIds: string[]; // bestehende Zuweisungen (werden NICHT angetastet)
}

export interface SolverEmployee {
  id: string;
  name: string;
  type: string; // APOTHEKER, PKA, ...
  weeklyHoursTarget: number | null;
  absentDates: Set<string>; // genehmigte Abwesenheit
  unavailableDates: Set<string>; // Verfügbarkeitsregel UNAVAILABLE
  nightWorkRestricted?: boolean; // KV/MSchG: kein Nachtdienst 20-6 Uhr
  preferredDates: Set<string>; // PREFERRED
  presetHours: number; // bereits zugewiesene Stunden in der Woche (Bestand)
}

export interface SolverAssignment {
  shiftId: string;
  employeeId: string;
  reason: string; // deterministische Begründung
}

export interface SolverWarning {
  shiftId: string;
  message: string;
}

export interface SolverResult {
  assignments: SolverAssignment[];
  warnings: SolverWarning[];
}

// --- Zeit-Helfer (HH:MM, same-day) -----------------------------------------
export function toMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
export function shiftHours(start: string, end: string): number {
  return Math.max(0, (toMin(end) - toMin(start)) / 60);
}
function overlaps(aS: string, aE: string, bS: string, bE: string): boolean {
  return toMin(aS) < toMin(bE) && toMin(bS) < toMin(aE);
}
function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

// AZG-Vorstufe (verbindliche harte Regeln des Solvers):
const MIN_REST_MINUTES = 11 * 60; // §12 AZG: 11h tägliche Ruhezeit
const MAX_WEEK_HOURS = 48; // §9 AZG: Höchstgrenze Wochenarbeitszeit

interface InternalState {
  hours: Map<string, number>; // employeeId -> Stunden (inkl. Bestand)
  perDay: Map<string, { date: string; start: string; end: string }[]>; // employeeId -> Einsätze
  weekendCount: Map<string, number>;
}

function isWeekend(date: string): boolean {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 || d === 6;
}

// Berührt die Schicht das Nachtfenster 20:00–06:00? (für Nachtarbeitsverbot)
function touchesNightWindow(start: string, end: string): boolean {
  const s = toMin(start);
  let e = toMin(end);
  if (e <= s) e += 24 * 60;
  // Verbotsfenster 20:00 (1200) bis 06:00+24 (1800)
  return s < 1800 && e > 1200;
}

function violatesHard(emp: SolverEmployee, shift: SolverShift, st: InternalState): string | null {
  if (emp.absentDates.has(shift.date)) return "abwesend";
  if (emp.unavailableDates.has(shift.date)) return "nicht verfügbar";
  // KV/MSchG: Nachtarbeitsverbot 20-6 Uhr (Schwangere/Stillende)
  if (emp.nightWorkRestricted && touchesNightWindow(shift.startTime, shift.endTime)) return "Nachtarbeitsverbot";

  const entries = st.perDay.get(emp.id) ?? [];
  for (const e of entries) {
    const diff = dayDiff(e.date, shift.date);
    if (diff === 0 && overlaps(e.start, e.end, shift.startTime, shift.endTime)) return "Überschneidung";
    // Ruhezeit zwischen aufeinanderfolgenden Tagen. Nach langem (Nacht-)Dienst
    // gilt verlängerte Ruhezeit: >13h -> 22h, >=25h -> 23h (KV/AZG).
    if (diff === 1) {
      const prevDur = shiftHours(e.start, e.end) + (toMin(e.end) <= toMin(e.start) ? 24 : 0);
      const needRest = prevDur > 13 ? (prevDur >= 25 ? 23 : 22) * 60 : MIN_REST_MINUTES;
      const rest = 24 * 60 - toMin(e.end) + toMin(shift.startTime);
      if (rest < needRest) return prevDur > 13 ? "verlängerte Ruhezeit" : "Ruhezeit <11h";
    }
    if (diff === -1) {
      const curDur = shiftHours(shift.startTime, shift.endTime) + (toMin(shift.endTime) <= toMin(shift.startTime) ? 24 : 0);
      const needRest = curDur > 13 ? (curDur >= 25 ? 23 : 22) * 60 : MIN_REST_MINUTES;
      const rest = 24 * 60 - toMin(shift.endTime) + toMin(e.start);
      if (rest < needRest) return curDur > 13 ? "verlängerte Ruhezeit" : "Ruhezeit <11h";
    }
  }

  const newHours = (st.hours.get(emp.id) ?? 0) + shiftHours(shift.startTime, shift.endTime);
  if (newHours > MAX_WEEK_HOURS) return ">48h/Woche";
  return null;
}

function score(emp: SolverEmployee, shift: SolverShift, st: InternalState): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let sc = 0;

  if (emp.preferredDates.has(shift.date)) { sc += 30; reasons.push("bevorzugt diesen Tag"); }

  // Stunden-Soll-Treue: wer unter Soll ist, bekommt Vorrang
  const cur = st.hours.get(emp.id) ?? 0;
  const after = cur + shiftHours(shift.startTime, shift.endTime);
  if (emp.weeklyHoursTarget !== null) {
    const deficitBefore = emp.weeklyHoursTarget - cur;
    sc += Math.max(-20, Math.min(25, deficitBefore * 2));
    if (after > emp.weeklyHoursTarget) { sc -= (after - emp.weeklyHoursTarget) * 4; reasons.push("über Soll"); }
    else reasons.push(`${after}/${emp.weeklyHoursTarget}h`);
  } else {
    sc -= cur; // ohne Soll: gleichmäßig verteilen
  }

  // Wochenend-Fairness
  if (isWeekend(shift.date)) {
    const we = st.weekendCount.get(emp.id) ?? 0;
    sc -= we * 8;
    if (we === 0) reasons.push("Wochenende fair");
  }

  return { score: sc, reasons };
}

function commit(emp: SolverEmployee, shift: SolverShift, st: InternalState) {
  st.hours.set(emp.id, (st.hours.get(emp.id) ?? 0) + shiftHours(shift.startTime, shift.endTime));
  const arr = st.perDay.get(emp.id) ?? [];
  arr.push({ date: shift.date, start: shift.startTime, end: shift.endTime });
  st.perDay.set(emp.id, arr);
  if (isWeekend(shift.date)) st.weekendCount.set(emp.id, (st.weekendCount.get(emp.id) ?? 0) + 1);
}

/**
 * Füllt offene Plätze bestehender Schichten (greedy, rollen-zuerst).
 * Bestehende Zuweisungen bleiben unangetastet und zählen als Bestand.
 */
export function solveWeekGaps(shifts: SolverShift[], employees: SolverEmployee[]): SolverResult {
  const assignments: SolverAssignment[] = [];
  const warnings: SolverWarning[] = [];
  const byId = new Map(employees.map((e) => [e.id, e] as const));

  // Bestand in den Zustand übernehmen
  const st: InternalState = { hours: new Map(), perDay: new Map(), weekendCount: new Map() };
  for (const e of employees) st.hours.set(e.id, e.presetHours);
  for (const s of shifts) {
    for (const id of s.assignedEmployeeIds) {
      const emp = byId.get(id);
      if (emp) commit(emp, { ...s, assignedEmployeeIds: [] }, st);
    }
  }
  // presetHours wurden in commit doppelt addiert? Nein: presetHours = Stunden AUSSERHALB der übergebenen Schichten.

  const ordered = [...shifts].sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));

  for (const shift of ordered) {
    const taken = new Set(shift.assignedEmployeeIds);
    const open = shift.requiredHeadcount - taken.size;
    if (open <= 0) continue;

    // 1) Rollen-Pflicht zuerst (z.B. APOTHEKER >= 1, gesetzlich relevant)
    const roleNeeds: [string, number][] = [];
    if (shift.requiredRoles) {
      for (const [role, n] of Object.entries(shift.requiredRoles)) {
        const have = [...taken].filter((id) => byId.get(id)?.type === role).length;
        if (n - have > 0) roleNeeds.push([role, n - have]);
      }
    }

    function pickBest(filter: (e: SolverEmployee) => boolean, why: string): boolean {
      let best: { emp: SolverEmployee; sc: number; reasons: string[] } | null = null;
      for (const emp of employees) {
        if (taken.has(emp.id) || !filter(emp)) continue;
        if (violatesHard(emp, shift, st)) continue;
        const { score: sc, reasons } = score(emp, shift, st);
        if (!best || sc > best.sc || (sc === best.sc && emp.name.localeCompare(best.emp.name) < 0)) {
          best = { emp, sc, reasons };
        }
      }
      if (!best) return false;
      taken.add(best.emp.id);
      commit(best.emp, shift, st);
      assignments.push({
        shiftId: shift.id,
        employeeId: best.emp.id,
        reason: [why, ...best.reasons].filter(Boolean).join(", "),
      });
      return true;
    }

    let remaining = open;
    for (const [role, need] of roleNeeds) {
      for (let i = 0; i < need && remaining > 0; i++) {
        if (pickBest((e) => e.type === role, `Pflicht: ${role}`)) remaining--;
        else warnings.push({ shiftId: shift.id, message: `Keine ${role}-Besetzung möglich (${shift.date} ${shift.startTime})` });
      }
    }
    while (remaining > 0) {
      if (pickBest(() => true, "")) remaining--;
      else { warnings.push({ shiftId: shift.id, message: `Unterbesetzt: ${shift.date} ${shift.startTime} (${remaining} offen)` }); break; }
    }
  }

  return { assignments, warnings };
}

// ============================================================================
//  AUTO-UMBUCHUNG bei AZG-Konflikt ("Silent Rotation", aber transparent)
//  Pur & testbar. Findet illegale BESTEHENDE Zuweisungen und schlägt einen
//  gültigen Ersatz GLEICHER ROLLE vor, der selbst keinen Verstoß bekommt.
// ============================================================================

export interface ConflictFinding {
  shiftId: string;
  employeeId: string;
  reason: string; // welche harte Regel verletzt ist (z.B. "Ruhezeit <11h")
}

export interface ReassignSuggestion {
  shiftId: string;
  fromEmployeeId: string;
  toEmployeeId: string;
  reason: string; // deterministische Begründung der Umbuchung
}

// Zustand aus allen Einsätzen eines Mitarbeiters in `shifts`, ohne die zu
// prüfende Schicht (damit deren Legalität gegen die übrigen geprüft wird).
function stateForEmployee(emp: SolverEmployee, shifts: SolverShift[], exceptShiftId?: string): InternalState {
  const st: InternalState = { hours: new Map(), perDay: new Map(), weekendCount: new Map() };
  st.hours.set(emp.id, emp.presetHours);
  for (const s of shifts) {
    if (s.id === exceptShiftId) continue;
    if (s.assignedEmployeeIds.includes(emp.id)) {
      commit(emp, { ...s, assignedEmployeeIds: [] }, st);
    }
  }
  return st;
}

// Findet bestehende Zuweisungen, die eine harte AZG-Regel verletzen.
export function findHardConflicts(shifts: SolverShift[], employees: SolverEmployee[]): ConflictFinding[] {
  const byId = new Map(employees.map((e) => [e.id, e] as const));
  const findings: ConflictFinding[] = [];
  for (const shift of shifts) {
    for (const eid of shift.assignedEmployeeIds) {
      const emp = byId.get(eid);
      if (!emp) continue;
      const st = stateForEmployee(emp, shifts, shift.id);
      const reason = violatesHard(emp, shift, st);
      if (reason) findings.push({ shiftId: shift.id, employeeId: eid, reason });
    }
  }
  return findings;
}

// Bester gültiger Ersatz (gleiche Rolle, kein eigener Verstoß), nach Fairness/
// Präferenz gerankt. null = kein passender Ersatz verfügbar.
export function suggestReassignment(
  conflict: ConflictFinding,
  shifts: SolverShift[],
  employees: SolverEmployee[],
): ReassignSuggestion | null {
  const byId = new Map(employees.map((e) => [e.id, e] as const));
  const shift = shifts.find((s) => s.id === conflict.shiftId);
  const from = byId.get(conflict.employeeId);
  if (!shift || !from) return null;

  let best: { emp: SolverEmployee; sc: number; reasons: string[] } | null = null;
  for (const emp of employees) {
    if (emp.id === from.id) continue;
    if (emp.type !== from.type) continue; // gleiche Rolle (PDF Schritt 2)
    if (shift.assignedEmployeeIds.includes(emp.id)) continue; // schon auf dieser Schicht
    const st = stateForEmployee(emp, shifts, shift.id);
    if (violatesHard(emp, shift, st)) continue; // Ersatz darf selbst keinen Verstoß bekommen
    const { score: sc, reasons } = score(emp, shift, st);
    if (!best || sc > best.sc || (sc === best.sc && emp.name.localeCompare(best.emp.name) < 0)) {
      best = { emp, sc, reasons };
    }
  }
  if (!best) return null;
  return {
    shiftId: shift.id,
    fromEmployeeId: from.id,
    toEmployeeId: best.emp.id,
    reason: [`statt ${from.name} (${conflict.reason})`, ...best.reasons].filter(Boolean).join(", "),
  };
}
