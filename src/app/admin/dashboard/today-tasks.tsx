"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ListChecks, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/toaster";
import { toggleTaskCompletion } from "../tasks/actions";
import type { TaskInstance } from "../tasks/task-types";

export function TodayTasks({ today, instances }: { today: string; instances: TaskInstance[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [list, setList] = React.useState<TaskInstance[]>(instances);
  React.useEffect(() => { setList(instances); }, [instances]);

  async function toggle(t: TaskInstance) {
    if (!t.canComplete) return;
    const next = !t.done;
    setList((prev) => prev.map((x) => (x.taskId === t.taskId ? { ...x, done: next } : x)));
    const res = await toggleTaskCompletion(t.taskId, today, next);
    if (!res.ok) {
      setList((prev) => prev.map((x) => (x.taskId === t.taskId ? { ...x, done: !next } : x)));
      toast(res.error ?? "Fehler", "error");
      return;
    }
    router.refresh();
  }

  const done = list.filter((t) => t.done).length;

  return (
    <section className="rounded-lg border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold"><ListChecks className="h-4 w-4" /> Aufgaben heute</h2>
        {list.length > 0 && <Badge variant={done === list.length ? "success" : "secondary"}>{done}/{list.length}</Badge>}
      </div>
      <ul className="space-y-1.5">
        {list.map((t) => (
          <li key={t.taskId} className="flex items-start gap-2.5 rounded-md border p-2 text-sm">
            <Checkbox className="mt-0.5" checked={t.done} disabled={!t.canComplete} onCheckedChange={() => toggle(t)} />
            <div className="min-w-0 flex-1">
              <span className={t.done ? "text-muted-foreground line-through" : "font-medium"}>
                {t.time && <span className="mr-1 text-muted-foreground">{t.time}</span>}{t.title}
              </span>
              <span className="ml-2 text-xs text-muted-foreground">
                {t.assigneeType === "PERSON" ? t.assigneeName ?? "—" : "wer Dienst hat"}{t.locationName ? ` · ${t.locationName}` : ""}
              </span>
              {t.done && t.doneByName && <span className="ml-2 text-xs text-emerald-700">✓ {t.doneByName}</span>}
            </div>
          </li>
        ))}
      </ul>
      <Link href="/admin/tasks" className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        Alle Aufgaben <ArrowRight className="h-3 w-3" />
      </Link>
    </section>
  );
}
