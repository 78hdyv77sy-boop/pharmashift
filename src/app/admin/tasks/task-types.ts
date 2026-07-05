import type { TaskRecurrenceValue, TaskAssigneeValue } from "@/lib/domain/task-recurrence";

// Eine Aufgaben-Definition (für die Verwaltungsliste).
export interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  assigneeType: TaskAssigneeValue;
  assigneeName: string | null; // Name der Person (bei PERSON)
  locationName: string | null;
  time: string | null;
  recurrence: TaskRecurrenceValue;
  weekday: number | null;
  dueDate: string | null; // ISO
  active: boolean;
}

// Eine an einem konkreten Tag fällige Aufgabe (für die Tagesansicht).
export interface TaskInstance {
  taskId: string;
  title: string;
  description: string | null;
  time: string | null;
  assigneeType: TaskAssigneeValue;
  assigneeName: string | null;
  locationName: string | null;
  done: boolean;
  doneByName: string | null;
  doneAt: string | null; // ISO
  canComplete: boolean; // darf der aktuelle User abhaken?
}

export interface TaskEmployeeOption { id: string; name: string }
export interface TaskLocationOption { id: string; name: string }
