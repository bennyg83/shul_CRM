import { initDatabase } from './db.ts';
import { scheduleBackups } from './backups.ts';
import { log } from './log.ts';

// ---------------------------------------------------------------------------
// Shul CRM API server. The app itself is built in app.ts (so tests can load it
// without opening a port); this file prepares the data and starts listening.
// Dev: `npm run dev:api` from the repo root (node --watch, port 3000).
// ---------------------------------------------------------------------------

await initDatabase();
const { app, prepareData } = await import('./app.ts');
await prepareData();
scheduleBackups((msg) => log.info({ area: 'backup' }, msg));

const PORT = Number(process.env.PORT ?? 3000);
// Only this machine may connect unless you say otherwise. Set HOST=0.0.0.0 to serve the
// network or a container; put HTTPS in front of it before it goes on the internet.
const HOST = process.env.HOST ?? '127.0.0.1';
app.listen(PORT, HOST, () => {
  log.info(`listening on http://${HOST}:${PORT}`);
});
