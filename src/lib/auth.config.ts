import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Edge-sichere Basis-Konfiguration. Enthält KEINE Prisma-/bcrypt-Abhängigkeit,
 * damit sie in der Middleware (Edge Runtime) laufen kann. Der Credentials-
 * Provider und der PrismaAdapter werden erst in auth.ts (Node) ergänzt.
 */
export const authConfig = {
  pages: { signIn: "/login" },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
} satisfies NextAuthConfig;
