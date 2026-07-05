"use server";

import crypto from "crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { sendInvitationEmail } from "@/lib/email/resend";

type Result = { ok: boolean; error?: string; message?: string };

const inviteSchema = z.object({
  email: z.string().email("Ungültige E-Mail"),
  roleId: z.string().min(1, "Rolle erforderlich"),
});

async function audit(orgId: string, actorId: string, action: string, entityId?: string, meta?: object) {
  await prisma.auditLog.create({
    data: { orgId, actorId, action, entity: "membership", entityId, meta: meta as object },
  });
}

export async function inviteMember(input: unknown): Promise<Result> {
  const { orgId, userId } = await requirePermission(PERMISSIONS.USER_INVITE);
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message };
  const { email, roleId } = parsed.data;

  const role = await prisma.role.findFirst({ where: { id: roleId, orgId } });
  if (!role) return { ok: false, error: "Rolle gehört nicht zu dieser Organisation" };

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    const member = await prisma.membership.findUnique({
      where: { userId_orgId: { userId: existingUser.id, orgId } },
    });
    if (member) return { ok: false, error: "Diese Person ist bereits Mitglied." };
  }

  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  const token = crypto.randomBytes(32).toString("hex");
  await prisma.invitation.create({
    data: {
      orgId,
      email,
      roleId,
      token,
      invitedById: userId,
      status: "PENDING",
      expiresAt: new Date(Date.now() + 7 * 24 * 3600_000),
    },
  });
  await sendInvitationEmail(email, org?.name ?? "PharmaShift", token);
  await audit(orgId, userId, "invitation.created", undefined, { email, roleId });

  revalidatePath("/admin/users");
  return { ok: true, message: `Einladung an ${email} versendet.` };
}

export async function changeMemberRole(targetUserId: string, roleId: string): Promise<Result> {
  const { orgId, userId } = await requirePermission(PERMISSIONS.USER_MANAGE);

  const role = await prisma.role.findFirst({ where: { id: roleId, orgId } });
  if (!role) return { ok: false, error: "Unbekannte Rolle" };

  await prisma.$transaction([
    prisma.userRole.deleteMany({ where: { userId: targetUserId, orgId } }),
    prisma.userRole.create({ data: { userId: targetUserId, roleId, orgId } }),
  ]);
  await audit(orgId, userId, "member.role_changed", targetUserId, { roleId });

  revalidatePath("/admin/users");
  return { ok: true, message: "Rolle aktualisiert." };
}

export async function setMemberStatus(
  targetUserId: string,
  status: "ACTIVE" | "SUSPENDED",
): Promise<Result> {
  const { orgId, userId } = await requirePermission(PERMISSIONS.USER_MANAGE);
  if (targetUserId === userId) return { ok: false, error: "Du kannst deinen eigenen Status nicht ändern." };

  await prisma.membership.update({
    where: { userId_orgId: { userId: targetUserId, orgId } },
    data: { status },
  });
  await audit(orgId, userId, "member.status_changed", targetUserId, { status });

  revalidatePath("/admin/users");
  return { ok: true, message: status === "SUSPENDED" ? "Mitglied gesperrt." : "Mitglied aktiviert." };
}

export async function removeMember(targetUserId: string): Promise<Result> {
  const { orgId, userId } = await requirePermission(PERMISSIONS.USER_MANAGE);
  if (targetUserId === userId) return { ok: false, error: "Du kannst dich nicht selbst entfernen." };

  await prisma.$transaction([
    prisma.userRole.deleteMany({ where: { userId: targetUserId, orgId } }),
    prisma.membership.delete({ where: { userId_orgId: { userId: targetUserId, orgId } } }),
  ]);
  await audit(orgId, userId, "member.removed", targetUserId);

  revalidatePath("/admin/users");
  return { ok: true, message: "Mitglied entfernt." };
}
