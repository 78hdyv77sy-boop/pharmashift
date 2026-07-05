"use server";

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { provisionOrgRoles, uniqueOrgSlug } from "@/lib/org";
import {
  registerSchema,
  requestResetSchema,
  resetPasswordSchema,
} from "@/lib/validation/auth";
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
} from "@/lib/email/resend";

type ActionResult = { ok: boolean; error?: string; message?: string };

const token = () => crypto.randomBytes(32).toString("hex");
const hours = (n: number) => new Date(Date.now() + n * 3600_000);

/**
 * Self-Signup: erstellt User + neue Organisation + Membership + weist
 * OrgAdmin zu und verschickt eine Verifizierungsmail.
 */
export async function registerAction(input: unknown): Promise<ActionResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Ungültige Eingabe" };
  }
  const { name, email, password, orgName } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { ok: false, error: "E-Mail bereits registriert" };

  const passwordHash = await bcrypt.hash(password, 12);
  const slug = await uniqueOrgSlug(orgName);

  const { userId } = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name, email, passwordHash, status: "ACTIVE" },
    });
    const org = await tx.organization.create({ data: { name: orgName, slug } });
    await tx.membership.create({ data: { userId: user.id, orgId: org.id, status: "ACTIVE" } });
    return { userId: user.id, orgId: org.id };
  });

  // Rollen außerhalb der Transaktion provisionieren (mehrere Inserts)
  const lastOrg = await prisma.membership.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  if (lastOrg) {
    const orgAdminRoleId = await provisionOrgRoles(lastOrg.orgId);
    await prisma.userRole.create({
      data: { userId, roleId: orgAdminRoleId, orgId: lastOrg.orgId },
    });
  }

  // E-Mail-Verifizierung
  const vToken = token();
  await prisma.verificationToken.create({
    data: { identifier: email, token: vToken, expires: hours(24) },
  });
  await sendVerificationEmail(email, vToken);

  return { ok: true, message: "Konto erstellt. Bitte E-Mail bestätigen." };
}

export async function verifyEmailAction(rawToken: string): Promise<ActionResult> {
  const vt = await prisma.verificationToken.findUnique({ where: { token: rawToken } });
  if (!vt || vt.expires < new Date()) return { ok: false, error: "Token ungültig oder abgelaufen" };

  await prisma.user.update({
    where: { email: vt.identifier },
    data: { emailVerified: new Date() },
  });
  await prisma.verificationToken.delete({ where: { token: rawToken } });
  return { ok: true, message: "E-Mail bestätigt." };
}

export async function requestPasswordResetAction(input: unknown): Promise<ActionResult> {
  const parsed = requestResetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Ungültige E-Mail" };

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  // Aus Sicherheitsgründen immer "ok" zurückgeben (keine Account-Enumeration)
  if (user) {
    const rToken = token();
    await prisma.passwordResetToken.create({
      data: { email: user.email, token: rToken, expires: hours(1) },
    });
    await sendPasswordResetEmail(user.email, rToken);
  }
  return { ok: true, message: "Falls die E-Mail existiert, wurde ein Link versendet." };
}

export async function resetPasswordAction(input: unknown): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Ungültige Eingabe" };
  }
  const { token: rToken, password } = parsed.data;

  const prt = await prisma.passwordResetToken.findUnique({ where: { token: rToken } });
  if (!prt || prt.expires < new Date()) return { ok: false, error: "Link ungültig oder abgelaufen" };

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.update({ where: { email: prt.email }, data: { passwordHash } });
  await prisma.passwordResetToken.delete({ where: { token: rToken } });
  return { ok: true, message: "Passwort aktualisiert. Du kannst dich jetzt anmelden." };
}

/** Liefert Eckdaten einer Einladung (für Prefill der Registrierungsseite). */
export async function getInvitationAction(
  token: string,
): Promise<{ ok: boolean; email?: string; orgName?: string; userExists?: boolean; error?: string }> {
  const inv = await prisma.invitation.findUnique({ where: { token }, include: { org: true } });
  if (!inv || inv.status !== "PENDING" || inv.expiresAt < new Date()) {
    return { ok: false, error: "Einladung ungültig oder abgelaufen." };
  }
  const user = await prisma.user.findUnique({ where: { email: inv.email } });
  return { ok: true, email: inv.email, orgName: inv.org.name, userExists: !!user };
}

/**
 * Nimmt eine Einladung an: legt (falls nötig) den User an, erstellt die
 * Membership in der eingeladenen Org und weist die Rolle zu.
 */
export async function acceptInvitationAction(input: {
  token: string;
  name?: string;
  password?: string;
}): Promise<ActionResult> {
  const inv = await prisma.invitation.findUnique({ where: { token: input.token } });
  if (!inv || inv.status !== "PENDING" || inv.expiresAt < new Date()) {
    return { ok: false, error: "Einladung ungültig oder abgelaufen." };
  }

  let user = await prisma.user.findUnique({ where: { email: inv.email } });

  if (!user) {
    if (!input.name || !input.password || input.password.length < 8) {
      return { ok: false, error: "Name und Passwort (min. 8 Zeichen) erforderlich." };
    }
    const passwordHash = await bcrypt.hash(input.password, 12);
    user = await prisma.user.create({
      data: {
        email: inv.email,
        name: input.name,
        passwordHash,
        status: "ACTIVE",
        emailVerified: new Date(), // E-Mail durch Einladung bestätigt
      },
    });
  }

  await prisma.membership.upsert({
    where: { userId_orgId: { userId: user.id, orgId: inv.orgId } },
    update: { status: "ACTIVE" },
    create: { userId: user.id, orgId: inv.orgId, status: "ACTIVE" },
  });

  if (inv.roleId) {
    await prisma.userRole.upsert({
      where: { userId_roleId_orgId: { userId: user.id, roleId: inv.roleId, orgId: inv.orgId } },
      update: {},
      create: { userId: user.id, roleId: inv.roleId, orgId: inv.orgId },
    });
  }

  await prisma.invitation.update({ where: { id: inv.id }, data: { status: "ACCEPTED" } });
  return { ok: true, message: "Einladung angenommen." };
}
