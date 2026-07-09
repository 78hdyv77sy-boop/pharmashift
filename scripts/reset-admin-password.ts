/**
 * Not-Reset des Admin-Passworts direkt in der Datenbank.
 * Aufruf (mit der Neon-URL, damit es die Cloud-DB trifft):
 *   DATABASE_URL="postgresql://...neon..." npx tsx scripts/reset-admin-password.ts "MeinNeuesPasswort"
 * Ohne Argument wird auf "ChangeMe123" zurückgesetzt.
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@pharmashift.local";
  const newPw = process.argv[2] ?? "ChangeMe123";
  const passwordHash = await bcrypt.hash(newPw, 12);
  const user = await prisma.user.update({ where: { email }, data: { passwordHash } });
  console.log(`✓ Passwort für ${user.email} neu gesetzt auf: ${newPw}`);
  console.log("  Bitte nach dem Login sofort in 'Mein Konto' ändern.");
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
