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
      isDirect: false, // 1:1-DMs werden separat (nur eigene) geladen
      // Verwalter:innen sehen alle Teams, sonst nur die eigenen Mitgliedschaften
      ...(manageAll ? {} : { members: { some: { userId: ctx.userId } } }),
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, createdById: true },
  });

  // Eigene 1:1-DMs (privat, immer nur die eigenen Mitgliedschaften)
  const dms = await prisma.team.findMany({
    where: { orgId: ctx.orgId, deletedAt: null, isDirect: true, members: { some: { userId: ctx.userId } } },
    orderBy: { createdAt: "desc" },
    select: { id: true, members: { select: { userId: true, user: { select: { name: true, email: true } } } } },
  });

  const channels: Channel[] = [
    { teamId: null, name: "Allgemein", canManage: false },
    ...teams.map((t) => ({
      teamId: t.id,
      name: t.name,
      canManage: manageAll || t.createdById === ctx.userId,
    })),
    ...dms.map((d) => {
      const other = d.members.find((m) => m.userId !== ctx.userId);
      return {
        teamId: d.id,
        name: other?.user.name || other?.user.email || "Direktnachricht",
        canManage: false,
        isDirect: true,
      };
    }),
  ];
  return channels;
}

// Mögliche DM-Partner: alle Org-Mitglieder außer mir selbst.
export async function listDmPartners(): Promise<{ userId: string; name: string }[]> {
  const c = await requirePermission(PERMISSIONS.CHAT_USE);
  const members = await prisma.membership.findMany({
    where: { orgId: c.orgId, userId: { not: c.userId } },
    select: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { user: { name: "asc" } },
  });
  return members.map((m) => ({ userId: m.user.id, name: m.user.name || m.user.email || "—" }));
}

// Öffnet (oder erstellt) die private 1:1-Unterhaltung mit einer Person.
export async function openDirectChat(otherUserId: string): Promise<Result & { teamId?: string }> {
  const c = await requirePermission(PERMISSIONS.CHAT_USE);
  const ctx = ctxFrom(c);
  if (!otherUserId || otherUserId === ctx.userId) return { ok: false, error: "Bitte eine andere Person wählen." };

  const other = await prisma.membership.findFirst({ where: { orgId: ctx.orgId, userId: otherUserId }, select: { id: true } });
  if (!other) return { ok: false, error: "Person nicht in dieser Organisation." };

  // Existierende DM zwischen genau diesen beiden suchen
  const existing = await prisma.team.findFirst({
    where: {
      orgId: ctx.orgId, deletedAt: null, isDirect: true,
      AND: [
        { members: { some: { userId: ctx.userId } } },
        { members: { some: { userId: otherUserId } } },
      ],
    },
    select: { id: true },
  });
  if (existing) return { ok: true, teamId: existing.id };

  const team = await prisma.$transaction(async (tx) => {
    const t = await tx.team.create({ data: { orgId: ctx.orgId, name: "DM", isDirect: true, createdById: ctx.userId } });
    await tx.teamMember.createMany({ data: [
      { teamId: t.id, userId: ctx.userId },
      { teamId: t.id, userId: otherUserId },
    ] });
    return t;
  });
  return { ok: true, teamId: team.id };
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
  {
    const c = await requirePermission(PERMISSIONS.CHAT_USE);
    const t = await prisma.team.findFirst({ where: { id: teamId, orgId: c.orgId }, select: { isDirect: true } });
    if (t?.isDirect) return { ok: false, error: "Direktnachrichten können nicht umbenannt werden." };
  }
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
  {
    const c = await requirePermission(PERMISSIONS.CHAT_USE);
    const t = await prisma.team.findFirst({ where: { id: teamId, orgId: c.orgId }, select: { isDirect: true } });
    if (t?.isDirect) return { ok: false, error: "Direktnachrichten können nicht gelöscht werden." };
  }
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
