/**
 * Golden-Utterance-Evals STUFE 2 (8.7 S4) — LLM-gestützt, lokal ausführen:
 *   ANTHROPIC_API_KEY=sk-... DATABASE_URL=... npx tsx scripts/eval-agent.ts
 * Prüft je Äußerung: erwartetes Tool + Schlüssel-Argumente gegen den echten
 * Agent-Loop (inkl. Read-Tools gegen die lokale DB). Nicht im CI (Kosten/Key).
 */
import { runAgent } from "../src/lib/agent/run";
import { prisma } from "../src/lib/prisma";

interface Golden { utterance: string; expectTool: string; expectValues?: Record<string, (v: unknown) => boolean> }

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY fehlt — Stufe-2-Evals brauchen den echten Agenten.");
    process.exit(1);
  }
  const org = await prisma.organization.findFirst();
  if (!org) { console.error("Keine Organisation in der DB (erst seeden)."); process.exit(1); }
  const emp = await prisma.employee.findFirst({ where: { orgId: org.id, active: true } });
  const first = emp ? emp.firstName : "Lisa";

  const goldens: Golden[] = [
    { utterance: `${first} braucht nächsten Freitag frei`, expectTool: "request_absence",
      expectValues: { employeeId: (v) => v === emp?.id, type: (v) => v === "OTHER" || v === "VACATION" } },
    { utterance: `${first} ist morgen krank`, expectTool: "request_absence",
      expectValues: { type: (v) => v === "SICK" } },
    { utterance: "Lege für Montag eine Schicht von 8 bis 16 Uhr an", expectTool: "create_shift",
      expectValues: { startTime: (v) => v === "08:00", endTime: (v) => v === "16:00" } },
  ];

  let pass = 0;
  for (const g of goldens) {
    const res = await runAgent(org.id, g.utterance);
    const ok =
      res.type === "tool" &&
      res.toolName === g.expectTool &&
      Object.entries(g.expectValues ?? {}).every(([k, check]) => check((res as { values: Record<string, unknown> }).values[k]));
    console.log(`${ok ? "✅" : "❌"} "${g.utterance}" -> ${res.type === "tool" ? res.toolName : res.type}`);
    if (!ok && res.type === "tool") console.log("   values:", JSON.stringify(res.values));
    if (ok) pass++;
  }
  console.log(`\n${pass}/${goldens.length} bestanden.`);
  process.exit(pass === goldens.length ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
