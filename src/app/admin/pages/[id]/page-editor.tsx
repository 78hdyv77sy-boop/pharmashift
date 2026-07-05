"use client";

import * as React from "react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { KeyboardSensor } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Copy, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RichTextEditor } from "@/components/cms/rich-text-editor";
import { BLOCK_REGISTRY, getBlockDef, type FieldDef } from "@/lib/cms/blocks";
import { saveBlocks } from "../actions";

interface EditorBlock {
  uid: string;
  type: string;
  data: Record<string, unknown>;
}

let counter = 0;
const uid = () => `b_${Date.now()}_${counter++}`;

function FieldEditor({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (field.type === "richtext") {
    return (
      <div className="space-y-1.5">
        <Label>{field.label}</Label>
        <RichTextEditor value={typeof value === "string" ? value : ""} onChange={onChange} />
      </div>
    );
  }

  if (field.type === "list" && field.itemFields) {
    const items = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
    return (
      <div className="space-y-2">
        <Label>{field.label}</Label>
        <div className="space-y-3">
          {items.map((item, idx) => (
            <div key={idx} className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{field.itemLabel} {idx + 1}</span>
                <Button
                  variant="ghost" size="sm" className="text-destructive"
                  onClick={() => onChange(items.filter((_, i) => i !== idx))}
                >
                  Entfernen
                </Button>
              </div>
              {field.itemFields!.map((sub) => (
                <FieldEditor
                  key={sub.key}
                  field={sub}
                  value={item[sub.key]}
                  onChange={(v) => onChange(items.map((it, i) => (i === idx ? { ...it, [sub.key]: v } : it)))}
                />
              ))}
            </div>
          ))}
          <Button
            variant="outline" size="sm"
            onClick={() => {
              const empty: Record<string, unknown> = {};
              field.itemFields!.forEach((f) => (empty[f.key] = ""));
              onChange([...items, empty]);
            }}
          >
            <Plus className="h-4 w-4" /> {field.itemLabel} hinzufügen
          </Button>
        </div>
      </div>
    );
  }

  // text | url | image
  return (
    <div className="space-y-1.5">
      <Label>{field.label}</Label>
      <Input
        value={typeof value === "string" ? value : ""}
        placeholder={field.type === "image" ? "https://… (Bild-URL)" : field.placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function SortableBlock({
  block,
  onChange,
  onDuplicate,
  onDelete,
}: {
  block: EditorBlock;
  onChange: (data: Record<string, unknown>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.uid });
  const [open, setOpen] = React.useState(true);
  const def = getBlockDef(block.type);

  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border bg-card">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <button className="cursor-grab text-muted-foreground" {...attributes} {...listeners} aria-label="Verschieben">
          <GripVertical className="h-4 w-4" />
        </button>
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 text-sm font-medium">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          {def?.label ?? block.type}
        </button>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onDuplicate} aria-label="Duplizieren"><Copy className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="text-destructive" onClick={onDelete} aria-label="Löschen"><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
      {open && (
        <div className="space-y-4 p-4">
          {def?.fields.map((field) => (
            <FieldEditor
              key={field.key}
              field={field}
              value={block.data[field.key]}
              onChange={(v) => onChange({ ...block.data, [field.key]: v })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function PageEditor({
  pageId,
  initialBlocks,
}: {
  pageId: string;
  initialBlocks: { type: string; data: Record<string, unknown> }[];
}) {
  const [blocks, setBlocks] = React.useState<EditorBlock[]>(
    initialBlocks.map((b) => ({ uid: uid(), type: b.type, data: b.data })),
  );
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (over && active.id !== over.id) {
      setBlocks((prev) => {
        const oldIndex = prev.findIndex((b) => b.uid === active.id);
        const newIndex = prev.findIndex((b) => b.uid === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  }

  function addBlock(type: string) {
    const def = getBlockDef(type);
    if (!def) return;
    setBlocks((prev) => [...prev, { uid: uid(), type, data: structuredClone(def.defaults) }]);
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    const res = await saveBlocks(pageId, blocks.map((b) => ({ type: b.type, data: b.data })));
    setSaving(false);
    setMsg(res.ok ? "Gespeichert ✓" : res.error ?? "Fehler");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline"><Plus className="h-4 w-4" /> Block hinzufügen</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            {BLOCK_REGISTRY.map((b) => (
              <DropdownMenuItem key={b.type} onSelect={() => addBlock(b.type)}>
                <div>
                  <div className="font-medium">{b.label}</div>
                  <div className="text-xs text-muted-foreground">{b.description}</div>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex items-center gap-3">
          {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
          <Button onClick={save} disabled={saving}>{saving ? "Speichern…" : "Inhalte speichern"}</Button>
        </div>
      </div>

      {blocks.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Noch keine Blöcke. Füge oben den ersten Block hinzu.
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={blocks.map((b) => b.uid)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {blocks.map((block) => (
                <SortableBlock
                  key={block.uid}
                  block={block}
                  onChange={(data) => setBlocks((prev) => prev.map((b) => (b.uid === block.uid ? { ...b, data } : b)))}
                  onDuplicate={() =>
                    setBlocks((prev) => {
                      const i = prev.findIndex((b) => b.uid === block.uid);
                      const copy = { uid: uid(), type: block.type, data: structuredClone(block.data) };
                      return [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)];
                    })
                  }
                  onDelete={() => setBlocks((prev) => prev.filter((b) => b.uid !== block.uid))}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
