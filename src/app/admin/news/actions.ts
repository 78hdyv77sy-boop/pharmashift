"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, getUserPermissions } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/permissions";
import { tallyVotes } from "@/lib/domain/poll";
import type { FeedPage, FeedPost, FeedPoll } from "./feed-types";

type Result = { ok: boolean; error?: string; message?: string };

type Ctx = Awaited<ReturnType<typeof requirePermission>>;
async function hasBroadcast(c: Ctx): Promise<boolean> {
  if (c.session.user.isSuperAdmin) return true;
  return (await getUserPermissions(c.userId, c.orgId)).has(PERMISSIONS.NEWS_BROADCAST);
}

const PAGE_SIZE = 10;
const MAX_FILE = 8 * 1024 * 1024; // 8 MB
const MIME_OK = [
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

// Sichtbarkeit: eigener Standort ODER Broadcast (locationId null).
// Broadcaster (Leitung) sehen alles.
async function audienceWhere(orgId: string, userId: string, canBroadcast: boolean) {
  if (canBroadcast) return {};
  const me = await prisma.employee.findFirst({
    where: { orgId, userId, deletedAt: null },
    select: { locationId: true },
  });
  const locId = me?.locationId ?? null;
  return locId
    ? { OR: [{ locationId: null }, { locationId: locId }] }
    : { locationId: null };
}

async function nameMap(userIds: string[]): Promise<Map<string, string>> {
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(userIds)] } },
    select: { id: true, name: true, email: true },
  });
  return new Map(users.map((u) => [u.id, u.name || u.email || "—"]));
}

export async function listPosts(cursor?: string | null): Promise<FeedPage> {
  const c = await requirePermission(PERMISSIONS.NEWS_VIEW);
  const canBroadcast = await hasBroadcast(c);

  const posts = await prisma.post.findMany({
    where: { orgId: c.orgId, deletedAt: null, ...(await audienceWhere(c.orgId, c.userId, canBroadcast)) },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      attachments: { select: { id: true, name: true, mime: true, size: true } },
      reads: { select: { userId: true } },
      comments: { orderBy: { createdAt: "asc" }, take: 50 },
      poll: { include: { options: { orderBy: { order: "asc" } }, votes: true } },
    },
  });

  const hasMore = posts.length > PAGE_SIZE;
  const page = hasMore ? posts.slice(0, PAGE_SIZE) : posts;

  const locIds = [...new Set(page.map((p) => p.locationId).filter((x): x is string => !!x))];
  const locs = locIds.length
    ? await prisma.location.findMany({ where: { orgId: c.orgId, id: { in: locIds } }, select: { id: true, name: true } })
    : [];
  const locName = new Map(locs.map((l) => [l.id, l.name]));

  const userIds = [
    ...page.map((p) => p.authorId),
    ...page.flatMap((p) => p.comments.map((cm) => cm.authorId)),
    ...page.flatMap((p) => (p.poll ? p.poll.votes.map((v) => v.userId) : [])),
  ];
  const names = await nameMap(userIds);

  const items: FeedPost[] = page.map((p) => {
    const isAuthor = p.authorId === c.userId;
    const canSeeReaders = isAuthor || canBroadcast;
    let poll: FeedPoll | null = null;
    if (p.poll) {
      const tally = tallyVotes(p.poll.options, p.poll.votes);
      const myVote = p.poll.votes.find((v) => v.userId === c.userId);
      const showVoters = p.poll.showVotesToAll || canSeeReaders;
      let voterNames: Record<string, string[]> | undefined;
      if (showVoters) {
        voterNames = {};
        for (const o of p.poll.options) {
          voterNames[o.label] = p.poll.votes.filter((v) => v.optionId === o.id).map((v) => names.get(v.userId) ?? "—");
        }
        for (const v of p.poll.votes.filter((v) => !v.optionId && v.customText)) {
          const key = `„${v.customText!.trim()}“`;
          (voterNames[key] ??= []).push(names.get(v.userId) ?? "—");
        }
      }
      poll = {
        id: p.poll.id,
        question: p.poll.question,
        allowCustom: p.poll.allowCustom,
        closed: !!p.poll.closedAt,
        canClose: (isAuthor || canBroadcast) && !p.poll.closedAt,
        showVotesToAll: p.poll.showVotesToAll,
        total: tally.total,
        rows: tally.rows.map((r) => ({
          ...r,
          mine: myVote ? (r.id ? myVote.optionId === r.id : !!myVote.customText && r.label === `„${myVote.customText.trim()}“`) : false,
        })),
        voterNames,
      };
    }
    return {
      id: p.id,
      text: p.text,
      createdAt: p.createdAt.toISOString(),
      authorName: names.get(p.authorId) ?? "—",
      audience: p.locationId ? (locName.get(p.locationId) ?? "Standort") : "Alle Apotheken",
      isBroadcast: !p.locationId,
      seenByMe: p.reads.some((r) => r.userId === c.userId),
      seenCount: p.reads.length,
      canSeeReaders,
      canDelete: isAuthor || canBroadcast,
      attachments: p.attachments,
      comments: p.comments.map((cm) => ({
        id: cm.id,
        authorName: names.get(cm.authorId) ?? "—",
        text: cm.text,
        createdAt: cm.createdAt.toISOString(),
      })),
      poll,
    };
  });

  return { posts: items, nextCursor: hasMore ? page[page.length - 1].id : null };
}

