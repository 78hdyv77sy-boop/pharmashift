import { NextResponse } from "next/server";
import OpenAI from "openai";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const LIMIT_PER_HOUR = 20;

export async function POST(req: Request) {
  // P0: konkrete Permission statt nur Auth (Standard 3.13)
  let userId: string;
  try {
    ({ userId } = await requirePermission(PERMISSIONS.AGENT_USE));
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // P0: Kostenleck schließen – Rate-Limit je User
  const rl = rateLimit(`transcribe:${userId}`, LIMIT_PER_HOUR, 60 * 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Limit erreicht – bitte in ${Math.ceil(rl.retryAfterSeconds / 60)} Min erneut versuchen oder Text eingeben.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY fehlt – bitte Texteingabe nutzen." }, { status: 400 });
  }

  // P0: Größenlimit (Header-Check + echter Check nach dem Lesen)
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) {
    return NextResponse.json({ error: "Audiodatei zu groß (max. 10 MB)." }, { status: 413 });
  }

  const form = await req.formData();
  const file = form.get("audio");
  if (!(file instanceof File)) return NextResponse.json({ error: "Keine Audiodatei." }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Audiodatei zu groß (max. 10 MB)." }, { status: 413 });
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const tr = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      language: "de",
    });
    return NextResponse.json({ text: tr.text });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Transkription fehlgeschlagen." }, { status: 500 });
  }
}
