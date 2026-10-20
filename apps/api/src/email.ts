import nodemailer from 'nodemailer';
import {
  DEFAULT_EMAIL_SETTINGS,
  DEFAULT_EMAIL_TEMPLATES,
  emailSettingsSchema,
  emailTemplatesSchema,
  formatMoneyWith,
  newId,
  sendEmailSchema,
  type EmailLogEntry,
  type EmailSettings,
  type EmailSettingsView,
  type EmailTemplate,
  type Family,
  type RenderedEmail,
  type SendEmailResult,
} from '@shulcrm/shared';
import { db } from './db.ts';
import { NotFound, families, members } from './repo.ts';
import { BadRequest, getLogo, getLookups, getOrg } from './settings.ts';
import { familyGreeting, receipt, statement, yahrzeitNotices } from './documents.ts';
import { events } from './events.ts';

// ---------------------------------------------------------------------------
// Email: SMTP settings, templates with {{variables}}, rendering to text + HTML,
// and sending through nodemailer. In test mode nothing leaves the machine:
// messages are rendered by nodemailer's JSON transport and logged as "test".
// ---------------------------------------------------------------------------

function readSetting<T>(key: string, fallback: T, parse: (v: unknown) => T): T {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  if (!row) return fallback;
  try {
    return parse(JSON.parse(row.value));
  } catch {
    return fallback;
  }
}

function writeSetting(key: string, value: unknown): void {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    JSON.stringify(value),
  );
}

const getEmailSettings = (): EmailSettings => readSetting('email', DEFAULT_EMAIL_SETTINGS, (v) => emailSettingsSchema.parse(v));

export function emailSettingsView(): EmailSettingsView {
  const { password, ...rest } = getEmailSettings();
  return { ...rest, hasPassword: Boolean(password) };
}

/** Save SMTP settings. A missing or empty password keeps the saved one; `clearPassword` removes it. */
export function saveEmailSettings(input: unknown): EmailSettingsView {
  const body = (input ?? {}) as Record<string, unknown>;
  const parsed = emailSettingsSchema.parse({ ...body, password: body.password || undefined });
  const current = getEmailSettings();
  const password = body.clearPassword ? undefined : (parsed.password ?? current.password);
  writeSetting('email', { ...parsed, password });
  return emailSettingsView();
}

export function getTemplates(): EmailTemplate[] {
  const saved = readSetting<EmailTemplate[]>('emailTemplates', [], (v) => emailTemplatesSchema.parse(v));
  // Built-in templates that were never saved (or were added in a newer version) still show.
  const keys = new Set(saved.map((t) => t.key));
  return [...saved, ...DEFAULT_EMAIL_TEMPLATES.filter((t) => !keys.has(t.key))];
}

