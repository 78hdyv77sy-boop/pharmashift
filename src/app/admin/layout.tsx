import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserPermissions } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { Providers } from "@/components/providers";
import { SidebarNav } from "@/components/admin/sidebar-nav";
import { OrgSwitcher } from "@/components/admin/org-switcher";
import { MobileNav } from "@/components/admin/mobile-nav";
import { CommandPalette } from "@/components/admin/command-palette";
import { VoiceAgent } from "@/components/voice/voice-agent";
import { ChatWidget } from "@/components/admin/chat-widget";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/admin/theme-toggle";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // tenancy-ok: Org-Switcher listet bewusst ALLE Organisationen des Users (cross-org by design)
  const memberships = await prisma.membership.findMany({
    where: { userId: session.user.id, status: "ACTIVE" },
    include: { org: true },
  });
  const orgs = memberships.map((m) => ({ id: m.org.id, name: m.org.name }));

  // Voice-Agent-Kontext (nur wenn aktive Org + Berechtigung)
  const activeOrgId = session.user.activeOrgId;
  const perms = activeOrgId
    ? session.user.isSuperAdmin
      ? new Set(Object.values(PERMISSIONS))
      : await getUserPermissions(session.user.id, activeOrgId)
    : new Set<string>();
  const canUseAgent = perms.has(PERMISSIONS.AGENT_USE);
  const showNightDuty = perms.has(PERMISSIONS.NIGHTDUTY_USE);
  const canUseChat = perms.has(PERMISSIONS.CHAT_USE);

  let agentData = { employees: [] as { id: string; name: string }[], locations: [] as { id: string; name: string }[], roles: [] as { id: string; name: string }[] };
  if (canUseAgent && activeOrgId) {
    const [employees, locations, roles] = await Promise.all([
      prisma.employee.findMany({ where: { orgId: activeOrgId, deletedAt: null, active: true }, orderBy: { lastName: "asc" }, select: { id: true, firstName: true, lastName: true } }),
      prisma.location.findMany({ where: { orgId: activeOrgId, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.role.findMany({ where: { orgId: activeOrgId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    ]);
    agentData = {
      employees: employees.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}` })),
      locations,
      roles,
    };
  }

  const pendingAbsences = session.user.activeOrgId
    ? await prisma.absence.count({ where: { status: "REQUESTED", employee: { orgId: session.user.activeOrgId } } })
    : 0;

  // Ungelesene Neuigkeiten (roter Punkt in der Navigation)
  let unreadNews = 0;
  if (session.user.activeOrgId) {
    const orgIdN = session.user.activeOrgId;
    const meEmp = await prisma.employee.findFirst({
      where: { orgId: orgIdN, userId: session.user.id, deletedAt: null },
      select: { locationId: true },
    });
    unreadNews = await prisma.post.count({
      where: {
        orgId: orgIdN,
        deletedAt: null,
        ...(meEmp?.locationId ? { OR: [{ locationId: null }, { locationId: meEmp.locationId }] } : {}),
        reads: { none: { userId: session.user.id } },
      },
    });
  }

  return (
    <Providers>
      <div className="flex min-h-screen">
        <aside className="sidebar-glass hidden w-64 shrink-0 border-r md:block print:hidden">
          <div className="flex h-14 items-center border-b px-5">
            <Link href="/admin/dashboard" className="wordmark">
              Pharma<span className="dot" aria-hidden="true" /><b>Shift</b>
            </Link>
          </div>
          <SidebarNav pendingAbsences={pendingAbsences} unreadNews={unreadNews} showNightDuty={showNightDuty} />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 items-center justify-between gap-3 border-b px-4 print:hidden">
            <div className="flex items-center gap-2">
              <MobileNav pendingAbsences={pendingAbsences} unreadNews={unreadNews} showNightDuty={showNightDuty} />
              <OrgSwitcher orgs={orgs} activeOrgId={session.user.activeOrgId} />
            </div>
            <CommandPalette />
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <Link href="/admin/account" className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline" title="Mein Konto / Passwort ändern">{session.user.email}</Link>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/login" });
                }}
              >
                <Button variant="outline" size="sm">Abmelden</Button>
              </form>
            </div>
          </header>
          <main className="flex-1 p-4 sm:p-6">{children}</main>
        </div>
      </div>
      {canUseAgent && (
        <VoiceAgent employees={agentData.employees} locations={agentData.locations} roles={agentData.roles} />
      )}
      {canUseChat && <ChatWidget />}
    </Providers>
  );
}
