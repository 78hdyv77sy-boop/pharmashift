import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireOrg } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

// Gesicherte Auslieferung von Feed-Anhängen: nur eingeloggte Mitglieder
// der eigenen Organisation. Bilder/PDFs werden inline angezeigt (Vorschau),
// ?download=1 erzwingt den Download.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 });
  let orgId: string;
  try {
    ({ orgId } = await requireOrg());
  } catch {
    return new NextResponse("No org", { status: 403 });
  }

  const { id } = await params;
  const att = await prisma.postAttachment.findFirst({
    where: { id, orgId, post: { deletedAt: null } },
  });
  if (!att) return new NextResponse("Not found", { status: 404 });

  const download = req.nextUrl.searchParams.get("download") === "1";
  const disposition = download ? "attachment" : "inline";
  const safeName = encodeURIComponent(att.name);

  return new NextResponse(new Uint8Array(att.data), {
    headers: {
      "Content-Type": att.mime,
      "Content-Length": String(att.size),
      "Content-Disposition": `${disposition}; filename*=UTF-8''${safeName}`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