export async function createPost(formData: FormData): Promise<Result> {
  const c = await requirePermission(PERMISSIONS.NEWS_POST);
  const text = String(formData.get("text") ?? "").trim();
  const locationId = String(formData.get("locationId") ?? "");
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const pollQuestion = String(formData.get("pollQuestion") ?? "").trim();
  const pollOptions = String(formData.get("pollOptions") ?? "")
    .split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 10);
  const allowCustom = formData.get("allowCustom") === "1";
  const showVotesToAll = formData.get("showVotesToAll") === "1";

  if (!text && files.length === 0 && !pollQuestion) return { ok: false, error: "Bitte Text, Datei oder Umfrage angeben." };

  // Zielgruppe prüfen
  if (!locationId) {
    if (!(await hasBroadcast(c))) {
      return { ok: false, error: "An alle Apotheken dürfen nur Berechtigte posten." };
    }
  } else {
    const loc = await prisma.location.findFirst({ where: { id: locationId, orgId: c.orgId }, select: { id: true } });
    if (!loc) return { ok: false, error: "Unbekannter Standort." };
  }

  // Dateien prüfen + lesen
  const atts: { name: string; mime: string; size: number; data: Uint8Array<ArrayBuffer> }[] = [];
  for (const f of files.slice(0, 5)) {
    if (!MIME_OK.includes(f.type)) return { ok: false, error: `Dateityp nicht erlaubt: ${f.name}` };
    if (f.size > MAX_FILE) return { ok: false, error: `Datei zu groß (max. 8 MB): ${f.name}` };
    atts.push({ name: f.name, mime: f.type, size: f.size, data: new Uint8Array(await f.arrayBuffer()) as Uint8Array<ArrayBuffer> });
  }
  if (pollQuestion && pollOptions.length < 2 && !allowCustom) {
    return { ok: false, error: "Umfrage braucht mindestens 2 Optionen (oder eigene Antworten erlauben)." };
  }

  await prisma.$transaction(async (tx) => {
    const post = await tx.post.create({
      data: { orgId: c.orgId, authorId: c.userId, locationId: locationId || null, text },
    });
    if (atts.length) {
      await tx.postAttachment.createMany({
        data: atts.map((a) => ({ orgId: c.orgId, postId: post.id, ...a })),
      });
    }
    if (pollQuestion) {
      await tx.poll.create({
        data: {
          orgId: c.orgId, postId: post.id, question: pollQuestion, allowCustom, showVotesToAll,
          options: { create: pollOptions.map((label, i) => ({ label, order: i })) },
        },
      });
    }
    // Autor:in hat den eigenen Beitrag gesehen
    await tx.postRead.create({ data: { orgId: c.orgId, postId: post.id, userId: c.userId } });
  });

  revalidatePath("/admin/news");
  revalidatePath("/admin/dashboard");
  return { ok: true, message: "Beitrag veröffentlicht." };
}

export async function markRead(postId: string): Promise<Result> {
  const c = await requirePermission(PERMISSIONS.NEWS_VIEW);
  const post = await prisma.post.findFirst({ where: { id: postId, orgId: c.orgId, deletedAt: null }, select: { id: true } });
  if (!post) return { ok: false, error: "Beitrag nicht gefunden." };
  await prisma.postRead.upsert({
    where: { postId_userId: { postId, userId: c.userId } },
    create: { orgId: c.orgId, postId, userId: c.userId },
    update: {},
  });
  return { ok: true };
}