export function saveTemplates(input: unknown): EmailTemplate[] {
  const templates = emailTemplatesSchema.parse(input);
  writeSetting('emailTemplates', templates);
  return getTemplates();
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** A variable's value: text, and optionally ready-made HTML (for tables). */
type Value = { text: string; html?: string };
type Vars = Record<string, Value>;
const v = (text: string | number | undefined): Value => ({ text: text === undefined ? '' : String(text) });

const VAR = /\{\{\s*([a-zA-Z.]+)\s*\}\}/g;

/** Text and HTML versions of a template. Unknown variables stay visible so they get noticed. */
export function renderTemplate(subject: string, body: string, vars: Vars): { subject: string; text: string; html: string } {
  const text = (s: string) => s.replace(VAR, (m, name: string) => vars[name]?.text ?? m);
  const paragraphs = body.replace(/\r\n/g, '\n').split(/\n\s*\n/);
  const html = paragraphs
    .map((p) => {
      const only = /^\s*\{\{\s*([a-zA-Z.]+)\s*\}\}\s*$/.exec(p);
      if (only && vars[only[1]]?.html) return vars[only[1]].html;
      const parts: string[] = [];
      let last = 0;
      for (const m of p.matchAll(VAR)) {
        parts.push(escapeHtml(p.slice(last, m.index)));
        const value = vars[m[1]];
        parts.push(value ? (value.html ?? escapeHtml(value.text)) : escapeHtml(m[0]));
        last = (m.index ?? 0) + m[0].length;
      }
      parts.push(escapeHtml(p.slice(last)));
      return `<p style="margin:0 0 14px">${parts.join('').replace(/\n/g, '<br>')}</p>`;
    })
    .join('\n');
  return { subject: text(subject).replace(/\s+/g, ' ').trim(), text: text(body), html };
}

function layout(inner: string, hasLogo: boolean): string {
  const org = getOrg();
  const footer = [org.name, org.address, [org.city, org.country].filter(Boolean).join(', '), org.phone, org.email]
    .filter(Boolean)
    .map((s) => escapeHtml(String(s)))
    .join(' · ');
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f6f6;font-family:Arial,Helvetica,sans-serif;color:#222;line-height:1.5">
<div style="max-width:640px;margin:0 auto;background:#fff;border-radius:8px;padding:28px;border-top:4px solid ${org.primaryColor}">
${hasLogo ? `<img src="cid:logo" alt="${escapeHtml(org.shortName)}" style="height:56px;margin-bottom:12px">` : `<div style="font-size:20px;font-weight:bold;color:${org.primaryColor};margin-bottom:12px">${escapeHtml(org.name)}</div>`}
${inner}
<div style="margin-top:24px;padding-top:12px;border-top:1px solid #eee;font-size:12px;color:#777">${footer}</div>
</div></body></html>`;
}

const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(getOrg().locale, { dateStyle: 'long', timeZone: 'UTC' });

function table(head: string[], rows: string[][]): Value {
  const text = [head.join(' | '), ...rows.map((r) => r.join(' | '))].join('\n');
  const cell = (c: string, th = false) =>
    `<${th ? 'th' : 'td'} style="text-align:left;padding:6px 8px;border-bottom:1px solid #eee">${escapeHtml(c)}</${th ? 'th' : 'td'}>`;
  const html = `<table style="border-collapse:collapse;width:100%;margin:0 0 14px;font-size:14px"><tr>${head
    .map((h) => cell(h, true))
    .join('')}</tr>${rows.map((r) => `<tr>${r.map((c) => cell(c)).join('')}</tr>`).join('')}</table>`;
  return { text, html };
}

interface Recipient {
  familyId: string;
  donationId?: string;
  importantDateId?: string;
  occurrence?: string;
  eventId?: string;
  year?: number;
}

function familyEmail(family: Family): string | undefined {
  if (family.email) return family.email;
  const heads = members
    .list()
    .filter((m) => m.familyId === family.id && m.status === 'active' && m.email)
    .sort((a, b) => Number(b.role === 'husband' || b.role === 'wife') - Number(a.role === 'husband' || a.role === 'wife'));
  return heads[0]?.email;
}

function variablesFor(r: Recipient): { vars: Vars; family: Family } {
  const family = families.get(r.familyId);
  if (!family) throw new NotFound(`families ${r.familyId} not found`);
  const org = getOrg();
  const money = (n: number, c: string) => formatMoneyWith(getLookups().currencies, n, c);
  const familyMembers = members.list().filter((m) => m.familyId === family.id);
  const vars: Vars = {
    'org.name': v(org.name),
    'org.address': v([org.address, org.city, org.country].filter(Boolean).join(', ')),
    'org.phone': v(org.phone),
    'org.email': v(org.email),
    'family.name': v(family.name),
    'family.greeting': v(familyGreeting(family, familyMembers)),
    today: v(longDate(new Date().toISOString().slice(0, 10))),
  };
  if (r.donationId) {
    const d = receipt(r.donationId);
    if (d.family.id !== family.id) throw new BadRequest('That donation belongs to another family');
    Object.assign(vars, {
      'donation.amount': v(money(d.donation.amount, d.donation.currency)),
      'donation.date': v(longDate(d.donation.date)),
      'donation.fund': v(d.fundLabel),
      'donation.method': v(d.methodLabel),
      'donation.receipt': table(
        ['Receipt', 'Date', 'Fund', 'Method', 'Amount'],
        [[d.receiptNumber, longDate(d.donation.date), d.fundLabel, d.methodLabel, money(d.donation.amount, d.donation.currency)]],
      ),
    });
    if (org.taxId || org.receiptFooter) {
      const extra = [org.taxId ? `Tax / charity number: ${org.taxId}` : '', org.receiptFooter ?? ''].filter(Boolean).join('\n');
      vars['donation.receipt'] = {
        text: `${vars['donation.receipt'].text}\n${extra}`,
        html: `${vars['donation.receipt'].html}<p style="font-size:12px;color:#555">${escapeHtml(extra).replace(/\n/g, '<br>')}</p>`,
      };
    }
  }
  if (r.year !== undefined) {
    const s = statement(family.id, r.year);
    const total = Object.entries(s.totals).map(([c, n]) => money(n, c)).join(' + ') || money(0, org.defaultCurrency);
    Object.assign(vars, {
      'statement.year': v(r.year),
      'statement.total': v(total),
      'statement.table': table(
        ['Receipt', 'Date', 'Fund', 'Amount'],
        s.donations.map((d) => [d.receiptNumber, longDate(d.date), d.fundLabel, money(d.amount, d.currency)]),
      ),
    });
  }
  if (r.importantDateId && r.occurrence) {
    const notice = yahrzeitNotices(r.occurrence, r.occurrence).find((n) => n.date.id === r.importantDateId);
    if (!notice) throw new BadRequest('No yahrzeit for that date on that day');
    Object.assign(vars, {
      'yahrzeit.name': v(notice.name),
      'yahrzeit.hebrewName': v(notice.hebrewName ?? notice.name),
      'yahrzeit.relationship': v(notice.relationship?.toLowerCase() ?? 'loved one'),
      'yahrzeit.member': v(`${notice.member.firstName} ${notice.member.lastName}`),
      'yahrzeit.date': v(longDate(notice.occurrence.nextOccurrence)),
      'yahrzeit.hebrewDate': v(notice.hebrewDate),
      'yahrzeit.evening': v(longDate(notice.evening)),
    });
  }
  if (r.eventId) {
    const e = events.get(r.eventId);
    if (!e) throw new NotFound(`events ${r.eventId} not found`);
    Object.assign(vars, {
      'event.title': v(e.title),
      'event.date': v(longDate(e.date)),
      'event.time': v(e.startTime ? ` at ${e.startTime}${e.endTime ? `–${e.endTime}` : ''}` : ''),
      'event.location': v(e.location ?? org.name),
    });
  }
  return { vars, family };
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

function transport(settings: EmailSettings) {
  if (settings.testMode) return nodemailer.createTransport({ jsonTransport: true });
  if (!settings.host) throw new BadRequest('Set up the mail server in Settings → Email first (or turn on test mode)');
  return nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: settings.user ? { user: settings.user, pass: settings.password ?? '' } : undefined,
  });
}

function fromHeader(settings: EmailSettings): string {
  const org = getOrg();
  const address = settings.fromAddress || org.email;
  if (!address) throw new BadRequest('Set a "From" address in Settings → Email (or an email on the organization)');
  return `"${(settings.fromName || org.name).replace(/"/g, '')}" <${address}>`;
}

