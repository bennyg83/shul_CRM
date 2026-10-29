import { rewriteQuery } from './sql-dialect.ts';
import type { SqlDatabase, SqlExecutor, SqlStatement } from './types.ts';

function normalizeParams(params: unknown[]): unknown[] {
  return params.map((p) => (p === undefined ? null : p));
}

export class PostgresDatabase implements SqlDatabase {
  private readonly backend: SqlExecutor;

  constructor(backend: SqlExecutor) {
    this.backend = backend;
  }

  async exec(sql: string): Promise<void> {
    for (const statement of sql
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)) {
      const q = rewriteQuery(statement);
      if (this.backend.exec) await this.backend.exec(q);
      else await this.backend.query(q);
    }
  }

  prepare(sql: string): SqlStatement {
    const rewritten = rewriteQuery(sql);
    return {
      get: async (...params: unknown[]) => {
        const { rows } = await this.backend.query(rewritten, normalizeParams(params));
        return rows[0];
      },
      all: async (...params: unknown[]) => {
        const { rows } = await this.backend.query(rewritten, normalizeParams(params));
        return rows;
      },
      run: async (...params: unknown[]) => {
        const { rowCount } = await this.backend.query(rewritten, normalizeParams(params));
        return { changes: rowCount };
      },
    };
  }

  async close(): Promise<void> {
    if (this.backend.close) await this.backend.close();
    if (this.backend.end) await this.backend.end();
  }
}

export async function connectPostgres(connectionString: string): Promise<SqlDatabase> {
  let backend: SqlExecutor;
  if (connectionString.startsWith('pglite:')) {
    const { PGlite } = await import('@electric-sql/pglite');
    const dataDir = connectionString === 'pglite://memory' ? undefined : connectionString.replace(/^pglite:\/\//, '');
    const client = new PGlite(dataDir);
    backend = {
      query: async (sql, params) => {
        const result = await client.query(sql, params ?? []);
        const rowCount = 'affectedRows' in result ? (result.affectedRows as number) : (result.rowCount ?? 0);
        return { rows: result.rows as Record<string, unknown>[], rowCount };
      },
      exec: async (sql) => {
        await client.exec(sql);
      },
      close: async () => {
        await client.close();
      },
    };
  } else {
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString });
    backend = {
      query: async (sql, params) => {
        const result = await pool.query(sql, params ?? []);
        return { rows: result.rows as Record<string, unknown>[], rowCount: result.rowCount ?? 0 };
      },
      end: async () => {
        await pool.end();
      },
    };
  }
  return new PostgresDatabase(backend);
}
