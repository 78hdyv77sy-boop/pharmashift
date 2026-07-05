
// ============================================================================
//  CMS-BLOCK-REGISTRY
//  Jeder Block-Typ definiert seine editierbaren Felder. Der Admin-Editor und
//  der Frontend-Renderer sind generisch und lesen diese Registry.
//  Felder vom Typ "richtext" werden als WYSIWYG editiert und im Frontend via
//  dangerouslySetInnerHTML gerendert -> beim Speichern serverseitig sanitized.
// ============================================================================

export type FieldType = "text" | "url" | "image" | "richtext" | "list";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  // Für type === "list": Felder je Listeneintrag
  itemLabel?: string;
  itemFields?: FieldDef[];
}

export interface BlockDef {
  type: string;
  label: string;
  description: string;
  fields: FieldDef[];
  defaults: Record<string, unknown>;
}

export const BLOCK_REGISTRY: BlockDef[] = [
  {
    type: "hero",
    label: "Hero",
    description: "Große Kopfzeile mit Untertitel, Bild und Button.",
    fields: [
      { key: "heading", label: "Überschrift", type: "text" },
      { key: "subheadingHtml", label: "Untertitel", type: "richtext" },
      { key: "imageUrl", label: "Hintergrundbild", type: "image" },
      { key: "ctaLabel", label: "Button-Text", type: "text" },
      { key: "ctaHref", label: "Button-Link", type: "url" },
    ],
    defaults: { heading: "Überschrift", subheadingHtml: "<p>Untertitel…</p>", imageUrl: "", ctaLabel: "", ctaHref: "" },
  },
  {
    type: "richtext",
    label: "Text",
    description: "Formatierter Fließtext (WYSIWYG).",
    fields: [{ key: "html", label: "Inhalt", type: "richtext" }],
    defaults: { html: "<p>Text…</p>" },
  },
  {
    type: "imageText",
    label: "Bild + Text",
    description: "Bild neben formatiertem Text.",
    fields: [
      { key: "html", label: "Text", type: "richtext" },
      { key: "imageUrl", label: "Bild", type: "image" },
      { key: "imagePosition", label: "Bildposition (left/right)", type: "text" },
    ],
    defaults: { html: "<p>Text…</p>", imageUrl: "", imagePosition: "right" },
  },
  {
    type: "image",
    label: "Bild",
    description: "Einzelnes Bild mit Bildunterschrift.",
    fields: [
      { key: "url", label: "Bild-URL", type: "image" },
      { key: "alt", label: "Alt-Text", type: "text" },
      { key: "captionHtml", label: "Bildunterschrift", type: "richtext" },
    ],
    defaults: { url: "", alt: "", captionHtml: "" },
  },
  {
    type: "cta",
    label: "Call to Action",
    description: "Hervorgehobener Aufruf mit Button.",
    fields: [
      { key: "html", label: "Text", type: "richtext" },
      { key: "buttonLabel", label: "Button-Text", type: "text" },
      { key: "buttonHref", label: "Button-Link", type: "url" },
    ],
    defaults: { html: "<p>Bereit loszulegen?</p>", buttonLabel: "Jetzt starten", buttonHref: "/register" },
  },
  {
    type: "faq",
    label: "FAQ",
    description: "Liste aus Frage und Antwort.",
    fields: [
      {
        key: "items",
        label: "Einträge",
        type: "list",
        itemLabel: "Frage",
        itemFields: [
          { key: "question", label: "Frage", type: "text" },
          { key: "answerHtml", label: "Antwort", type: "richtext" },
        ],
      },
    ],
    defaults: { items: [{ question: "Frage?", answerHtml: "<p>Antwort…</p>" }] },
  },
  {
    type: "gallery",
    label: "Galerie",
    description: "Mehrere Bilder im Raster.",
    fields: [
      {
        key: "images",
        label: "Bilder",
        type: "list",
        itemLabel: "Bild",
        itemFields: [
          { key: "url", label: "Bild-URL", type: "image" },
          { key: "alt", label: "Alt-Text", type: "text" },
        ],
      },
    ],
    defaults: { images: [{ url: "", alt: "" }] },
  },
];

export const BLOCK_MAP: Record<string, BlockDef> = Object.fromEntries(
  BLOCK_REGISTRY.map((b) => [b.type, b]),
);

export function getBlockDef(type: string): BlockDef | undefined {
  return BLOCK_MAP[type];
}
