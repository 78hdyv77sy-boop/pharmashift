// Geteilte Chat-Typen. BEWUSST KEIN "use server" hier:
// aus "use server"-Dateien dürfen nur async-Funktionen exportiert werden,
// Typen/Interfaces gehören in ein normales Modul (Projekt-Standard).

export interface ChatMsg {
  id: string;
  userId: string;
  authorName: string;
  body: string;
  createdAt: string; // ISO
  mine: boolean;
}

// Ein auswählbarer Kanal im Chat. teamId = null bedeutet "Allgemein" (org-weit).
export interface Channel {
  teamId: string | null;
  name: string;
  canManage: boolean; // darf der aktuelle User dieses Team verwalten?
  isDirect?: boolean; // 1:1-Direktnachricht
}

// Ein Org-Mitglied (Login-User) für die Mitglieder-Auswahl eines Teams.
export interface OrgUser {
  userId: string;
  name: string;
  isMember: boolean; // bereits im Team?
}
