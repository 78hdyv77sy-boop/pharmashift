"use client";

import * as React from "react";
import { MessageCircle, X } from "lucide-react";
import { MortarPestleIcon } from "./mortar-pestle-icon";
import { ChatPanel } from "@/app/admin/chat/chat-panel";

// Mitlaufendes Team-Chat-Widget rechts unten. Sitzt LINKS vom KI-Button,
// damit sich beide nicht überlagern.

export function ChatWidget() {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-6 z-40 flex h-[28rem] w-80 max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="flex items-center gap-2 text-sm font-medium">
              <MessageCircle className="h-4 w-4" /> Team-Chat
            </span>
            <button onClick={() => setOpen(false)} aria-label="Schließen" className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <ChatPanel compact />
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Team-Chat"
        className="mortar-btn fixed bottom-6 right-24 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-background text-foreground shadow-lg ring-1 ring-border transition-transform hover:scale-105"
        title="Team-Chat"
      >
        <MortarPestleIcon className="h-7 w-7" />
      </button>
    </>
  );
}
