"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { SidebarNav } from "@/components/admin/sidebar-nav";

// UX-P0 / Befund U1: Mobile hatte KEINE Navigation (Sidebar hidden md:block,
// kein Burger). Dieses Slide-in-Panel behebt den Bug.

export function MobileNav({ pendingAbsences = 0, unreadNews = 0, showNightDuty = false }: { pendingAbsences?: number; unreadNews?: number; showNightDuty?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

  // Bei Navigation automatisch schließen
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="md:hidden print:hidden">
      <button
        onClick={() => setOpen(true)}
        className="flex h-10 w-10 items-center justify-center rounded-md hover:bg-accent"
        aria-label="Navigation öffnen"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-background shadow-xl animate-in slide-in-from-left">
            <div className="flex h-14 items-center justify-between border-b px-4">
              <span className="wordmark">Pharma<span className="dot" aria-hidden="true" /><b>Shift</b></span>
              <button
                onClick={() => setOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-md hover:bg-accent"
                aria-label="Navigation schließen"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <SidebarNav pendingAbsences={pendingAbsences} unreadNews={unreadNews} showNightDuty={showNightDuty} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
