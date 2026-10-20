import pino from 'pino';

// ---------------------------------------------------------------------------
// Logging: JSON lines on stdout (pino). No personal data: requests are logged
// by route pattern ("/api/families/:id"), status and time, never with bodies,
// query strings, names or email addresses. Silent under tests.
// LOG_LEVEL=debug|info|warn|error (default info).
// ---------------------------------------------------------------------------

export const log = pino({
  level: process.env.LOG_LEVEL ?? (process.env.VITEST ? 'silent' : 'info'),
  base: undefined, // no pid/hostname on every line
  timestamp: pino.stdTimeFunctions.isoTime,
  // Belt and braces, in case a caller ever passes one of these along.
  redact: { paths: ['req.body', 'body', 'password', '*.password', 'email', '*.email', 'to', 'query'], censor: '[redacted]' },
});
