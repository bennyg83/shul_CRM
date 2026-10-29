// ---------------------------------------------------------------------------
// Async SQL API backed by PostgreSQL (pg or PGlite).
// ---------------------------------------------------------------------------

export interface SqlStatement {
  get(...params: unknown[]): Promise<Record<string, unknown> | undefined>;
  all(...params: unknown[]): Promise<Record<string, unknown>[]>;
  run(...params: unknown[]): Promise<{ changes: number }>;
}

export interface SqlDatabase {
  exec(sql: string): Promise<void>;
  prepare(sql: string): SqlStatement;
  close(): Promise<void>;
}

export interface SqlExecutor {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number }>;
  exec?(sql: string): Promise<void>;
  close?(): Promise<void>;
  end?(): Promise<void>;
}
