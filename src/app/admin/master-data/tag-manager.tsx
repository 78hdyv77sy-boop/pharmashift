"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Item = { id: string; name: string };

export function TagManager({
  title,
  description,
  items,
  canManage,
  onAdd,
  onDelete,
}: {
  title: string;
  description: string;
  items: Item[];
  canManage: boolean;
  onAdd: (name: string) => Promise<{ ok: boolean; error?: string }>;
  onDelete: (id: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function add() {
    if (!name.trim()) return;
    setPending(true);
    setError(null);
    const res = await onAdd(name.trim());
    setPending(false);
    if (!res.ok) return setError(res.error ?? "Fehler");
    setName("");
    router.refresh();
  }

  async function del(id: string) {
    await onDelete(id);
    router.refresh();
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {items.length === 0 && <span className="text-sm text-muted-foreground">Noch keine Einträge.</span>}
        {items.map((it) => (
          <span key={it.id} className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-sm">
            {it.name}
            {canManage && (
              <button onClick={() => del(it.id)} className="text-muted-foreground hover:text-destructive" aria-label="Entfernen">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        ))}
      </div>

      {canManage && (
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder={`${title} hinzufügen…`}
            className="max-w-xs"
          />
          <Button variant="outline" onClick={add} disabled={pending || !name.trim()}>
            <Plus className="h-4 w-4" /> Hinzufügen
          </Button>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
