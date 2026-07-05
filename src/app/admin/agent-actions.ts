"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { runAgent, type AgentProposal, type PageContext, type HistoryTurn } from "@/lib/agent/run";
import { AGENT_TOOLS, executeTool } from "@/lib/agent/tools";
import { applyUndo, type UndoOp } from "@/lib/agent/undo";
import type { ChangesetItem, ExecuteOutcome, ChangesetOutcome } from "@/lib/agent/tool-meta";

const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000; // 8.7 S5: 24h

interface StoredUndoEntry { toolName: string; op: UndoOp }

function revalidateAll() {
  revalidatePath("/admin/shifts");
  revalidatePath("/admin/absences");
  revalidatePath("/admin/emergency");
  revalidatePath("/admin/users");
}

export async function proposeAction(transcript: string, page?: PageContext, history?: HistoryTurn[]): Promise<AgentProposal> {
  const { orgId, userId } = await requirePermission(PERMISSIONS.AGENT_USE);
  const clean = (transcript ?? "").trim();
  if (!clean) return { type: "error", message: "Leere Eingabe." };

  const proposal = await runAgent(orgId, clean, page, Array.isArray(history) ? history.slice(-8) : undefined);

  await prisma.agentInteraction.create({
    data: {
      orgId,
      userId,
      transcript: clean,
      parsedIntent: proposal.type,
      toolName: proposal.type === "tool" ? proposal.toolName : proposal.type === "changeset" ? "changeset" : null,
      payload:
        proposal.type === "tool"
          ? (proposal.values as object)
          : proposal.type === "changeset"
            ? ({ items: proposal.items } as object)
            : undefined,
      status: "PROPOSED",
    },
  });

  return proposal;
}

export async function executeAction(toolName: string, values: Record<string, unknown>): Promise<ExecuteOutcome> {
  const { orgId, userId } = await requirePermission(PERMISSIONS.AGENT_USE);

  const result = await executeTool(toolName, values);

  // Undo-Beschreibung erzeugen (8.7 S5)
  const undo: StoredUndoEntry[] = [];
  if (result.ok) {
    const op = AGENT_TOOLS[toolName]?.buildUndo?.(values, result) ?? null;
    if (op) undo.push({ toolName, op });
  }

  const interaction = await prisma.agentInteraction.create({
    data: {
      orgId,
      userId,
      transcript: `[execute] ${toolName}`,
      parsedIntent: "execute",
      toolName,
      payload: { values, undo } as object,
      status: result.ok ? "EXECUTED" : "PROPOSED",
    },
  });

  if (result.ok) revalidateAll();
  return { ok: result.ok, error: result.error, message: result.message, interactionId: interaction.id, canUndo: undo.length > 0 };
}

/** Führt ein bestätigtes Aktionsbündel sequenziell aus (8.6 V2).
 *  Jedes Item ist intern atomar (P0); bei erstem Fehler wird gestoppt und
 *  berichtet, was bereits ausgeführt wurde (inkl. Undo-Möglichkeit dafür). */
export async function executeChangeset(items: ChangesetItem[]): Promise<ChangesetOutcome> {
  const { orgId, userId } = await requirePermission(PERMISSIONS.AGENT_USE);
  if (!Array.isArray(items) || items.length === 0) return { ok: false, error: "Leeres Bündel.", results: [] };
  if (items.length > 10) return { ok: false, error: "Maximal 10 Aktionen pro Bündel.", results: [] };

  const results: ChangesetOutcome["results"] = [];
  const undo: StoredUndoEntry[] = [];
  let allOk = true;

  for (const item of items) {
    const result = await executeTool(item.toolName, item.values);
    results.push({ toolName: item.toolName, ok: result.ok, message: result.message, error: result.error });
    if (result.ok) {
      const op = AGENT_TOOLS[item.toolName]?.buildUndo?.(item.values as Record<string, unknown>, result) ?? null;
      if (op) undo.push({ toolName: item.toolName, op });
    } else {
      allOk = false;
      break; // Stop bei erstem Fehler; bereits Ausgeführtes bleibt rückgängig machbar
    }
  }

  const interaction = await prisma.agentInteraction.create({
    data: {
      orgId,
      userId,
      transcript: `[changeset] ${items.map((i) => i.toolName).join(", ")}`,
      parsedIntent: "execute",
      toolName: "changeset",
      payload: { items, results, undo } as object,
      status: allOk ? "EXECUTED" : "PROPOSED",
    },
  });

  revalidateAll();
  return {
    ok: allOk,
    error: allOk ? undefined : results.find((r) => !r.ok)?.error,
    message: allOk ? `${results.length} Aktion(en) ausgeführt.` : undefined,
    interactionId: interaction.id,
    canUndo: undo.length > 0,
    results,
  };
}

/** Macht eine ausgeführte Agent-Interaktion rückgängig (8.7 S5, 24h-Fenster).
 *  RBAC: je inverser Operation wird die Permission des URSPRUNGS-Tools geprüft. */
export async function undoInteraction(interactionId: string): Promise<{ ok: boolean; error?: string; message?: string }> {
  const { orgId, userId } = await requirePermission(PERMISSIONS.AGENT_USE);

  const interaction = await prisma.agentInteraction.findFirst({
    where: { id: interactionId, orgId },
  });
  if (!interaction) return { ok: false, error: "Interaktion nicht gefunden." };
  if (interaction.userId !== userId) return { ok: false, error: "Nur die ausführende Person kann rückgängig machen." };
  if (interaction.status === "UNDONE") return { ok: false, error: "Bereits rückgängig gemacht." };
  if (Date.now() - interaction.createdAt.getTime() > UNDO_WINDOW_MS) {
    return { ok: false, error: "Rückgängig nur innerhalb von 24 Stunden möglich." };
  }

  const payload = (interaction.payload ?? {}) as { undo?: StoredUndoEntry[] };
  const undo = Array.isArray(payload.undo) ? payload.undo : [];
  if (undo.length === 0) return { ok: false, error: "Für diese Aktion ist kein Rückgängig verfügbar." };

  // Permission je Ursprungs-Tool (verhindert Rechte-Eskalation über Undo)
  const SPECIAL_UNDO_PERMISSIONS: Record<string, (typeof PERMISSIONS)[keyof typeof PERMISSIONS]> = {
    solver_fill: PERMISSIONS.SHIFT_MANAGE,
    auto_reassign: PERMISSIONS.SHIFT_MANAGE,
  };
  for (const entry of undo) {
    const special = SPECIAL_UNDO_PERMISSIONS[entry.toolName];
    if (special) { await requirePermission(special); continue; }
    const tool = AGENT_TOOLS[entry.toolName];
    if (!tool) return { ok: false, error: "Unbekannte Ursprungsaktion." };
    await requirePermission(tool.permission);
  }

  // In umgekehrter Reihenfolge anwenden
  for (const entry of [...undo].reverse()) {
    const res = await applyUndo(orgId, entry.op);
    if (!res.ok) return { ok: false, error: res.error ?? "Rückgängig fehlgeschlagen." };
  }

  await prisma.agentInteraction.update({ where: { id: interaction.id }, data: { status: "UNDONE" } });
  await prisma.auditLog.create({
    data: { orgId, actorId: userId, action: "agent.undo", entity: "agentInteraction", entityId: interaction.id },
  });

  revalidateAll();
  return { ok: true, message: "Rückgängig gemacht." };
}
