import { PERMISSIONS, type PermissionKey } from "@/lib/permissions";

export interface PermissionMeta {
  key: PermissionKey;
  label: string;
}

export interface PermissionGroup {
  group: string;
  items: PermissionMeta[];
}

// Gruppierte, beschriftete Darstellung aller Permissions für den Editor.
export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    group: "Organisation",
    items: [
      { key: PERMISSIONS.ORG_MANAGE, label: "Organisation verwalten" },
      { key: PERMISSIONS.ORG_SETTINGS, label: "Einstellungen ändern" },
    ],
  },
  {
    group: "Userverwaltung & Rollen",
    items: [
      { key: PERMISSIONS.USER_VIEW, label: "Mitglieder ansehen" },
      { key: PERMISSIONS.USER_INVITE, label: "Mitglieder einladen" },
      { key: PERMISSIONS.USER_MANAGE, label: "Mitglieder verwalten" },
      { key: PERMISSIONS.ROLE_MANAGE, label: "Rollen verwalten" },
    ],
  },
  {
    group: "Dienstplan",
    items: [
      { key: PERMISSIONS.LOCATION_MANAGE, label: "Standorte verwalten" },
      { key: PERMISSIONS.EMPLOYEE_VIEW, label: "Mitarbeiter ansehen" },
      { key: PERMISSIONS.EMPLOYEE_MANAGE, label: "Mitarbeiter verwalten" },
      { key: PERMISSIONS.SHIFT_VIEW, label: "Schichten ansehen" },
      { key: PERMISSIONS.SHIFT_CREATE, label: "Schichten erstellen" },
      { key: PERMISSIONS.SHIFT_MANAGE, label: "Schichten verwalten" },
      { key: PERMISSIONS.PLAN_MANAGE, label: "Dienstpläne verwalten" },
      { key: PERMISSIONS.PLAN_PUBLISH, label: "Dienstpläne veröffentlichen" },
      { key: PERMISSIONS.ABSENCE_REQUEST, label: "Abwesenheit beantragen" },
      { key: PERMISSIONS.ABSENCE_APPROVE, label: "Abwesenheit genehmigen" },
    ],
  },
  {
    group: "CMS",
    items: [
      { key: PERMISSIONS.CMS_PAGE_VIEW, label: "Seiten ansehen" },
      { key: PERMISSIONS.CMS_PAGE_EDIT, label: "Seiten bearbeiten" },
      { key: PERMISSIONS.CMS_MENU_EDIT, label: "Menüs bearbeiten" },
      { key: PERMISSIONS.CMS_MEDIA_MANAGE, label: "Medien verwalten" },
    ],
  },
  {
    group: "KI-Agent",
    items: [{ key: PERMISSIONS.AGENT_USE, label: "Voice-Agent nutzen" }],
  },
];

export const PERMISSION_LABELS: Record<string, string> = Object.fromEntries(
  PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => [i.key, i.label])),
);
