"use client";

import * as React from "react";
import { Check, CheckCheck, FileText, Download, ImageIcon, Trash2, Loader2, Megaphone, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { listPosts, createPost, markRead, listReaders, addComment, deletePost, votePoll, closePoll, listAudiences } from "./actions";
import type { FeedPage, FeedPost } from "./feed-types";

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "gerade eben";
  if (mins < 60) return `vor ${mins} Min.`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `vor ${h} Std.`;
  return d.toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function NewsFeed({ compact = false, canPost, myLocationId }: { compact?: boolean; canPost: boolean; myLocationId: string | null }) {
  const { toast } = useToast();
  const [page, setPage] = React.useState<FeedPage | null>(null);
  const [loadingMore, setLoadingMore] = React.useState(false);

  const load = React.useCallback(async () => {
    const p = await listPosts(null).catch(() => null);
    if (p) setPage(compact ? { ...p, posts: p.posts.slice(0, 3) } : p);
  }, [compact]);

  React.useEffect(() => {
    load().catch(() => {});
  }, [load]);

  // Gelesen-Markierung: alles was angezeigt wird, gilt als gesehen.
  React.useEffect(() => {
    if (!page) return;
    for (const p of page.posts) {
      if (!p.seenByMe) markRead(p.id).catch(() => {});
    }
    // bewusst nur bei neuen Posts; lokale Anzeige aktualisiert der nächste load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page?.posts.map((p) => p.id).join(",")]);

  async function loadMore() {
    if (!page?.nextCursor) return;
    setLoadingMore(true);
    const next = await listPosts(page.nextCursor).catch(() => null);
    setLoadingMore(false);
    if (next) setPage({ posts: [...page.posts, ...next.posts], nextCursor: next.nextCursor });
  }

  return (
    <div className="space-y-4">
      {canPost && !compact && <Composer myLocationId={myLocationId} onPosted={load} />}
      {page === null ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : page.posts.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Noch keine Neuigkeiten – schreib den ersten Beitrag!</p>
      ) : (
        page.posts.map((p) => <PostCard key={p.id} post={p} onChanged={load} toast={toast} />)
      )}
      {!compact && page?.nextCursor && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => { loadMore().catch(() => {}); }} disabled={loadingMore}>
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : "Mehr laden"}
          </Button>
        </div>
      )}
      {compact && (
        <a href="/admin/news" className="block text-center text-sm text-primary hover:underline">Alle Neuigkeiten →</a>
      )}
    </div>
  );
}

function Composer({ myLocationId, onPosted }: { myLocationId: string | null; onPosted: () => Promise<void> }) {
  const { toast } = useToast();
  const [audiences, setAudiences] = React.useState<{ id: string; name: string }[]>([]);
  const [showPoll, setShowPoll] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    listAudiences().then(setAudiences).catch(() => {});
  }, []);

  async function submit(fd: FormData) {
    setBusy(true);
    const res = await createPost(fd).catch(() => ({ ok: false, error: "Unerwarteter Fehler.", message: undefined as string | undefined }));
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "Fehler", "error"); return; }
    toast(res.message ?? "Veröffentlicht.", "success");
    formRef.current?.reset();
    setShowPoll(false);
    await onPosted();
  }

  return (
    <form
      ref={formRef}
      action={(fd) => { submit(fd).catch(() => {}); }}
      className="space-y-2 rounded-xl border bg-card p-3 shadow-sm"
    >
      <textarea
        name="text"
        rows={2}
        placeholder="Was gibt's Neues?"
        className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
      />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select name="locationId" defaultValue={myLocationId ?? ""} className="rounded-md border bg-background px-2 py-1.5 text-xs">
          <option value="">📢 Alle Apotheken</option>
          {audiences.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <label className="cursor-pointer rounded-md border px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent">
          📎 Dateien
          <input type="file" name="files" multiple accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx" className="hidden" />
        </label>
        <button type="button" onClick={() => setShowPoll((v) => !v)} className={`rounded-md border px-2 py-1.5 text-xs ${showPoll ? "bg-accent" : "text-muted-foreground hover:bg-accent"}`}>
          📊 Umfrage
        </button>
        <Button type="submit" size="sm" className="ml-auto" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-3.5 w-3.5" /> Posten</>}
        </Button>
      </div>
      {showPoll && (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <input name="pollQuestion" placeholder="Frage, z. B. Wer ist bei der Weihnachtsfeier dabei?" className="w-full rounded-md border bg-background px-3 py-1.5 text-sm" />
          <textarea name="pollOptions" rows={3} defaultValue={"Ja\nNein\nVielleicht"} placeholder={"Eine Option pro Zeile"} className="w-full rounded-md border bg-background px-3 py-1.5 text-sm" />
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <label className="flex items-center gap-1.5"><input type="checkbox" name="allowCustom" value="1" /> Eigene Antworten erlauben</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" name="showVotesToAll" value="1" /> Alle sehen, wer wie gestimmt hat</label>
          </div>
        </div>
      )}
    </form>
  );
}

