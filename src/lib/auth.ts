import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validation/auth";
import { rateLimit, ipFromHeaders } from "@/lib/rate-limit";
import { authConfig } from "@/lib/auth.config";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      isSuperAdmin: boolean;
      activeOrgId: string | null;
    } & DefaultSession["user"];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" }, // Credentials erfordert JWT-Sessions
  providers: [
    ...authConfig.providers,
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw, request) {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        // P0: Brute-Force-Schutz (Standard 3.13)
        const ip = ipFromHeaders(request.headers);
        const byEmail = rateLimit(`login:email:${email.toLowerCase()}`, 5, 60_000);
        const byIp = rateLimit(`login:ip:${ip}`, 20, 60_000);
        if (!byEmail.ok || !byIp.ok) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.passwordHash || user.deletedAt) return null;
        if (user.status === "SUSPENDED") return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger, session }) {
      if (user?.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          include: { memberships: { where: { status: "ACTIVE" }, take: 1 } },
        });
        token.id = dbUser?.id ?? token.sub!;
        token.isSuperAdmin = dbUser?.isSuperAdmin ?? false;
        token.activeOrgId = dbUser?.memberships[0]?.orgId ?? null;
      }
      // Org-Wechsel via useSession().update({ activeOrgId })
      if (trigger === "update" && session?.activeOrgId && token.id) {
        const membership = await prisma.membership.findUnique({
          where: { userId_orgId: { userId: token.id as string, orgId: session.activeOrgId } },
        });
        if (membership?.status === "ACTIVE" || token.isSuperAdmin) {
          token.activeOrgId = session.activeOrgId;
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.isSuperAdmin = (token.isSuperAdmin as boolean) ?? false;
      session.user.activeOrgId = (token.activeOrgId as string | null) ?? null;
      return session;
    },
  },
});
