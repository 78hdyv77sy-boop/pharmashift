"use client";

import * as React from "react";
import { Send, Trash2, Loader2, Plus, Settings2 } from "lucide-react";
import { useToast } from "@/components/ui/toaster";
import { sendChatMessage, loadChatMessages, deleteChatMessage } from "@/app/admin/chat/actions";
import { listChannels, listDmPartners, openDirectChat } from "@/app/admin/chat/team-actions";
import { TeamManager } from "@/app/admin/chat/team-manager";
import type { ChatMsg, Channel } from "@/app/admin/chat/types";

// Gemeinsame Chat-Oberfläche für den Reiter (groß) und das Widget (kompakt).
// Mehrere Kanäle: "Allgemein" (org-weit) + frei anlegbare Teams.
// Polling alle 8s — bewusst einfach gehalten (kein WebSocket, Plan §17).

export function ChatPanel({ compact = false }: { compact?: boolean }) {
  const { toast } = useToast();
  const [channels, setChannels] = React.useState<Channel[]>([{ teamId: null, name: "Allgemein", canManage: false }]);
  const [activeTeamId, setActiveTeamId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<ChatMsg[]>([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [sending, setSending] = React.useState(false);
  const [manager, setManager] = React.useState<{ team: { teamId: string; name: string } | null } | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // verhindert, dass eine verspätete Antwort den falschen Kanal überschreibt
  const activeRef = React.useRef<string | null>(activeTeamId);
  activeRef.current = activeTeamId;

  const scrollToBottom = React.useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });
  }, []);

  const loadChannels = React.useCallback(async () => {
    try {
      const res = await listChannels();
      setChannels(res);
    } catch {
      /* still */
    }
  }, []);

  React.useEffect(() => { loadChannels(); }, [loadChannels]);

  const refresh = React.useCallback(async () => {
    const tid = activeTeamId;
    const res = await loadChatMessages(tid);
    if (tid !== activeRef.current) return; // Kanal wurde zwischenzeitlich gewechselt
    if (res.ok) {
      setMessages((prev) => {
        if (res.messages.length !== prev.length) scrollToBottom();
        return res.messages;
      });
    }
    setLoading(false);
  }, [activeTeamId, scrollToBottom]);

  // bei Kanalwechsel: leeren, laden, Polling neu starten
  React.useEffect(() => {
    setLoading(true);
    setMessages([]);
    refresh();
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
  }, [refresh]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    const res = await sendChatMessage(activeTeamId, text);
    setSending(false);
    if (!res.ok || !res.message) { toast(res.error ?? "Fehler", "error"); return; }
    setMessages((prev) => [...prev, res.message!]);
    setInput("");
    scrollToBottom();
  }

  async function remove(id: string) {
    const res = await deleteChatMessage(id);
    if (!res.ok) { toast(res.error ?? "Fehler", "error"); return; }
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }

  const handleChanged = React.useCallback(async (opts?: { deletedTeamId?: string; newTeamId?: string }) => {
    await loadChannels();
    if (opts?.newTeamId) setActiveTeamId(opts.newTeamId);
    if (opts?.deletedTeamId && opts.deletedTeamId === activeRef.current) setActiveTeamId(null);
  }, [loadChannels]);

  function fmtTime(iso: string) {
    return new Date(iso).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" });
  }

  const activeChannel = channels.find((c) => c.teamId === activeTeamId) ?? channels[0];

  return (
    <div className={`flex flex-col ${compact ? "h-full" : "h-[calc(100vh-12rem)] rounded-lg border"}`}>
      {/* Kanal-Leiste */}
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <div className="flex flex-1 items-center gap-1 overflow-x-auto">
          {channels.map((c) => (
            <button
              key={c.teamId ?? "all"}
              onClick={() => setActiveTeamId(c.teamId)}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition ${
                c.teamId === activeTeamId ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/70"
              }`}
            >
              {c.isDirect ? "@ " : ""}{c.name}
            </button>
          ))}
          <DmStarter onOpened={(teamId) => { handleChanged({ newTeamId: teamId }); }} />
        </div>
        {activeChannel?.canManage && activeChannel.teamId && (
          <button
            onClick={() => setManager({ team: { teamId: activeChannel.teamId!, name: activeChannel.name } })}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Team verwalten"
            title="Team verwalten"
          >
            <Settings2 className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={() => setManager({ team: null })}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Neues Team"
          title="Neues Team"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Nachrichten */}
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Lade…
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
            Noch keine Nachrichten in „{activeChannel?.name}".<br />Schreib die erste! 👋
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
              <div className={`group max-w-[80%] rounded-2xl px-3 py-1.5 text-sm ${m.mine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                {!m.mine && <div className="mb-0.5 text-xs font-medium opacity-70">{m.authorName}</div>}
                <div className="whitespace-pre-wrap break-words">{m.body}</div>
                <div className={`mt-0.5 flex items-center gap-2 text-[10px] ${m.mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  {fmtTime(m.createdAt)}
                  {m.mine && (
                    <button onClick={() => remove(m.id)} className="opacity-0 transition group-hover:opacity-100" aria-label="Löschen">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Eingabe */}
      <div className="flex items-center gap-2 border-t p-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={`Nachricht an „${activeChannel?.name}"…`}
          className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
        <button onClick={send} disabled={sending || !input.trim()} className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-50" aria-label="Senden">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>

      {manager && (
        <TeamManager team={manager.team} onClose={() => setManager(null)} onChanged={handleChanged} />
      )}
    </div>
  );
}


// "+ Direktnachricht": Person wählen -> private 1:1-Unterhaltung öffnen/erstellen.
function DmStarter({ onOpened }: { onOpened: (teamId: string) => void }) {
  const [partners, setPartners] = React.useState<{ userId: string; name: string }[] | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function load() {
    if (partners !== null) return;
    setPartners(await listDmPartners().catch(() => []));
  }

  return (
    <select
      className="shrink-0 rounded-full border bg-background px-2 py-1 text-xs text-muted-foreground outline-none hover:bg-muted/50"
      value=""
      disabled={busy}
      onFocus={load}
      onClick={load}
      onChange={async (e) => {
        const uid = e.target.value;
        if (!uid) return;
        setBusy(true);
        const res = await openDirectChat(uid).catch(() => ({ ok: false as const, error: "Fehler", teamId: undefined }));
        setBusy(false);
        if (res.ok && res.teamId) onOpened(res.teamId);
      }}
      aria-label="Direktnachricht starten"
      title="Direktnachricht starten"
    >
      <option value="">＋ Direktnachricht</option>
      {(partners ?? []).map((p) => (
        <option key={p.userId} value={p.userId}>{p.name}</option>
      ))}
    </select>
  );
}
