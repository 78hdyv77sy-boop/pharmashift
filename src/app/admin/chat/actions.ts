"use server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { rateLimit, ipFromHeaders } from "@/lib/rate-limit";
import { headers } from "next/headers";
import { canAccessChannel, type ChatCtx } from "./access";
import type { ChatMsg } from "./types";

type Result = { ok: boolean; error?: string };

function ctxFrom(c: { orgId: string; userId: string; session: { user: { isSuperAdmin?: boolean } } }): ChatCtx {
  return { orgId: c.orgId, userId: c.userId, isSuperAdmin: !!c.session.user.isSuperAdmin };
}

export async function sendChatMessage(teamId: string | null, body: string): Promise<Result & { message?: ChatMsg }> {
  const c = await requirePermission(PERMISSIONS.CHAT_USE);
  const ctx = ctxFrom(c);

  if (!(await canAccessChannel(ctx, teamId))) {
    return { ok: false, error: "Kein Zugriff auf diesen Kanal." };
  }

  const text = (body ?? "").trim();
  if (!text) return { ok: false, error: "Leere Nachricht." };
  if (text.length > 2000) return { ok: false, error: "Nachricht zu lang (max. 2000 Zeichen)." };

  // Spam-Schutz: max. 20 Nachrichten/Minute je User
  const ip = ipFromHeaders(await headers());
  const rl = rateLimit(`chat:${ctx.userId}:${ip}`, 20, 60_000);
  if (!rl.ok) return { ok: false, error: "Zu viele Nachrichten. Kurz warten." };

  const created = await prisma.chatMessage.create({
    data: { orgId: ctx.orgId, userId: ctx.userId, teamId: teamId ?? null, body: text },
    include: { user: { select: { name: true, email: true } } },
  });

  return {
    ok: true,
    message: {
      id: created.id,
      userId: ctx.userId,
      authorName: created.user.name ?? created.user.email,
      body: created.body,
      createdAt: created.createdAt.toISOString(),
      mine: true,
    },
  };
}

export async function loadChatMessages(teamId: string | null, beforeIso?: string): Promise<{ ok: boolean; messages: ChatMsg[]; error?: string }> {
  const c = await requirePermission(PERMISSIONS.CHAT_USE);
  const ctx = ctxFrom(c);

  if (!(await canAccessChannel(ctx, teamId))) {
    return { ok: false, messages: [], error: "Kein Zugriff auf diesen Kanal." };
  }

  const rows = await prisma.chatMessage.findMany({
    where: {
      orgId: ctx.orgId,
      teamId: teamId ?? null,
      deletedAt: null,
      ...(beforeIso ? { createdAt: { lt: new Date(beforeIso) } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { user: { select: { name: true, email: true } } },
  });

  const messages: ChatMsg[] = rows
    .map((m) => ({
      id: m.id,
      userId: m.userId,
      authorName: m.user.name ?? m.user.email,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      mine: m.userId === ctx.userId,
    }))
    .reverse(); // chronologisch (älteste oben)

  return { ok: true, messages };
}

export async function deleteChatMessage(id: string): Promise<Result> {
  const { orgId, userId } = await requirePermission(PERMISSIONS.CHAT_USE);
  // Nur eigene Nachrichten löschen
  const res = await prisma.chatMessage.updateMany({
    where: { id, orgId, userId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (res.count === 0) return { ok: false, error: "Nicht gefunden oder nicht berechtigt." };
  return { ok: true };
}
