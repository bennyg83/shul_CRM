import { z } from 'zod';
import type { Donation, Family, Member, Page, Pledge } from '@shulcrm/shared';
import { db } from './db.ts';

// ---------------------------------------------------------------------------
// Paged lists with search and sort, done in SQL so large shuls stay fast.
// Sort keys and filters are whitelisted per list; search words must each match
// one of the list's search columns (case-insensitive LIKE).
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

interface PageSpec {
  table: string;
  /** SQL expressions searched by `q`. */
  search: string[];
  /** Sort key -> SQL expression. */
  sort: Record<string, string>;
  defaultSort: string;
  /** Tie-breakers after the chosen sort, so pages are stable. */
  then: string;
  /** Filter name -> SQL condition with one `?`. */
  filters: Record<string, string>;
  /** Extra selected columns (computed). */
  extra?: string;
  /** Per-currency totals of `amount` over the whole filtered set. */
  totals?: boolean;
  /** Turn a raw row into the API's shape. */
  map(row: Row): unknown;
}

const familyName = (alias: string) => `(SELECT f.name FROM families f WHERE f.id = ${alias}.familyId)`;

const clean = (row: Row): Row => {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) out[k] = v === null ? undefined : v;
  return out;
};

const SPECS = {
  families: {
    table: 'families',
    search: ['name', 'hebrewName', 'city', 'email', 'phone', 'whatsapp', 'address'],
    sort: { name: 'name COLLATE NOCASE', city: 'city COLLATE NOCASE', status: 'status', created: 'createdAt' },
    defaultSort: 'name',
    then: 'name COLLATE NOCASE, id',
    filters: { status: 'status = ?' },
    map: (r) => clean(r) as Family,
  },
  members: {
    table: 'members',
    search: ['firstName', 'lastName', 'hebrewName', 'email', 'phone', familyName('members')],
    sort: {
      name: 'lastName COLLATE NOCASE, firstName COLLATE NOCASE',
      family: `${familyName('members')} COLLATE NOCASE`,
      birthDate: 'birthDate',
      status: 'status',
    },
    defaultSort: 'name',
    then: 'lastName COLLATE NOCASE, firstName COLLATE NOCASE, id',
    filters: { familyId: 'familyId = ?', status: 'status = ?', gender: 'gender = ?' },
    map: (r) => clean(r) as Member,
  },
  pledges: {
    table: 'pledges',
    search: ['fund', familyName('pledges')],
    sort: {
      year: 'year',
      family: `${familyName('pledges')} COLLATE NOCASE`,
      fund: 'fund COLLATE NOCASE',
      amount: 'amount',
      due: 'dueDate',
    },
    defaultSort: 'year',
    then: 'createdAt DESC, id',
    filters: { familyId: 'familyId = ?', year: 'year = ?', fund: 'fund = ?', currency: 'currency = ?' },
    extra: `, ${familyName('pledges')} AS familyName,
      COALESCE((SELECT SUM(d.amount) FROM donations d WHERE d.pledgeId = pledges.id), 0) AS paid`,
    totals: true,
    map: (r) => clean(r) as Pledge & { familyName: string; paid: number },
  },
  donations: {
    table: 'donations',
    search: ['fund', 'note', 'method', familyName('donations')],
    sort: {
      date: 'date',
      family: `${familyName('donations')} COLLATE NOCASE`,
      fund: 'fund COLLATE NOCASE',
      amount: 'amount',
      method: 'method',
    },
    defaultSort: 'date',
    then: 'createdAt DESC, id',
    filters: {
      familyId: 'familyId = ?',
      year: "substr(date, 1, 4) = ?",
      fund: 'fund = ?',
      method: 'method = ?',
      currency: 'currency = ?',
    },
    extra: `, ${familyName('donations')} AS familyName,
      (SELECT p.fund FROM pledges p WHERE p.id = donations.pledgeId) AS pledgeFund,
      (SELECT p.year FROM pledges p WHERE p.id = donations.pledgeId) AS pledgeYear`,
    totals: true,
    map: (r) => clean(r) as Donation & { familyName: string; pledgeFund?: string; pledgeYear?: number },
  },
} satisfies Record<string, PageSpec>;

export type PagedList = keyof typeof SPECS;
export const PAGED_LISTS = Object.keys(SPECS) as PagedList[];

const querySchema = z.object({
  q: z.string().max(200).optional(),
  sort: z.string().max(40).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/** One page of a list. Unknown sort keys fall back to the default; unknown filters are ignored. */
export function page(list: PagedList, query: Record<string, unknown>): Page<unknown> {
  const spec: PageSpec = SPECS[list];
  const { q, sort, order, limit, offset } = querySchema.parse(query);
  const where: string[] = [];
  const params: Array<string | number> = [];

  for (const word of (q ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 8)) {
    const like = `%${word.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    where.push(`(${spec.search.map((col) => `${col} LIKE ? ESCAPE '\\'`).join(' OR ')})`);
    params.push(...spec.search.map(() => like));
  }
  for (const [name, condition] of Object.entries(spec.filters)) {
    const value = query[name];
    if (typeof value === 'string' && value !== '') {
      where.push(condition);
      params.push(name === 'year' && list === 'pledges' ? Number(value) : value);
    }
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const sortKey = sort && sort in spec.sort ? sort : spec.defaultSort;
  // Dates and years read best newest first; names A→Z.
  const defaultDir = ['date', 'year', 'created', 'amount'].includes(sortKey) ? 'DESC' : 'ASC';
  const dir = order ? order.toUpperCase() : defaultDir;
  const orderSql = spec.sort[sortKey]
    .split(',')
    .map((part) => `${part.trim()} ${dir}`)
    .join(', ');

  const total = (db.prepare(`SELECT COUNT(*) AS n FROM ${spec.table} ${whereSql}`).get(...params) as { n: number }).n;
  const rows = db
    .prepare(`SELECT ${spec.table}.*${spec.extra ?? ''} FROM ${spec.table} ${whereSql} ORDER BY ${orderSql}, ${spec.then} LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as Row[];

  const result: Page<unknown> = { items: rows.map(spec.map), total, limit, offset };
  if (spec.totals) {
    const sums = db
      .prepare(`SELECT currency, SUM(amount) AS total FROM ${spec.table} ${whereSql} GROUP BY currency`)
      .all(...params) as Array<{ currency: string; total: number }>;
    result.totals = Object.fromEntries(sums.map((s) => [s.currency, s.total]));
  }
  return result;
}
