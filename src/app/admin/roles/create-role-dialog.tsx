"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { createRole } from "./actions";

export function CreateRoleDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function submit() {
    setPending(true);
    setError(null);
    const res = await createRole({ name, description });
    setPending(false);
    if (!res.ok) return setError(res.error ?? "Fehler");
    setOpen(false);
    setName("");
    setDescription("");
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4" /> Neue Rolle</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Neue Rolle</DialogTitle>
          <DialogDescription>Berechtigungen weist du nach dem Anlegen zu.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="role-name">Name</Label>
            <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Schichtleitung" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role-desc">Beschreibung (optional)</Label>
            <Input id="role-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Abbrechen</Button></DialogClose>
          <Button onClick={submit} disabled={pending || !name}>{pending ? "Anlegen…" : "Anlegen"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
