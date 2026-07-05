export interface ImportRow {
  firstName: string;
  lastName: string;
  type: string;
  locationName?: string;
  weeklyHours?: string;
}
export interface ImportResult {
  ok: boolean;
  created: number;
  errors: { line: number; message: string }[];
  error?: string;
}
