import "server-only";
import sanitizeHtml from "sanitize-html";
import { getBlockDef } from "@/lib/cms/blocks";

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "strong", "em", "u", "s", "a", "ul", "ol", "li", "blockquote",
    "h1", "h2", "h3", "h4", "code", "pre", "span", "hr",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    span: ["style"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }),
  },
};

export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html ?? "", SANITIZE_OPTIONS);
}

/** Bereinigt rekursiv alle richtext-Felder eines Block-Daten-Objekts. */
export function sanitizeBlockData(type: string, data: Record<string, unknown>): Record<string, unknown> {
  const def = getBlockDef(type);
  if (!def) return {};
  const out: Record<string, unknown> = {};

  for (const field of def.fields) {
    const value = data[field.key];
    if (field.type === "richtext") {
      out[field.key] = sanitizeRichText(typeof value === "string" ? value : "");
    } else if (field.type === "list" && field.itemFields) {
      const items = Array.isArray(value) ? value : [];
      out[field.key] = items.map((item) => {
        const itemObj = (item ?? {}) as Record<string, unknown>;
        const cleaned: Record<string, unknown> = {};
        for (const itemField of field.itemFields!) {
          const v = itemObj[itemField.key];
          cleaned[itemField.key] =
            itemField.type === "richtext" ? sanitizeRichText(typeof v === "string" ? v : "") : (v ?? "");
        }
        return cleaned;
      });
    } else {
      out[field.key] = value ?? "";
    }
  }
  return out;
}
