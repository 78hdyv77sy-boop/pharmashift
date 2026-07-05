import type { FairnessCounts, FairnessRange } from "@/lib/domain/fairness";

export interface FairnessRow {
  employeeId: string;
  name: string;
  type: string;
  typeLabel: string;
  counts: FairnessCounts;
  raw: number;
  score: number; // 0..100, normalisiert je Rolle
  mine: boolean;
}

export interface FairnessResult {
  range: FairnessRange;
  viewAll: boolean;
  hasOwn: boolean;
  rows: FairnessRow[];
}
