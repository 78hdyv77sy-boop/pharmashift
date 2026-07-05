export interface ShiftTemplateRow {
  id: string;
  name: string;
  locationId: string | null;
  locationName: string | null;
  startTime: string;
  endTime: string;
  requiredHeadcount: number;
  color: string | null;
}
