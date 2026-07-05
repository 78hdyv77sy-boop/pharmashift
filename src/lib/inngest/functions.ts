import { inngest } from "./client";
import { prisma } from "@/lib/prisma";
import { computeInsights } from "@/lib/domain/insights";
import { sendInsightsDigestEmail } from "@/lib/email/resend";

// Nächtlicher Digest (8.6 V5): pro Organisation Insights berechnen und – wenn es
// Warnungen gibt – an OrgAdmins/Manager mailen. Läuft täglich 06:00 (Europe/Vienna).
export const nightlyDigest = inngest.createFunction(
  { id: "nightly-insights-digest", name: "Nächtlicher Insights-Digest" },
  { cron: "TZ=Europe/Vienna 0 6 * * *" },
  async ({ step }) => {
    const orgs = await step.run("load-orgs", () => prisma.organization.findMany({ select: { id: true, name: true } }));

    let mailsSent = 0;
    for (const org of orgs) {
      const insights = await step.run(`insights-${org.id}`, () => computeInsights(org.id));
      const warnings = insights.filter((i) => i.severity === "warn");
      if (warnings.length === 0) continue;

      const admins = await step.run(`admins-${org.id}`, () =>
        prisma.userRole.findMany({
          where: { orgId: org.id, role: { name: { in: ["OrgAdmin", "Manager"] } }, user: { deletedAt: null } },
          select: { user: { select: { email: true } } },
        }),
      );
      const emails = [...new Set(admins.map((a) => a.user.email).filter((e): e is string => !!e))];

      for (const email of emails) {
        await step.run(`mail-${org.id}-${email}`, async () => {
          await sendInsightsDigestEmail(email, org.name, insights);
          return { email };
        });
        mailsSent++;
      }
    }

    return { orgs: orgs.length, mailsSent };
  },
);
