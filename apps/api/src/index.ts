import { app, prepareData } from './app.ts';
import { scheduleBackups } from './backups.ts';
import { log } from './log.ts';

// ---------------------------------------------------------------------------
// Shul CRM API server. The app itself is built in app.ts (so tests can load it
// without opening a port); this file prepares the data and starts listening.
// Dev: `npm run dev:api` from the repo root (node --watch, port 3000).
// ---------------------------------------------------------------------------

await prepareData();
scheduleBackups((msg) => log.info({ area: 'backup' }, msg));

const PORT = Number(process.env.PORT ?? 3000);
// There is no login yet (ROADMAP Phase 5), so only this machine may connect.
// Set HOST=0.0.0.0 to expose it on the network once auth exists.
const HOST = process.env.HOST ?? '127.0.0.1';
app.listen(PORT, HOST, () => {
  log.info(`listening on http://${HOST}:${PORT}`);
});
