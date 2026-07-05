"use client";

import * as React from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/toaster";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { createTeam, renameTeam, deleteTeam, listTeamMembers, setTeamMember } from "./team-actions";
import type { OrgUser } from "./types";

interface Props {
  // null = neues Team anlegen; sonst bestehendes Team verwalten
  team: { teamId: string; name: string } | null;
  onClose: () => void;
  onChanged: (opts?: { deletedTeamId?: string; newTeamId?: string }) => void;
}

export function TeamManager({ team, onClose, onChanged }: Props) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const isNew = team === null;

  const [name, setName] = React.useState(team?.name ?? "");
  const [busy, setBusy] = React.useState(false);
  const [users, setUsers] = React.useState<OrgUser[]>([]);
  const [loadingUsers, setLoadingUsers] = React.useState(!isNew);

  // Mitgliederliste laden (nur im Verwalten-Modus)
  React.useEffect(() => {
    if (isNew || !team) return;
    let active = true;
    (async () => {
      const res = await listTeamMembers(team.teamId);
      if (!active) return;
      if (res.ok) setUsers(res.users);
      else toast(res.error ?? "Fehler beim Laden", "error");
      setLoadingUsers(false);
    })();
    return () => { active = false; };
  }, [isNew, team, toast]);

  async function handleCreate() {
    setBusy(true);
    const res = await createTeam(name);
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "Fehler", "error"); return; }
    toast("Team erstellt.", "success");
    onChanged({ newTeamId: res.teamId });
    onClose();
  }

  async function handleRename() {
    if (!team) return;
    setBusy(true);
    const res = await renameTeam(team.teamId, name);
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "Fehler", "error"); return; }
    toast("Team umbenannt.", "success");
    onChanged();
  }

  async function handleDelete() {
    if (!team) return;
    const ok = await confirm({
      title: "Team löschen?",
      description: `„${team.name}" und alle Nachrichten dieses Kanals werden ausgeblendet.`,
      confirmText: "Löschen",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    const res = await deleteTeam(team.teamId);
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "Fehler", "error"); return; }
    toast("Team gelöscht.", "success");
    onChanged({ deletedTeamId: team.teamId });
    onClose();
  }

  async function toggleMember(u: OrgUser) {
    if (!team) return;
    const next = !u.isMember;
    // optimistisch umschalten
    setUsers((prev) => prev.map((x) => (x.userId === u.userId ? { ...x, isMember: next } : x)));
    const res = await setTeamMember(team.teamId, u.userId, next);
    if (!res.ok) {
      setUsers((prev) => prev.map((x) => (x.userId === u.userId ? { ...x, isMember: !next } : x)));
      toast(res.error ?? "Fehler", "error");
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isNew ? "Neues Team" : "Team verwalten"}</DialogTitle>
          <DialogDescription>
            {isNew
              ? "Lege ein Team an. Du wirst automatisch Mitglied und kannst danach weitere Personen hinzufügen."
              : "Name ändern, Mitglieder verwalten oder das Team löschen."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Name</label>
            <div className="flex gap-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z. B. Frühdienst, Filiale Nord, Apotheker:innen"
                maxLength={60}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); isNew ? handleCreate() : handleRename(); } }}
              />
              {!isNew && (
                <Button onClick={handleRename} disabled={busy || !name.trim()} variant="outline">Speichern</Button>
              )}
            </div>
          </div>

          {!isNew && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Mitglieder</label>
              <div className="max-h-60 space-y-1 overflow-y-auto rounded-md border p-2">
                {loadingUsers ? (
                  <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Lade…
                  </div>
                ) : users.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">Keine Org-Mitglieder gefunden.</p>
                ) : (
                  users.map((u) => (
                    <label key={u.userId} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-muted">
                      <Checkbox checked={u.isMember} onCheckedChange={() => toggleMember(u)} />
                      <span className="text-sm">{u.name}</span>
                    </label>
                  ))
                )}
              </div>
              <p className="text-xs text-muted-foreground">Nur Mitglieder sehen und schreiben in diesem Kanal.</p>
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
          {!isNew ? (
            <Button variant="ghost" onClick={handleDelete} disabled={busy} className="text-destructive hover:text-destructive">
              <Trash2 className="mr-1 h-4 w-4" /> Team löschen
            </Button>
          ) : <span />}
          {isNew ? (
            <Button onClick={handleCreate} disabled={busy || !name.trim()}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Erstellen
            </Button>
          ) : (
            <Button variant="outline" onClick={onClose}>Fertig</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
