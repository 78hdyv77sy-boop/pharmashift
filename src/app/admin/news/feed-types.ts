// Typen des News-Feeds (bewusst NICHT in der "use server"-Datei).

export interface FeedAttachment {
  id: string;
  name: string;
  mime: string;
  size: number;
}
export interface FeedComment {
  id: string;
  authorName: string;
  text: string;
  createdAt: string;
}
export interface FeedPollRow {
  id: string | null;
  label: string;
  count: number;
  percent: number;
  mine: boolean;
}
export interface FeedPoll {
  id: string;
  question: string;
  allowCustom: boolean;
  closed: boolean;
  canClose: boolean;
  showVotesToAll: boolean;
  total: number;
  rows: FeedPollRow[];
  voterNames?: Record<string, string[]>; // label -> Namen (nur wenn sichtbar)
}
export interface FeedPost {
  id: string;
  text: string;
  createdAt: string;
  authorName: string;
  audience: string; // "Alle Apotheken" oder Standortname
  isBroadcast: boolean;
  seenByMe: boolean;
  seenCount: number;
  canSeeReaders: boolean;
  canDelete: boolean;
  attachments: FeedAttachment[];
  comments: FeedComment[];
  poll: FeedPoll | null;
}
export interface FeedPage {
  posts: FeedPost[];
  nextCursor: string | null;
}
