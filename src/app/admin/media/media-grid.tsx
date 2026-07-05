"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addMedia, deleteMedia } from "./actions";
import { useToast } from "@/components/ui/toaster";
import { useConfirm } from "@/components/ui/confirm-dialog";

type Media = { id: string; url: string; alt: string | null };

export function MediaGrid({ initial }: { initial: Media[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const confirmDialog = useConfirm();
  const [url, setUrl] = React.useState("");
  const [alt, setAlt] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [copied, setCopied] = React.useState<string | null>(null);

  async function add() {
    setPending(true);
    setError(null);
    const res = await addMedia({ url, alt });
    setPending(false);
    if (!res.ok) return setError(res.error ?? "Fehler");
    setUrl(""); setAlt("");
    router.refresh();
  }

  async function copy(u: string, id: string) {
    await navigator.clipboard.writeText(u);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  }

  async function remove(id: string) {
    if (!(await confirmDialog({ title: "Medium löschen?", confirmText: "Löschen", destructive: true }))) return;
    await deleteMedia(id);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <Label>Bild-URL</Label>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/bild.jpg" />
        </div>
        <div className="flex-1 space-y-1.5">
          <Label>Alt-Text (optional)</Label>
          <Input value={alt} onChange={(e) => setAlt(e.target.value)} />
        </div>
        <Button onClick={add} disabled={pending || !url}>{pending ? "…" : "Hinzufügen"}</Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {initial.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Noch keine Medien. Füge oben eine Bild-URL hinzu (z. B. von einem CDN).
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {initial.map((m) => (
            <div key={m.id} className="group overflow-hidden rounded-lg border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.url} alt={m.alt ?? ""} className="aspect-square w-full bg-muted object-cover" />
              <div className="flex items-center justify-between gap-1 p-2">
                <Button variant="ghost" size="sm" onClick={() => copy(m.url, m.id)}>
                  <Copy className="h-3.5 w-3.5" /> {copied === m.id ? "Kopiert" : "URL"}
                </Button>
                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => remove(m.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Hinweis: Aktuell URL-basiert. Direkt-Upload (Vercel Blob / S3) wird als Storage-Adapter ergänzt.
      </p>
    </div>
  );
}
