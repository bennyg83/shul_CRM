import { parentPort, workerData, type MessagePort } from 'node:worker_threads';

// ---------------------------------------------------------------------------
// Runs PostgreSQL (pg Pool or PGlite) off the main thread.
// ---------------------------------------------------------------------------

type QueryReq = { id: number; op: 'exec' | 'query'; sql: string; params?: unknown[] };
type CloseReq = { id: number; op: 'close' };
type SetupMsg = { setup: true; port: MessagePort };
type Req = QueryReq | CloseReq;

interface Queryable {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
  exec?(sql: string): Promise<void>;
  close?(): Promise<void>;
  end?(): Promise<void>;
}

async function connect(url: string): Promise<Queryable> {
  if (url.startsWith('pglite:')) {
    const { PGlite } = await import('@electric-sql/pglite');
    const dataDir = url === 'pglite://memory' ? undefined : url.replace(/^pglite:\/\//, '');
    const client = new PGlite(dataDir);
    return {
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
  }
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: url });
  return {
    query: async (sql, params) => {
      const result = await pool.query(sql, params ?? []);
      return { rows: result.rows as Record<string, unknown>[], rowCount: result.rowCount };
    },
    exec: async (sql) => {
      await pool.query(sql);
    },
    end: async () => {
      await pool.end();
    },
  };
}

const url = workerData.connectionString as string;
const dbPromise = connect(url);
let db: Queryable;
let replyPort: MessagePort | null = null;

async function handle(req: Req): Promise<void> {
  if (req.op === 'close') {
    if (db.close) await db.close();
    if (db.end) await db.end();
    replyPort!.postMessage({ id: req.id, ok: true });
    process.exit(0);
    return;
  }
  if (req.op === 'exec') {
    if (db.exec) await db.exec(req.sql);
    else await db.query(req.sql);
    replyPort!.postMessage({ id: req.id, ok: true, rowCount: 0 });
    return;
  }
  const { rows, rowCount } = await db.query(req.sql, req.params ?? []);
  replyPort!.postMessage({ id: req.id, ok: true, rows, rowCount: rowCount ?? 0 });
}

function attachPort(port: MessagePort): void {
  replyPort = port;
  void (async () => {
    try {
      db = await dbPromise;
      replyPort!.on('message', (req: Req) => {
        void handle(req).catch((err) => {
          replyPort!.postMessage({
            id: req.id,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      });
      replyPort!.postMessage({ id: 0, ready: true });
    } catch (err) {
      replyPort!.postMessage({
        id: 0,
        ready: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  })();
}

parentPort?.on('message', (msg: Req | SetupMsg) => {
  if (msg && typeof msg === 'object' && 'setup' in msg) {
    attachPort(msg.port);
  }
});
