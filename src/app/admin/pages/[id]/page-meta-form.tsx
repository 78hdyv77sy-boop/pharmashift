"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { savePageMeta } from "../actions";

interface Props {
  pageId: string;
  initial: { title: string; slug: string; status: string; metaTitle: string; metaDescription: string };
}

export function PageMetaForm({ pageId, initial }: Props) {
  const router = useRouter();
  const [v, setV] = React.useState(initial);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  function set<K extends keyof typeof v>(k: K, val: (typeof v)[K]) {
    setV((prev) => ({ ...prev, [k]: val }));
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    const res = await savePageMeta(pageId, v);
    setSaving(false);
    if (!res.ok) return setMsg(res.error ?? "Fehler");
    setMsg("Gespeichert ✓");
    router.refresh();
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Titel</Label>
          <Input value={v.title} onChange={(e) => set("title", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Slug</Label>
          <Input value={v.slug} onChange={(e) => set("slug", e.target.value)} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={v.status} onValueChange={(val) => set("status", val)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="DRAFT">Entwurf</SelectItem>
              <SelectItem value="PUBLISHED">Veröffentlicht</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>SEO-Titel</Label>
          <Input value={v.metaTitle} onChange={(e) => set("metaTitle", e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>SEO-Beschreibung</Label>
        <Textarea value={v.metaDescription} onChange={(e) => set("metaDescription", e.target.value)} />
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}>{saving ? "Speichern…" : "Seite speichern"}</Button>
        {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
      </div>
    </div>
  );
}
