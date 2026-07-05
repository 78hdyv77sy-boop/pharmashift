import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { nightlyDigest } from "@/lib/inngest/functions";

// Endpunkt, über den Inngest die Funktionen aufruft. Ohne Inngest-Anbindung
// bleibt er ungenutzt und beeinflusst nichts anderes in der App.
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [nightlyDigest],
});
