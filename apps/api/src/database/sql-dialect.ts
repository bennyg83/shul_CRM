// ---------------------------------------------------------------------------
// PostgreSQL quoting and SQLite-compat fragments (COLLATE NOCASE → lower()).
// ---------------------------------------------------------------------------

const CAMEL = /[A-Z]/;

export function quoteIdent(name: string): string {
  if (!CAMEL.test(name)) return name;
  return `"${name.replace(/"/g, '""')}"`;
}

/** ORDER BY fragment: case-insensitive sort for text columns. */
export function orderNocase(column: string, tablePrefix?: string): string {
  const col = tablePrefix ? `${quoteIdent(tablePrefix)}.${quoteIdent(column)}` : quoteIdent(column);
  return `lower(${col})`;
}

/** Expand a sort spec like `name COLLATE NOCASE` or `lastName COLLATE NOCASE, firstName COLLATE NOCASE`. */
export function rewriteSortClause(clause: string): string {
  return clause
    .split(',')
    .map((part) => {
      const trimmed = part.trim();
      const m = trimmed.match(/^([a-zA-Z_.]+)\s+COLLATE\s+NOCASE$/i);
      if (m) {
        const expr = m[1];
        if (expr.includes('.')) {
          const [table, col] = expr.split('.');
          return orderNocase(col, table);
        }
        return orderNocase(expr);
      }
      return trimmed.replace(/\b([a-z]+[A-Z][a-zA-Z]*)\b/g, (id) => quoteIdent(id));
    })
    .join(', ');
}

/** Case-insensitive email/slug lookups (WHERE only on UPDATE — not SET assignments). */
function rewriteCaseInsensitiveCompares(sql: string): string {
  const apply = (fragment: string): string => {
    let s = fragment;
    if (/(?<![a-z0-9_])email\s*=\s*\?/i.test(s) && !/lower\s*\(\s*\w*\.?\s*email/i.test(s)) {
      s = s.replace(/(\b[\w]+\.)?email\s*=\s*\?/gi, (_, prefix) => `lower(${prefix ?? ''}email) = lower(?)`);
    }
    if (/(?<![a-z0-9_])slug\s*=\s*\?/i.test(s) && !/lower\s*\(\s*\w*\.?\s*slug/i.test(s)) {
      s = s.replace(/(\b[\w]+\.)?slug\s*=\s*\?/gi, (_, prefix) => `lower(${prefix ?? ''}slug) = lower(?)`);
    }
    return s;
  };
  if (/\bUPDATE\b/i.test(sql) && /\bWHERE\b/i.test(sql)) {
    const m = sql.match(/^([\s\S]*?\bWHERE\b)([\s\S]*)$/i);
    if (m) return m[1] + apply(m[2]);
  }
  return apply(sql);
}

/** `?` placeholders → `$1`, `$2`, … */
export function toPgPlaceholders(sql: string): string {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

function quoteCamelOutsideLiterals(sql: string): string {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === "'") {
      out += ch;
      i++;
      while (i < sql.length) {
        out += sql[i];
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            out += sql[i + 1];
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (ch === '"') {
      out += ch;
      i++;
      while (i < sql.length) {
        out += sql[i];
        if (sql[i] === '"') {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    const next = sql.slice(i).search(/['"]/);
    const segment = next === -1 ? sql.slice(i) : sql.slice(i, i + next);
    out += segment.replace(/\b([a-z]+[A-Z][a-zA-Z]*)\b/g, (match) => quoteIdent(match));
    i += segment.length;
  }
  return out;
}

/** Quote camelCase identifiers in static SQL (table/column names). */
export function quoteSql(sql: string): string {
  let out = quoteCamelOutsideLiterals(sql);
  out = out.replace(/COLLATE\s+NOCASE/gi, '');
  out = out.replace(/=\s*\?\s*COLLATE\s+NOCASE/gi, '= ?');
  return out;
}

export function rewriteQuery(sql: string): string {
  let s = sql;
  s = s.replace(/\?\s+COLLATE\s+NOCASE/gi, '?');
  s = s.replace(/=\s*([a-zA-Z_.]+)\s+COLLATE\s+NOCASE/gi, (_, col: string) => {
    if (col.includes('.')) {
      const [t, c] = col.split('.');
      return `= lower(${quoteIdent(t)}.${quoteIdent(c)})`;
    }
    return `= lower(${quoteIdent(col)})`;
  });
  s = s.replace(/\bWHERE\s+([a-zA-Z_.]+)\s+COLLATE\s+NOCASE/gi, 'WHERE $1');
  if (/COLLATE\s+NOCASE/i.test(s)) {
    s = rewriteSortClause(s);
  }
  s = quoteSql(s);
  s = rewriteCaseInsensitiveCompares(s);
  s = s.replace(/\bexcluded\./gi, 'EXCLUDED.');
  return toPgPlaceholders(s);
}
