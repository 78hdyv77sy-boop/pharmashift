// Zugriffsregeln für Chat-Kanäle. Normales Server-Modul (kein "use server"),
// damit auch Hilfsfunktionen exportiert werden dürfen.
//
// Regeln (bewusst einfach):
//  - Kanal "Allgemein" (teamId = null): jede:r mit CHAT_USE darf lesen/schreiben.
//  - Team-Kanal: lesen/schreiben darf, wer Mitglied ist ODER Teams verwalten darf
//    (CHAT_MANAGE / SuperAdmin).
//  - Verwalten (umbenennen/löschen/Mitglieder) darf: Ersteller:in des Teams,
//    CHAT_MANAGE-Rolle oder SuperAdmin.

import { prisma } from "@/lib/prisma";
import { getUserPermissions } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";

export interface ChatCtx {
  orgId: string;
  userId: string;
  isSuperAdmin: boolean;
}

export async function hasChatManage(ctx: ChatCtx): Promise<boolean> {
  if (ctx.isSuperAdmin) return true;
  const perms = await getUserPermissions(ctx.userId, ctx.orgId);
  return perms.has(PERMISSIONS.CHAT_MANAGE);
}

export async function isTeamMember(teamId: string, userId: string): Promise<boolean> {
  const m = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
    select: { id: true },
  });
  return !!m;
}

// Lädt ein Team org-gescoped und nicht gelöscht (oder null).
export async function getTeam(orgId: string, teamId: string) {
  return prisma.team.findFirst({ where: { id: teamId, orgId, deletedAt: null } });
}

// Darf der User diesen Kanal lesen/beschreiben?
export async function canAccessChannel(ctx: ChatCtx, teamId: string | null): Promise<boolean> {
  if (teamId === null) return true; // Allgemein
  const team = await getTeam(ctx.orgId, teamId);
  if (!team) return false;
  if (await hasChatManage(ctx)) return true;
  return isTeamMember(teamId, ctx.userId);
}

// Darf der User dieses Team verwalten?
export async function canManageTeam(ctx: ChatCtx, team: { createdById: string }): Promise<boolean> {
  if (team.createdById === ctx.userId) return true;
  return hasChatManage(ctx);
}
