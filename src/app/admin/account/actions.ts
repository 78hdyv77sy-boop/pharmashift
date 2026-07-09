"use server";

import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Result = { ok: boolean; error?: string; message?: string };

// Eigenes Passwort ändern: aktuelles Passwort muss stimmen (Schutz,
// falls jemand an einem offenen Gerät sitzt), neues min. 8 Zeichen.
export async function changeOwnPassword(currentRaw: string, nextRaw: string, repeatRaw: string): Promise<Result> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Nicht angemeldet." };

  // Unsichtbare Leer-/Steuerzeichen aus Copy-Paste abschneiden (häufige
  // Fehlerquelle: "richtiges" Passwort schlägt trotzdem fehl).
  const current = currentRaw.trim();
  const next = nextRaw.trim();
  const repeat = repeatRaw.trim();

  if (next.length < 8) return { ok: false, error: "Neues Passwort: mindestens 8 Zeichen." };
  if (next !== repeat) return { ok: false, error: "Die Wiederholung stimmt nicht überein." };
  if (next === current) return { ok: false, error: "Das neue Passwort muss sich vom aktuellen unterscheiden." };

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, passwordHash: true },
  });
  if (!user?.passwordHash) return { ok: false, error: "Für dieses Konto ist kein Passwort-Login eingerichtet." };

  const okCurrent = await bcrypt.compare(current, user.passwordHash);
  if (!okCurrent) return { ok: false, error: "Aktuelles Passwort ist falsch." };

  const passwordHash = await bcrypt.hash(next, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  return { ok: true, message: "Passwort geändert. Beim nächsten Login gilt das neue Passwort." };
}
