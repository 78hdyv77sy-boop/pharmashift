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
import { createMenu } from "./actions";

export function CreateMenuDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function submit() {
    setPending(true);
    setError(null);
    const res = await createMenu({ name, slug: slug || name });
    setPending(false);
    if (!res.ok || !res.id) return setError(res.error ?? "Fehler");
    setOpen(false);
    router.push(`/admin/menus/${res.id}`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="h-4 w-4" /> Neues Menü</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Neues Menü</DialogTitle>
          <DialogDescription>Slug z. B. „main" oder „footer" – darüber wird das Menü im Frontend referenziert.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Hauptmenü" />
          </div>
          <div className="space-y-1.5">
            <Label>Slug</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="main" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Abbrechen</Button></DialogClose>
          <Button onClick={submit} disabled={pending || !name}>{pending ? "Anlegen…" : "Anlegen & bearbeiten"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
