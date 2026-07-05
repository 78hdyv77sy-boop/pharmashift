import { Inngest } from "inngest";

// Job-/Cron-System (Plan Phase 9 F1 / 8.6 V5). Wird erst aktiv, wenn die App
// deployt und mit Inngest verbunden ist – lokal/ohne Inngest passiert nichts.
export const inngest = new Inngest({ id: "pharmashift" });
