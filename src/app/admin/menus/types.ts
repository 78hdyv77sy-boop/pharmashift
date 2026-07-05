export interface MenuItemInput {
  clientId: string;
  parentClientId: string | null;
  label: string;
  linkType: "page" | "url";
  pageId?: string | null;
  href?: string | null;
  target?: string | null;
}
