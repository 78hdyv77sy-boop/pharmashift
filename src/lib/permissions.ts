// Zentrale Liste aller Permission-Keys. Wird im Seed in die DB geschrieben
// und an Rollen gehängt. Server-Guards prüfen gegen diese Keys.

export const PERMISSIONS = {
  // Organisation / Plattform
  ORG_MANAGE: "org.manage",
  ORG_SETTINGS: "org.settings",
  // Userverwaltung & RBAC
  USER_VIEW: "user.view",
  USER_INVITE: "user.invite",
  USER_MANAGE: "user.manage",
  ROLE_MANAGE: "role.manage",
  // Dienstplan-Domäne
  LOCATION_MANAGE: "location.manage",
  EMPLOYEE_VIEW: "employee.view",
  EMPLOYEE_MANAGE: "employee.manage",
  SHIFT_VIEW: "shift.view",
  SHIFT_CREATE: "shift.create",
  SHIFT_MANAGE: "shift.manage",
  PLAN_MANAGE: "plan.manage",
  PLAN_PUBLISH: "plan.publish",
  ABSENCE_REQUEST: "absence.request",
  ABSENCE_APPROVE: "absence.approve",
  // CMS
  CMS_PAGE_VIEW: "cms.page.view",
  CMS_PAGE_EDIT: "cms.page.edit",
  CMS_MENU_EDIT: "cms.menu.edit",
  CMS_MEDIA_MANAGE: "cms.media.manage",
  // Voice-Agent
  AGENT_USE: "agent.use",
  // Nachtdienst (nur Apotheker:in + Leitung)
  NIGHTDUTY_USE: "nightduty.use",
  NIGHTDUTY_VIEW_ALL: "nightduty.view_all",
  // Team-Chat
  CHAT_USE: "chat.use",
  CHAT_MANAGE: "chat.manage", // Teams anlegen/umbenennen/löschen, Mitglieder verwalten
  // Aufgabenmanagement
  TASK_VIEW: "task.view",
  TASK_MANAGE: "task.manage", // Aufgaben anlegen/bearbeiten/löschen
  // Fairness-Engine (nur Anzeige)
  FAIRNESS_VIEW_ALL: "fairness.view_all", // alle Scores sehen (Leitung); sonst nur eigener
  // News-Feed ("Schwarzes Brett")
  NEWS_VIEW: "news.view",
  NEWS_POST: "news.post",
  NEWS_BROADCAST: "news.broadcast", // an ALLE Apotheken posten + alle Gelesen-Listen sehen
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS = Object.values(PERMISSIONS);

// System-Rollen mit Default-Permission-Sets (orgId=null Vorlagen).
export const SYSTEM_ROLES: Record<string, PermissionKey[]> = {
  OrgAdmin: ALL_PERMISSIONS,
  Manager: [
    PERMISSIONS.USER_VIEW,
    PERMISSIONS.USER_INVITE,
    PERMISSIONS.EMPLOYEE_VIEW,
    PERMISSIONS.EMPLOYEE_MANAGE,
    PERMISSIONS.LOCATION_MANAGE,
    PERMISSIONS.SHIFT_VIEW,
    PERMISSIONS.SHIFT_CREATE,
    PERMISSIONS.SHIFT_MANAGE,
    PERMISSIONS.PLAN_MANAGE,
    PERMISSIONS.PLAN_PUBLISH,
    PERMISSIONS.ABSENCE_APPROVE,
    PERMISSIONS.CMS_PAGE_VIEW,
    PERMISSIONS.CMS_PAGE_EDIT,
    PERMISSIONS.CMS_MENU_EDIT,
    PERMISSIONS.CMS_MEDIA_MANAGE,
    PERMISSIONS.AGENT_USE,
    PERMISSIONS.NIGHTDUTY_USE,
    PERMISSIONS.NIGHTDUTY_VIEW_ALL,
    PERMISSIONS.CHAT_USE,
    PERMISSIONS.CHAT_MANAGE,
    PERMISSIONS.TASK_VIEW,
    PERMISSIONS.TASK_MANAGE,
    PERMISSIONS.FAIRNESS_VIEW_ALL,
    PERMISSIONS.NEWS_VIEW,
    PERMISSIONS.NEWS_POST,
    PERMISSIONS.NEWS_BROADCAST,
  ],
  Mitarbeiter: [
    PERMISSIONS.SHIFT_VIEW,
    PERMISSIONS.EMPLOYEE_VIEW,
    PERMISSIONS.ABSENCE_REQUEST,
    PERMISSIONS.AGENT_USE,
    PERMISSIONS.CHAT_USE,
    PERMISSIONS.TASK_VIEW,
    PERMISSIONS.NEWS_VIEW,
    PERMISSIONS.NEWS_POST,
  ],
  Viewer: [PERMISSIONS.SHIFT_VIEW, PERMISSIONS.EMPLOYEE_VIEW, PERMISSIONS.CMS_PAGE_VIEW, PERMISSIONS.TASK_VIEW, PERMISSIONS.NEWS_VIEW],
};
