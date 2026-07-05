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
import { createPage } from "./actions";

export function CreatePageDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function submit() {
    setPending(true);
    setError(null);
    const res = await createPage({ title });
    setPending(false);
    if (!res.ok || !res.id) return setError(res.error ?? "Fehler");
    setOpen(false);
    router.push(`/admin/pages/${res.id}`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4" /> Neue Seite</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Neue Seite</DialogTitle>
          <DialogDescription>Der Slug wird automatisch erzeugt und ist später editierbar.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="page-title">Titel</Label>
          <Input id="page-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Startseite" />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Abbrechen</Button></DialogClose>
          <Button onClick={submit} disabled={pending || !title}>{pending ? "Anlegen…" : "Anlegen & bearbeiten"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