function PostCard({ post, onChanged, toast }: { post: FeedPost; onChanged: () => Promise<void>; toast: (m: string, v?: "success" | "error" | "info") => void }) {
  const [readers, setReaders] = React.useState<{ name: string; at: string }[] | null>(null);
  const [comment, setComment] = React.useState("");
  const [customAnswer, setCustomAnswer] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function showReaders() {
    if (readers) { setReaders(null); return; }
    const res = await listReaders(post.id).catch(() => ({ ok: false as const, error: "Fehler", readers: undefined }));
    if (res.ok && res.readers) setReaders(res.readers);
    else toast(res.error ?? "Fehler", "error");
  }

  async function sendComment() {
    if (!comment.trim()) return;
    setBusy(true);
    const res = await addComment(post.id, comment).catch(() => ({ ok: false, error: "Fehler" }));
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "Fehler", "error"); return; }
    setComment("");
    await onChanged();
  }

  async function vote(optionId: string | null, custom?: string) {
    const res = await votePoll(post.poll!.id, optionId, custom).catch(() => ({ ok: false, error: "Fehler" }));
    if (!res.ok) { toast(res.error ?? "Fehler", "error"); return; }
    setCustomAnswer("");
    await onChanged();
  }

  const images = post.attachments.filter((a) => a.mime.startsWith("image/"));
  const pdfs = post.attachments.filter((a) => a.mime === "application/pdf");
  const others = post.attachments.filter((a) => !a.mime.startsWith("image/") && a.mime !== "application/pdf");

  return (
    <article className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
      {/* Kopf */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-medium">{post.authorName}</div>
          <div className="text-xs text-muted-foreground">
            {timeAgo(post.createdAt)} · {post.isBroadcast ? <span className="inline-flex items-center gap-1 text-primary"><Megaphone className="h-3 w-3" /> Alle Apotheken</span> : post.audience}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { if (post.canSeeReaders) showReaders().catch(() => {}); }}
            className={`inline-flex items-center gap-1 text-xs ${post.canSeeReaders ? "text-muted-foreground hover:text-foreground" : "text-muted-foreground/60"}`}
            title={post.canSeeReaders ? "Gesehen von … anzeigen" : "Gesehen"}
          >
            {post.seenByMe ? <CheckCheck className="h-4 w-4 text-primary" /> : <Check className="h-4 w-4" />}
            {post.seenCount}
          </button>
          {post.canDelete && (
            <button
              onClick={() => { deletePost(post.id).then((r) => { if (!r.ok) toast(r.error ?? "Fehler", "error"); return onChanged(); }).catch(() => {}); }}
              className="text-muted-foreground/60 hover:text-destructive"
              title="Beitrag löschen"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Text */}
      {post.text && <p className="whitespace-pre-wrap break-words text-sm">{post.text}</p>}

      {/* Bilder als Vorschau */}
      {images.length > 0 && (
        <div className={`grid gap-2 ${images.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {images.map((a) => (
            <a key={a.id} href={`/api/news/attachment/${a.id}`} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/news/attachment/${a.id}`} alt={a.name} className="max-h-72 w-full rounded-lg border object-cover" />
            </a>
          ))}
        </div>
      )}

      {/* PDFs mit eingebetteter Vorschau */}
      {pdfs.map((a) => (
        <div key={a.id} className="overflow-hidden rounded-lg border">
          <iframe src={`/api/news/attachment/${a.id}`} title={a.name} className="h-64 w-full bg-muted/30" />
          <div className="flex items-center justify-between gap-2 border-t px-3 py-1.5 text-xs">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground"><FileText className="h-3.5 w-3.5" /> {a.name}</span>
            <a href={`/api/news/attachment/${a.id}?download=1`} className="inline-flex items-center gap-1 text-primary hover:underline"><Download className="h-3.5 w-3.5" /> Herunterladen</a>
          </div>
        </div>
      ))}

      {/* Sonstige Dateien */}
      {others.map((a) => (
        <a key={a.id} href={`/api/news/attachment/${a.id}?download=1`} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-accent">
          <span className="inline-flex items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground" /> {a.name}</span>
          <Download className="h-4 w-4 text-muted-foreground" />
        </a>
      ))}

      {/* Umfrage */}
      {post.poll && (
        <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium">📊 {post.poll.question}</div>
            {post.poll.canClose && (
              <button onClick={() => { closePoll(post.poll!.id).then(() => onChanged()).catch(() => {}); }} className="text-xs text-muted-foreground hover:text-foreground">Schließen</button>
            )}
          </div>
          <div className="space-y-1.5">
            {post.poll.rows.map((r, i) => (
              <button
                key={i}
                disabled={post.poll!.closed || r.id === null}
                onClick={() => { vote(r.id).catch(() => {}); }}
                className={`relative block w-full overflow-hidden rounded-md border px-3 py-1.5 text-left text-sm transition ${r.mine ? "border-primary" : ""} ${post.poll!.closed || r.id === null ? "cursor-default" : "hover:bg-accent"}`}
              >
                <span className="absolute inset-y-0 left-0 bg-primary/10" style={{ width: `${r.percent}%` }} />
                <span className="relative flex items-center justify-between gap-2">
                  <span className="tabular-nums">{r.mine ? "✓ " : ""}{r.label}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{r.count} · {r.percent}%</span>
                </span>
                {post.poll!.voterNames?.[r.label]?.length ? (
                  <span className="relative mt-0.5 block text-xs text-muted-foreground">{post.poll!.voterNames[r.label].join(", ")}</span>
                ) : null}
              </button>
            ))}
          </div>
          {post.poll.allowCustom && !post.poll.closed && (
            <div className="flex gap-2">
              <input value={customAnswer} onChange={(e) => setCustomAnswer(e.target.value)} placeholder="Eigene Antwort …" className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm" />
              <Button size="sm" variant="outline" onClick={() => { vote(null, customAnswer).catch(() => {}); }} disabled={!customAnswer.trim()}>Antworten</Button>
            </div>
          )}
          <div className="text-xs text-muted-foreground tabular-nums">{post.poll.total} Stimme{post.poll.total === 1 ? "" : "n"}{post.poll.closed ? " · geschlossen" : " · Stimme änderbar bis zum Schließen"}</div>
        </div>
      )}

      {/* Gelesen-Liste */}
      {readers && (
        <div className="rounded-lg border bg-muted/20 p-3 text-xs">
          <div className="mb-1 font-medium">Gesehen von {readers.length}:</div>
          {readers.map((r, i) => (
            <div key={i} className="flex justify-between text-muted-foreground">
              <span>{r.name}</span>
              <span className="tabular-nums">{new Date(r.at).toLocaleString("de-AT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          ))}
        </div>
      )}

      {/* Kommentare */}
      {post.comments.length > 0 && (
        <div className="space-y-1.5 border-t pt-2">
          {post.comments.map((cm) => (
            <div key={cm.id} className="text-sm">
              <span className="font-medium">{cm.authorName}</span>{" "}
              <span className="text-xs text-muted-foreground">{timeAgo(cm.createdAt)}</span>
              <div className="whitespace-pre-wrap break-words text-sm">{cm.text}</div>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2 border-t pt-2">
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendComment().catch(() => {}); } }}
          placeholder="Antworten …"
          className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
        <Button size="sm" variant="outline" onClick={() => { sendComment().catch(() => {}); }} disabled={busy || !comment.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Senden"}
        </Button>
      </div>
    </article>
  );
}

// Verhindert "unused"-Warnung, ImageIcon bewusst für spätere Galerie reserviert
void ImageIcon;
