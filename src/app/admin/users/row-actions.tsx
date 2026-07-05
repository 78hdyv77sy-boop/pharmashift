"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { changeMemberRole, removeMember, setMemberStatus } from "./actions";
import { useToast } from "@/components/ui/toaster";
import { useConfirm } from "@/components/ui/confirm-dialog";

interface Props {
  member: { userId: string; status: string; roles: { id: string; name: string }[] };
  roles: { id: string; name: string }[];
  isSelf: boolean;
}

export function RowActions({ member, roles, isSelf }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const confirmDialog = useConfirm();
  const [busy, setBusy] = React.useState(false);
  const currentRoleId = member.roles[0]?.id;

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok && res.error) toast(res.error, "error");
    else router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" disabled={busy} aria-label="Aktionen">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Rolle setzen</DropdownMenuLabel>
        {roles.map((r) => (
          <DropdownMenuItem
            key={r.id}
            disabled={r.id === currentRoleId}
            onSelect={() => run(() => changeMemberRole(member.userId, r.id))}
          >
            {r.name}{r.id === currentRoleId ? " ✓" : ""}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {member.status === "SUSPENDED" ? (
          <DropdownMenuItem disabled={isSelf} onSelect={() => run(() => setMemberStatus(member.userId, "ACTIVE"))}>
            Aktivieren
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled={isSelf} onSelect={() => run(() => setMemberStatus(member.userId, "SUSPENDED"))}>
            Sperren
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          disabled={isSelf}
          className="text-destructive"
          onSelect={async () => {
            if (await confirmDialog({ title: "Mitglied wirklich entfernen?", confirmText: "Entfernen", destructive: true })) run(() => removeMember(member.userId));
          }}
        >
          Entfernen
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
