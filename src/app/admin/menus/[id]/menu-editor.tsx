"use client";

import * as React from "react";
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2, ExternalLink, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { saveMenuItems } from "../actions";
import type { MenuItemInput } from "../types";

type Item = MenuItemInput;
type PageOpt = { id: string; title: string; slug: string };

let c = 0;
const cid = () => `m_${Date.now()}_${c++}`;
const NONE = "__none__";

function SortableRow({
  item, pages, items, onChange, onRemove,
}: {
  item: Item;
  pages: PageOpt[];
  items: Item[];
  onChange: (patch: Partial<Item>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.clientId });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  // mögliche Eltern: andere Top-Level-Items (kein Eltern selbst)
  const parentOptions = items.filter((i) => i.clientId !== item.clientId && !i.parentClientId);

  return (
    <div ref={setNodeRef} style={style} className={`rounded-lg border bg-card p-3 ${item.parentClientId ? "ml-8" : ""}`}>
      <div className="flex items-center gap-2">
        <button className="cursor-grab text-muted-foreground" {...attributes} {...listeners} aria-label="Verschieben">
          <GripVertical className="h-4 w-4" />
        </button>
        {item.linkType === "page" ? <FileText className="h-4 w-4 text-muted-foreground" /> : <ExternalLink className="h-4 w-4 text-muted-foreground" />}
        <Input value={item.label} onChange={(e) => onChange({ label: e.target.value })} className="h-8 max-w-[200px]" />
        <span className="truncate text-xs text-muted-foreground">
          {item.linkType === "page" ? pages.find((p) => p.id === item.pageId)?.slug ?? "—" : item.href}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Select
            value={item.parentClientId ?? NONE}
            onValueChange={(v) => onChange({ parentClientId: v === NONE ? null : v })}
          >
            <SelectTrigger className="h-8 w-40"><SelectValue placeholder="Übergeordnet" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Oberste Ebene</SelectItem>
              {parentOptions.map((p) => <SelectItem key={p.clientId} value={p.clientId}>↳ {p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" className="text-destructive" onClick={onRemove} aria-label="Entfernen">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function AddItemDialog({ pages, onAdd }: { pages: PageOpt[]; onAdd: (item: Item) => void }) {
  const [open, setOpen] = React.useState(false);
  const [label, setLabel] = React.useState("");
  const [linkType, setLinkType] = React.useState<"page" | "url">("page");
  const [pageId, setPageId] = React.useState(pages[0]?.id ?? "");
  const [href, setHref] = React.useState("");
  const [newTab, setNewTab] = React.useState(false);

  function add() {
    onAdd({
      clientId: cid(),
      parentClientId: null,
      label: label || (linkType === "page" ? pages.find((p) => p.id === pageId)?.title ?? "Seite" : "Link"),
      linkType,
      pageId: linkType === "page" ? pageId : null,
      href: linkType === "url" ? href : null,
      target: newTab ? "_blank" : null,
    });
    setOpen(false);
    setLabel(""); setHref(""); setNewTab(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline"><Plus className="h-4 w-4" /> Item hinzufügen</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Menü-Item</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Beschriftung</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="z. B. Über uns" />
          </div>
          <div className="space-y-1.5">
            <Label>Typ</Label>
            <Select value={linkType} onValueChange={(v) => setLinkType(v as "page" | "url")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="page">Interne Seite</SelectItem>
                <SelectItem value="url">Externer Link</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {linkType === "page" ? (
            <div className="space-y-1.5">
              <Label>Seite</Label>
              <Select value={pageId} onValueChange={setPageId}>
                <SelectTrigger><SelectValue placeholder="Seite wählen" /></SelectTrigger>
                <SelectContent>
                  {pages.map((p) => <SelectItem key={p.id} value={p.id}>{p.title} (/{p.slug})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>URL</Label>
              <Input value={href} onChange={(e) => setHref(e.target.value)} placeholder="https://…" />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={newTab} onCheckedChange={(v) => setNewTab(!!v)} /> In neuem Tab öffnen
          </label>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Abbrechen</Button></DialogClose>
          <Button onClick={add} disabled={linkType === "page" ? !pageId : !href}>Hinzufügen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MenuEditor({
  menuId, pages, initialItems,
}: {
  menuId: string;
  pages: PageOpt[];
  initialItems: Item[];
}) {
  const [items, setItems] = React.useState<Item[]>(initialItems);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (over && active.id !== over.id) {
      setItems((prev) => arrayMove(prev, prev.findIndex((i) => i.clientId === active.id), prev.findIndex((i) => i.clientId === over.id)));
    }
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    const res = await saveMenuItems(menuId, items);
    setSaving(false);
    setMsg(res.ok ? "Gespeichert ✓" : res.error ?? "Fehler");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <AddItemDialog pages={pages} onAdd={(it) => setItems((prev) => [...prev, it])} />
        <div className="flex items-center gap-3">
          {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
          <Button onClick={save} disabled={saving}>{saving ? "Speichern…" : "Menü speichern"}</Button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Noch keine Einträge. Füge oben das erste Item hinzu.
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={items.map((i) => i.clientId)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {items.map((item) => (
                <SortableRow
                  key={item.clientId}
                  item={item}
                  items={items}
                  pages={pages}
                  onChange={(patch) => setItems((prev) => prev.map((i) => (i.clientId === item.clientId ? { ...i, ...patch } : i)))}
                  onRemove={() => setItems((prev) => prev.filter((i) => i.clientId !== item.clientId && i.parentClientId !== item.clientId))}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
      <p className="text-xs text-muted-foreground">
        Tipp: Ziehe Items zum Sortieren. Über „Übergeordnet" machst du ein Item zum Untermenü.
      </p>
    </div>
  );
}