export async function listReaders(postId: string): Promise<{ ok: boolean; error?: string; readers?: { name: string; at: string }[] }> {
  const c = await requirePermission(PERMISSIONS.NEWS_VIEW);
  const post = await prisma.post.findFirst({ where: { id: postId, orgId: c.orgId }, select: { authorId: true } });
  if (!post) return { ok: false, error: "Beitrag nicht gefunden." };
  if (post.authorId !== c.userId && !(await hasBroadcast(c))) {
    return { ok: false, error: "Nur Autor:in oder Leitung sehen die Gelesen-Liste." };
  }
  const reads = await prisma.postRead.findMany({ where: { postId, orgId: c.orgId }, orderBy: { at: "asc" } });
  const names = await nameMap(reads.map((r) => r.userId));
  return { ok: true, readers: reads.map((r) => ({ name: names.get(r.userId) ?? "—", at: r.at.toISOString() })) };
}

export async function addComment(postId: string, text: string): Promise<Result> {
  const c = await requirePermission(PERMISSIONS.NEWS_VIEW);
  const t = text.trim();
  if (!t) return { ok: false, error: "Leerer Kommentar." };
  const post = await prisma.post.findFirst({ where: { id: postId, orgId: c.orgId, deletedAt: null }, select: { id: true } });
  if (!post) return { ok: false, error: "Beitrag nicht gefunden." };
  await prisma.postComment.create({ data: { orgId: c.orgId, postId, authorId: c.userId, text: t.slice(0, 2000) } });
  revalidatePath("/admin/news");
  return { ok: true };
}

export async function deletePost(postId: string): Promise<Result> {
  const c = await requirePermission(PERMISSIONS.NEWS_VIEW);
  const post = await prisma.post.findFirst({ where: { id: postId, orgId: c.orgId, deletedAt: null }, select: { authorId: true } });
  if (!post) return { ok: false, error: "Beitrag nicht gefunden." };
  if (post.authorId !== c.userId && !(await hasBroadcast(c))) {
    return { ok: false, error: "Nur Autor:in oder Leitung dürfen löschen." };
  }
  await prisma.post.update({ where: { id: postId }, data: { deletedAt: new Date() } });
  await prisma.auditLog.create({
    data: { orgId: c.orgId, actorId: c.userId, action: "news.post.delete", entity: "post", entityId: postId, meta: {} },
  });
  revalidatePath("/admin/news");
  revalidatePath("/admin/dashboard");
  return { ok: true, message: "Beitrag gelöscht." };
}

export async function votePoll(pollId: string, optionId: string | null, customText?: string): Promise<Result> {
  const c = await requirePermission(PERMISSIONS.NEWS_VIEW);
  const poll = await prisma.poll.findFirst({
    where: { id: pollId, orgId: c.orgId },
    select: { closedAt: true, allowCustom: true, options: { select: { id: true } } },
  });
  if (!poll) return { ok: false, error: "Umfrage nicht gefunden." };
  if (poll.closedAt) return { ok: false, error: "Umfrage ist geschlossen." };

  if (optionId) {
    if (!poll.options.some((o) => o.id === optionId)) return { ok: false, error: "Ungültige Option." };
  } else {
    if (!poll.allowCustom) return { ok: false, error: "Eigene Antworten sind hier nicht erlaubt." };
    if (!customText?.trim()) return { ok: false, error: "Bitte eine Antwort eingeben." };
  }

  await prisma.pollVote.upsert({
    where: { pollId_userId: { pollId, userId: c.userId } },
    create: { orgId: c.orgId, pollId, userId: c.userId, optionId, customText: optionId ? null : customText!.trim().slice(0, 120) },
    update: { optionId, customText: optionId ? null : customText!.trim().slice(0, 120) },
  });
  revalidatePath("/admin/news");
  return { ok: true };
}

export async function closePoll(pollId: string): Promise<Result> {
  const c = await requirePermission(PERMISSIONS.NEWS_VIEW);
  const poll = await prisma.poll.findFirst({
    where: { id: pollId, orgId: c.orgId },
    select: { closedAt: true, post: { select: { authorId: true } } },
  });
  if (!poll) return { ok: false, error: "Umfrage nicht gefunden." };
  if (poll.post.authorId !== c.userId && !(await hasBroadcast(c))) {
    return { ok: false, error: "Nur Autor:in oder Leitung dürfen schließen." };
  }
  if (poll.closedAt) return { ok: true };
  await prisma.poll.update({ where: { id: pollId }, data: { closedAt: new Date() } });
  revalidatePath("/admin/news");
  return { ok: true, message: "Umfrage geschlossen." };
}

// Standorte für den Zielgruppen-Wähler
export async function listAudiences(): Promise<{ id: string; name: string }[]> {
  const c = await requirePermission(PERMISSIONS.NEWS_POST);
  return prisma.location.findMany({ where: { orgId: c.orgId }, select: { id: true, name: true }, orderBy: { name: "asc" } });
}
