"use server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { canManageTeam, getTeam, hasChatManage, type ChatCtx } from "./access";
import type { Channel, OrgUser } from "./types";

type Result = { ok: boolean; error?: string };

function ctxFrom(c: { orgId: string; userId: string; session: { user: { isSuperAdmin?: boolean } } }): ChatCtx {
  return { orgId: c.orgId, userId: c.userId, isSuperAdmin: !!c.session.user.isSuperAdmin };
}

// Alle Kanäle, die der aktuelle User sehen darf: "Allgemein" + zugängliche Teams.
export async function listChannels(): Promise<Channel[]> {
  const c = await requirePermission(PERMISSIONS.CHAT_USE);
  const ctx = ctxFrom(c);
  const manageAll = await hasChatManage(ctx);

  const teams = await prisma.team.findMany({
    where: {
      orgId: ctx.orgId,
      deletedAt: null,
      // Verwalter:innen sehen alle Teams, sonst nur die eigenen Mitgliedschaften
      ...(manageAll ? {} : { members: { some: { userId: ctx.userId } } }),
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, createdById: true },
  });

  const channels: Channel[] = [
    { teamId: null, name: "Allgemein", canManage: false },
    ...teams.map((t) => ({
      teamId: t.id,
      name: t.name,
      canManage: manageAll || t.createdById === ctx.userId,
    })),
  ];
  return channels;
}

export async function createTeam(name: string): Promise<Result & { teamId?: string }> {
  const c = await requirePermission(PERMISSIONS.CHAT_USE);
  const ctx = ctxFrom(c);

  const clean = (name ?? "").trim();
  if (!clean) return { ok: false, error: "Bitte einen Team-Namen eingeben." };
  if (clean.length > 60) return { ok: false, error: "Name zu lang (max. 60 Zeichen)." };

  // Doppelte Namen (nicht gelöscht) vermeiden
  const dup = await prisma.team.findFirst({ where: { orgId: ctx.orgId, name: clean, deletedAt: null }, select: { id: true } });
  if (dup) return { ok: false, error: "Ein Team mit diesem Namen existiert bereits." };

  // Team + Ersteller:in als erstes Mitglied in EINER Transaktion (Standard 3.10)
  const team = await prisma.$transaction(async (tx) => {
    const created = await tx.team.create({
      data: { orgId: ctx.orgId, name: clean, createdById: ctx.userId },
    });
    await tx.teamMember.create({ data: { teamId: created.id, userId: ctx.userId } });
    await tx.auditLog.create({
      data: { orgId: ctx.orgId, actorId: ctx.userId, action: "team.created", entity: "team", entityId: created.id },
    });
    return created;
  });

  return { ok: true, teamId: team.id };
}

export async function renameTeam(teamId: string, name: string): Promise<Result> {
  const c = await requirePermission(PERMISSIONS.CHAT_USE);
  const ctx = ctxFrom(c);

  const team = await getTeam(ctx.orgId, teamId);
  if (!team) return { ok: false, error: "Team nicht gefunden." };
  if (!(await canManageTeam(ctx, team))) return { ok: false, error: "Keine Berechtigung." };

  const clean = (name ?? "").trim();
  if (!clean) return { ok: false, error: "Bitte einen Team-Namen eingeben." };
  if (clean.length > 60) return { ok: false, error: "Name zu lang (max. 60 Zeichen)." };

  const dup = await prisma.team.findFirst({
    where: { orgId: ctx.orgId, name: clean, deletedAt: null, id: { not: teamId } },
    select: { id: true },
  });
  if (dup) return { ok: false, error: "Ein Team mit diesem Namen existiert bereits." };

  await prisma.team.update({ where: { id: teamId }, data: { name: clean } });
  return { ok: true };
}

export async function deleteTeam(teamId: string): Promise<Result> {
  const c = await requirePermission(PERMISSIONS.CHAT_USE);
  const ctx = ctxFrom(c);

  const team = await getTeam(ctx.orgId, teamId);
  if (!team) return { ok: false, error: "Team nicht gefunden." };
  if (!(await canManageTeam(ctx, team))) return { ok: false, error: "Keine Berechtigung." };

  await prisma.$transaction(async (tx) => {
    await tx.team.update({ where: { id: teamId }, data: { deletedAt: new Date() } });
    await tx.auditLog.create({
      data: { orgId: ctx.orgId, actorId: ctx.userId, action: "team.deleted", entity: "team", entityId: teamId },
    });
  });
  return { ok: true };
}

// Alle aktiven Org-User mit Markierung, ob sie schon Mitglied sind (für den Picker).
export async function listTeamMembers(teamId: string): Promise<{ ok: boolean; error?: string; users: OrgUser[] }> {
  const c = await requirePermission(PERMISSIONS.CHAT_USE);
  const ctx = ctxFrom(c);

  const team = await getTeam(ctx.orgId, teamId);
  if (!team) return { ok: false, error: "Team nicht gefunden.", users: [] };
  if (!(await canManageTeam(ctx, team))) return { ok: false, error: "Keine Berechtigung.", users: [] };

  const [memberships, members] = await Promise.all([
    prisma.membership.findMany({
      where: { orgId: ctx.orgId, status: "ACTIVE", user: { deletedAt: null } },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.teamMember.findMany({ where: { teamId }, select: { userId: true } }),
  ]);

  const memberSet = new Set(members.map((m) => m.userId));
  const users: OrgUser[] = memberships
    .map((m) => ({
      userId: m.user.id,
      name: m.user.name ?? m.user.email,
      isMember: memberSet.has(m.user.id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));

  return { ok: true, users };
}

export async function setTeamMember(teamId: string, userId: string, member: boolean): Promise<Result> {
  const c = await requirePermission(PERMISSIONS.CHAT_USE);
  const ctx = ctxFrom(c);

  const team = await getTeam(ctx.orgId, teamId);
  if (!team) return { ok: false, error: "Team nicht gefunden." };
  if (!(await canManageTeam(ctx, team))) return { ok: false, error: "Keine Berechtigung." };

  // Zielperson muss aktives Org-Mitglied sein (Mandanten-Isolation)
  const target = await prisma.membership.findFirst({
    where: { orgId: ctx.orgId, userId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!target) return { ok: false, error: "Person ist kein aktives Org-Mitglied." };

  if (member) {
    await prisma.teamMember.upsert({
      where: { teamId_userId: { teamId, userId } },
      create: { teamId, userId },
      update: {},
    });
  } else {
    await prisma.teamMember.deleteMany({ where: { teamId, userId } });
  }
  return { ok: true };
}
