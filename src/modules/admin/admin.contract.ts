export type AdminValue = string | number | boolean | null;

export type AdminValueKind = 'text' | 'number' | 'boolean' | 'date' | 'datetime' | 'email';

export interface AdminField {
  label: string;
  value: AdminValue;
  kind?: AdminValueKind;
}

export interface AdminColumn {
  key: string;
  label: string;
  kind?: AdminValueKind;
}

export interface AdminTable {
  columns: AdminColumn[];
  rows: Record<string, AdminValue>[];
  total: number;
}

export interface AdminSection {
  key: string;
  title: string;
  fields?: AdminField[];
  table?: AdminTable;
}

export interface AdminUserCounts {
  total: number;
  new7d: number;
  new30d: number;
  active7d: number;
}

export interface AdminStats {
  users: AdminUserCounts;
  metrics: AdminField[];
}

export interface AdminUserSummary {
  id: string;
  email: string | null;
  name: string | null;
  createdAt: string;
  lastActiveAt: string | null;
  authMethods: string[];
}

export interface AdminUserList {
  items: AdminUserSummary[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface AdminUserDetail {
  user: AdminUserSummary;
  sections: AdminSection[];
}
