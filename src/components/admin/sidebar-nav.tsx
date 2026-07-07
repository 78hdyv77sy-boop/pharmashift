"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, Users, ShieldCheck, FileText, Menu as MenuIcon, Image as ImageIcon, Building2, UserCog, Tags, CalendarRange, CalendarOff, CalendarCheck, LayoutTemplate, Siren, Moon, ScrollText, MessageCircle, Settings, ChevronRight, ArrowLeftRight, ListChecks, Gauge, Newspaper } from "lucide-react";
import { cn } from "@/lib/utils";

// UX-P1 / 13.2 X1: 2 Gruppen statt 16 flacher Einträge.
// "Planung" = tägliche Arbeit, immer sichtbar. "Verwaltung" = seltene
// Stammdaten-Pflege, einklappbar. CMS nur mit NEXT_PUBLIC_FEATURE_CMS=1.

interface NavItem { href: string; label: string; icon: LucideIcon }

const PLANNING: NavItem[] = [
  { href: "/admin/dashboard", label: "Heute", icon: LayoutDashboard },
  { href: "/admin/shifts", label: "Dienstplan", icon: CalendarRange },
  { href: "/admin/shifts/swaps", label: "Schichttausch", icon: ArrowLeftRight },
  { href: "/admin/absences", label: "Abwesenheiten", icon: CalendarOff },
  { href: "/admin/emergency", label: "Notdienst", icon: Siren },
  { href: "/admin/nightduty", label: "Nachtdienst", icon: Moon },
  { href: "/admin/tasks", label: "Aufgaben", icon: ListChecks },
  { href: "/admin/news", label: "Neuigkeiten", icon: Newspaper },
  { href: "/admin/chat", label: "Team-Chat", icon: MessageCircle },
];

const ADMIN: NavItem[] = [
  { href: "/admin/employees", label: "Mitarbeiter", icon: UserCog },
  { href: "/admin/fairness", label: "Fairness", icon: Gauge },
  { href: "/admin/availability", label: "Verfügbarkeiten", icon: CalendarCheck },
  { href: "/admin/templates", label: "Schicht-Vorlagen", icon: LayoutTemplate },
  { href: "/admin/locations", label: "Standorte", icon: Building2 },
  { href: "/admin/master-data", label: "Stammdaten", icon: Tags },
  { href: "/admin/users", label: "Userverwaltung", icon: Users },
  { href: "/admin/roles", label: "Rollen", icon: ShieldCheck },
  { href: "/admin/audit", label: "Audit-Log", icon: ScrollText },
  { href: "/admin/settings", label: "Einstellungen", icon: Settings },
];

const CMS: NavItem[] = [
  { href: "/admin/pages", label: "Seiten", icon: FileText },
  { href: "/admin/menus", label: "Menüs", icon: MenuIcon },
  { href: "/admin/media", label: "Medien", icon: ImageIcon },
];

const CMS_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CMS === "1";

function Item({ item, active, badge }: { item: NavItem; active: boolean; badge?: number }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "nav-item relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm",
        active
          ? "bg-primary/[0.08] font-medium text-primary before:absolute before:left-0 before:top-1/2 before:h-4 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-primary"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {item.label}
      {badge !== undefined && badge > 0 && (
        <span className="ml-auto rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">{badge}</span>
      )}
    </Link>
  );
}

function Group({ title, items, pathname, collapsible, storageKey, badges }: {
  title: string; items: NavItem[]; pathname: string; collapsible?: boolean; storageKey?: string; badges?: Record<string, number>;
}) {
  const hasActive = items.some((i) => pathname.startsWith(i.href));
  const [open, setOpen] = React.useState(true);

  // Zustand merken; Gruppe mit aktiver Seite ist immer offen
  React.useEffect(() => {
    if (!collapsible || !storageKey) return;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored !== null) setOpen(stored === "1");
    } catch { /* z.B. Safari privat */ }
  }, [collapsible, storageKey]);

  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      if (storageKey) { try { window.localStorage.setItem(storageKey, next ? "1" : "0"); } catch {} }
      return next;
    });
  }

  const expanded = open || hasActive;
  return (
    <div className="space-y-0.5">
      {collapsible ? (
        <button
          onClick={toggle}
          className="flex w-full items-center gap-1 px-2.5 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground/70 hover:text-foreground"
          aria-expanded={expanded}
        >
          <ChevronRight className={cn("h-3 w-3 transition-transform", expanded && "rotate-90")} />
          {title}
        </button>
      ) : (
        <div className="px-2.5 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">{title}</div>
      )}
      {expanded && items.map((i) => <Item key={i.href} item={i} active={pathname.startsWith(i.href)} badge={badges?.[i.href]} />)}
    </div>
  );
}

export function SidebarNav({ pendingAbsences = 0, unreadNews = 0, showNightDuty = false }: { pendingAbsences?: number; unreadNews?: number; showNightDuty?: boolean }) {
  const pathname = usePathname();
  const badges = { "/admin/absences": pendingAbsences, "/admin/news": unreadNews };
  const planning = showNightDuty ? PLANNING : PLANNING.filter((i) => i.href !== "/admin/nightduty");
  return (
    <nav className="flex flex-col gap-4 p-3">
      <Group title="Planung" items={planning} pathname={pathname} badges={badges} />
      <Group title="Verwaltung" items={ADMIN} pathname={pathname} collapsible storageKey="ps:nav:admin" />
      {CMS_ENABLED && <Group title="Website (CMS)" items={CMS} pathname={pathname} collapsible storageKey="ps:nav:cms" />}
    </nav>
  );
}
