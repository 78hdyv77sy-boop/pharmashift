import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Liefert die aktuelle Session oder wirft. Basis für alle geschützten Aktionen.
 */
export async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  return session;
}

/**
 * Liefert die aktive Organisation des eingeloggten Users.
 * KRITISCH: Jede org-gescopte Query muss diese orgId verwenden.
 */
export async function requireOrg() {
  const session = await requireSession();
  const orgId = session.user.activeOrgId;
  if (!orgId) throw new Error("NO_ACTIVE_ORG");

  // Mitgliedschaft verifizieren (Mandanten-Isolation, auch wenn Token manipuliert)
  const membership = await prisma.membership.findUnique({
    where: { userId_orgId: { userId: session.user.id, orgId } },
  });
  if (!membership || membership.status !== "ACTIVE") {
    if (!session.user.isSuperAdmin) throw new Error("NOT_A_MEMBER");
  }
  return { session, orgId, userId: session.user.id };
}
