// ============================================================================
//  LISTEN-STANDARD (Plan 3.1): jede Liste ist durchsuchbar, filterbar,
//  sortierbar und paginiert. Dieser Helfer parst die URL-Query einheitlich
//  und liefert Bausteine für Prisma (skip/take/orderBy).
// ============================================================================

export type SortDir = "asc" | "desc";

export interface ListParams {
  search: string;
  sort: string | null;
  dir: SortDir;
  page: number; // 1-basiert
  pageSize: number;
  filters: Record<string, string>;
}

export interface ListResult<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

type SearchParamsRecord = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function toPositiveInt(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function parseListParams(
  sp: SearchParamsRecord,
  options: { filterKeys?: string[]; defaultSort?: string; defaultDir?: SortDir; pageSize?: number } = {},
): ListParams {
  const { filterKeys = [], defaultSort = null, defaultDir = "asc", pageSize = 10 } = options;

  const filters: Record<string, string> = {};
  for (const key of filterKeys) {
    const v = first(sp[key]);
    if (v) filters[key] = v;
  }

  const dirRaw = first(sp.dir);
  return {
    search: (first(sp.q) ?? "").trim(),
    sort: first(sp.sort) ?? defaultSort,
    dir: dirRaw === "desc" ? "desc" : dirRaw === "asc" ? "asc" : defaultDir,
    page: toPositiveInt(first(sp.page), 1),
    pageSize: Math.min(toPositiveInt(first(sp.pageSize), pageSize), 100),
    filters,
  };
}

export function paginate(p: ListParams) {
  return { skip: (p.page - 1) * p.pageSize, take: p.pageSize };
}

export function computeTotalPages(total: number, pageSize: number) {
  return Math.max(1, Math.ceil(total / pageSize));
}

/**
 * Baut ein Prisma-orderBy aus ListParams. `allowed` mappt einen Sort-Key auf
 * einen Prisma-Pfad (z.B. "name" -> ["user","name"] für Relationen).
 */
export function buildOrderBy(
  p: ListParams,
  allowed: Record<string, string | string[]>,
  fallback: Record<string, SortDir>,
): Record<string, unknown> {
  if (!p.sort || !(p.sort in allowed)) return fallback;
  const path = allowed[p.sort];
  if (Array.isArray(path)) {
    return path.reverse().reduce<Record<string, unknown>>((acc, key, i) => {
      return i === 0 ? { [key]: p.dir } : { [key]: acc };
    }, {});
  }
  return { [path]: p.dir };
}
