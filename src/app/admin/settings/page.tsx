import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireOrg } from "@/lib/tenant";
import { getUserPermissions } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { SettingsForm } from "./settings-form";
import { AliasManager, type AliasEntry } from "./alias-manager";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  let orgId: string;
  try {
    ({ orgId } = await requireOrg());
  } catch {
    return <p className="text-sm text-muted-foreground">Keine aktive Organisation.</p>;
  }

  const perms = session.user.isSuperAdmin
    ? new Set(Object.values(PERMISSIONS))
    : await getUserPermissions(session.user.id, orgId);
  const canRead = perms.has(PERMISSIONS.ORG_SETTINGS) || perms.has(PERMISSIONS.ORG_MANAGE);
  if (!canRead) return <p className="text-sm text-destructive">Keine Berechtigung für Einstellungen.</p>;

  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true, slug: true, timezone: true } });
  if (!org) return <p className="text-sm text-destructive">Organisation nicht gefunden.</p>;

  const [aliasSetting, locations, employees] = await Promise.all([
    prisma.setting.findUnique({ where: { orgId_key: { orgId, key: "agent.aliases" } } }),
    prisma.location.findMany({ where: { orgId, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.employee.findMany({ where: { orgId, deletedAt: null, active: true }, orderBy: { lastName: "asc" }, select: { id: true, firstName: true, lastName: true } }),
  ]);
  const aliases = (Array.isArray(aliasSetting?.value) ? aliasSetting?.value : []) as unknown as AliasEntry[];

  const publicBase = (process.env.NEXT_PUBLIC_APP_URL || process.env.AUTH_URL || "https://app.pharmashift.example").replace(/\/$/, "");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Einstellungen</h1>
        <p className="text-sm text-muted-foreground">Organisationsdaten und öffentliche Adresse verwalten.</p>
      </div>
      <SettingsForm
        initial={{ name: org.name, slug: org.slug, timezone: org.timezone }}
        canEdit={perms.has(PERMISSIONS.ORG_SETTINGS)}
        publicBase={publicBase}
      />

      <hr />

      <AliasManager
        initial={aliases}
        locations={locations}
        employees={employees.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}` }))}
        canEdit={perms.has(PERMISSIONS.ORG_SETTINGS)}
      />
    </div>
  );
}
