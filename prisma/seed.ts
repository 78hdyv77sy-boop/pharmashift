import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { ALL_PERMISSIONS, SYSTEM_ROLES } from "../src/lib/permissions";

const prisma = new PrismaClient();

async function main() {
  // 1) Permissions
  for (const key of ALL_PERMISSIONS) {
    await prisma.permission.upsert({ where: { key }, update: {}, create: { key } });
  }
  console.log(`✓ ${ALL_PERMISSIONS.length} Permissions`);

  // 2) SuperAdmin
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@pharmashift.local";
  const adminPw = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const passwordHash = await bcrypt.hash(adminPw, 12);
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { isSuperAdmin: true },
    create: {
      email: adminEmail,
      name: "Super Admin",
      passwordHash,
      isSuperAdmin: true,
      emailVerified: new Date(),
      status: "ACTIVE",
    },
  });
  console.log(`✓ SuperAdmin: ${adminEmail} / ${adminPw}`);

  // 3) Demo-Organisation
  const org = await prisma.organization.upsert({
    where: { slug: "demo-apotheke" },
    update: {},
    create: { name: "Demo Apotheke", slug: "demo-apotheke" },
  });

  await prisma.membership.upsert({
    where: { userId_orgId: { userId: admin.id, orgId: org.id } },
    update: { status: "ACTIVE" },
    create: { userId: admin.id, orgId: org.id, status: "ACTIVE" },
  });

  // Default-Rollen für die Demo-Org provisionieren
  let orgAdminRoleId = "";
  for (const [roleName, permKeys] of Object.entries(SYSTEM_ROLES)) {
    const role = await prisma.role.upsert({
      where: { orgId_name: { orgId: org.id, name: roleName } },
      update: {},
      create: { orgId: org.id, name: roleName, isSystem: true, description: `${roleName} (System)` },
    });
    if (roleName === "OrgAdmin") orgAdminRoleId = role.id;
    const permissions = await prisma.permission.findMany({ where: { key: { in: permKeys } } });
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
  }

  await prisma.userRole.upsert({
    where: { userId_roleId_orgId: { userId: admin.id, roleId: orgAdminRoleId, orgId: org.id } },
    update: {},
    create: { userId: admin.id, roleId: orgAdminRoleId, orgId: org.id },
  });

  // 4) Beispiel-Standort + Qualifikationen/Zuständigkeiten + ein paar Mitarbeiter
  const location = await prisma.location.create({
    data: { orgId: org.id, name: "Hauptfiliale", isEmergency: true },
  });

  const quals = ["Approbation", "Notdienst-Erlaubnis"];
  for (const name of quals) {
    await prisma.qualification.upsert({
      where: { orgId_name: { orgId: org.id, name } },
      update: {},
      create: { orgId: org.id, name },
    });
  }

  const sampleEmployees = [
    { firstName: "Lisa", lastName: "Berger", type: "APOTHEKER" as const },
    { firstName: "Tom", lastName: "Klein", type: "PKA" as const },
    { firstName: "Anna", lastName: "Wolf", type: "PKA" as const },
  ];
  for (const e of sampleEmployees) {
    await prisma.employee.create({
      data: { orgId: org.id, locationId: location.id, weeklyHoursTarget: 38, ...e },
    });
  }

  console.log("✓ Demo-Org, Standort & Beispiel-Mitarbeiter angelegt");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
