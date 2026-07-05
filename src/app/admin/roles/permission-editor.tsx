"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { PERMISSION_GROUPS } from "@/lib/permission-meta";
import { setRolePermissions } from "./actions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roleId: string;
  roleName: string;
  initial: string[];
}

export function PermissionEditor({ open, onOpenChange, roleId, roleName, initial }: Props) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<Set<string>>(new Set(initial));
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const locked = roleName === "OrgAdmin";

  React.useEffect(() => setSelected(new Set(initial)), [initial, open]);

  function toggle(key: string) {
    if (locked) return;
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function toggleGroup(keys: string[], allOn: boolean) {
    if (locked) return;
    setSelected((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => (allOn ? next.delete(k) : next.add(k)));
      return next;
    });
  }

  async function save() {
    setPending(true);
    setError(null);
    const res = await setRolePermissions(roleId, [...selected]);
    setPending(false);
    if (!res.ok) return setError(res.error ?? "Fehler");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Berechtigungen: {roleName}</DialogTitle>
          <DialogDescription>
            {locked
              ? "OrgAdmin besitzt immer alle Berechtigungen und ist nicht editierbar."
              : "Wähle die Berechtigungen für diese Rolle."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {PERMISSION_GROUPS.map((group) => {
            const keys = group.items.map((i) => i.key);
            const allOn = keys.every((k) => selected.has(k));
            return (
              <div key={group.group} className="space-y-2">
                <div className="flex items-center justify-between border-b pb-1">
                  <h4 className="text-sm font-semibold">{group.group}</h4>
                  {!locked && (
                    <button
                      type="button"
                      onClick={() => toggleGroup(keys, allOn)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      {allOn ? "Alle abwählen" : "Alle wählen"}
                    </button>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {group.items.map((item) => (
                    <label key={item.key} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={locked ? true : selected.has(item.key)}
                        onCheckedChange={() => toggle(item.key)}
                        disabled={locked}
                      />
                      {item.label}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Schließen</Button>
          {!locked && (
            <Button onClick={save} disabled={pending}>
              {pending ? "Speichern…" : "Speichern"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