function log(entry: Omit<EmailLogEntry, 'id' | 'sentAt' | 'familyName'>): void {
  db.prepare(
    `INSERT INTO emailLog (id, toAddress, subject, template, familyId, status, error, testMode, sentAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    newId(),
    entry.toAddress,
    entry.subject,
    entry.template ?? null,
    entry.familyId ?? null,
    entry.status,
    entry.error ?? null,
    entry.testMode ? 1 : 0,
    new Date().toISOString(),
  );
}

export async function sendEmails(input: unknown): Promise<SendEmailResult> {
  const req = sendEmailSchema.parse(input);
  const template = getTemplates().find((t) => t.key === req.template);
  if (!template) throw new BadRequest(`No email template "${req.template}"`);
  const settings = getEmailSettings();
  const logo = getLogo();

  const messages: RenderedEmail[] = req.recipients.map((r) => {
    const { vars, family } = variablesFor(r);
    const out = renderTemplate(req.subject ?? template.subject, req.body ?? template.body, vars);
    const to = familyEmail(family);
    return { familyId: family.id, familyName: family.name, to, subject: out.subject, text: out.text, html: layout(out.html, Boolean(logo)), problem: to ? undefined : 'No email address' };
  });
  if (req.dryRun) return { messages, sent: 0, failed: 0, skipped: messages.filter((m) => m.problem).length, testMode: settings.testMode };

  const mailer = transport(settings);
  const from = fromHeader(settings);
  let sent = 0;
  let failed = 0;
  for (const m of messages) {
    if (!m.to) continue;
    try {
      await mailer.sendMail({
        from,
        to: m.to,
        replyTo: settings.replyTo || undefined,
        subject: m.subject,
        text: m.text,
        html: m.html,
        attachments: logo ? [{ filename: 'logo', content: Buffer.from(logo.data), contentType: logo.contentType, cid: 'logo' }] : [],
      });
      sent++;
      log({ toAddress: m.to, subject: m.subject, template: template.key, familyId: m.familyId, status: settings.testMode ? 'test' : 'sent', testMode: settings.testMode });
    } catch (err) {
      failed++;
      const error = err instanceof Error ? err.message : String(err);
      m.problem = error;
      log({ toAddress: m.to, subject: m.subject, template: template.key, familyId: m.familyId, status: 'failed', error, testMode: settings.testMode });
    }
  }
  return { messages, sent, failed, skipped: messages.filter((m) => !m.to).length, testMode: settings.testMode };
}

/** One test message to check the mail settings. */
export async function sendTestEmail(to: unknown): Promise<{ ok: true; testMode: boolean }> {
  if (typeof to !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) throw new BadRequest('Enter the address to send the test to');
  const settings = getEmailSettings();
  const org = getOrg();
  const subject = `Test message from ${org.name}`;
  try {
    await transport(settings).sendMail({
      from: fromHeader(settings),
      to,
      subject,
      text: 'If you can read this, the mail settings work.',
      html: layout('<p>If you can read this, the mail settings work.</p>', false),
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log({ toAddress: to, subject, status: 'failed', error, testMode: settings.testMode });
    throw new BadRequest(`The mail server said: ${error}`);
  }
  log({ toAddress: to, subject, status: settings.testMode ? 'test' : 'sent', testMode: settings.testMode });
  return { ok: true, testMode: settings.testMode };
}

export function emailLog(limit = 200): EmailLogEntry[] {
  const names = new Map(families.list().map((f) => [f.id, f.name]));
  const rows = db.prepare('SELECT * FROM emailLog ORDER BY sentAt DESC LIMIT ?').all(limit) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    toAddress: String(r.toAddress),
    subject: String(r.subject),
    template: (r.template as string | null) ?? undefined,
    familyId: (r.familyId as string | null) ?? undefined,
    familyName: r.familyId ? names.get(String(r.familyId)) : undefined,
    status: r.status as EmailLogEntry['status'],
    error: (r.error as string | null) ?? undefined,
    testMode: Boolean(r.testMode),
    sentAt: String(r.sentAt),
  }));
}
