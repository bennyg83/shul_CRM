import type {
  DashboardStats,
  Donation,
  DonationInput,
  Family,
  FamilyDetail,
  FamilyInput,
  ImportantDate,
  ImportantDateInput,
  Member,
  MemberDetail,
  MemberInput,
  Note,
  NoteInput,
  Pledge,
  PledgeInput,
  UpcomingDate,
  Features,
  Page,
  PageQuery,
  EmailLogEntry,
  EmailSettings,
  EmailSettingsView,
  EmailTemplate,
  EventDetail,
  EventInput,
  EventSummary,
  ReceiptData,
  ReportKey,
  ReportTable,
  Rsvp,
  RsvpInput,
  SendEmailRequest,
  SendEmailResult,
  ShulEvent,
  StatementData,
  YahrzeitNotice,
  ImportEntity,
  ImportPreview,
  ImportRequest,
  ImportResult,
  LookupKind,
  Lookups,
  OrgProfile,
  Settings,
  Terms,
  AuditEntry,
  ClaimInput,
  StaffClaimInput,
  PortalAccount,
  PortalDateInput,
  PortalFamilyInput,
  PortalHome,
  PortalMemberInput,
  Sponsorship,
  SponsorshipClaim,
  SponsorshipInput,
  SponsorshipSummary,
  Role,
  Session,
  User,
  LoginOrganization,
  OrganizationSummary,
  CreateOrganizationInput,
} from '@shulcrm/shared';
import { API_BASE, apiFetch, apiUrl } from '@/config/api';

// ---------------------------------------------------------------------------
// API client — talks to @shulcrm/api over /api/* (Vite dev proxy -> :3000).
// Replaces the old localStorage mock; page call sites are unchanged.
// ---------------------------------------------------------------------------

const API = API_BASE;

/** Fired when the API answers 401 to a signed-in page (the session ended). */
export const SIGNED_OUT_EVENT = 'shulcrm:signed-out';

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly organizations?: LoginOrganization[];

  constructor(status: number, message: string, extra?: { code?: string; organizations?: LoginOrganization[] }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = extra?.code;
    this.organizations = extra?.organizations;
  }
}

interface ApiErrorBody {
  error?: { message?: string; code?: string; organizations?: LoginOrganization[] };
}

/** A PATCH body: fields set to `undefined` (cleared in a form) are sent as `null`, which the API
 * reads as "clear this field". JSON.stringify would otherwise drop them and the old value would stay. */
const patchBody = (input: object) =>
  JSON.stringify(input, (_key, value: unknown) => (value === undefined ? null : value));

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    const headers = new Headers(init?.headers);
    headers.set('content-type', 'application/json');
    res = await apiFetch(path, { ...init, headers });
  } catch (err) {
    throw new ApiError(0, err instanceof Error ? err.message : String(err));
  }

  if (!res.ok) {
    // Signed out (session expired, or disabled): let the app go back to the sign-in page.
    if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
    let message = `Request failed: ${res.status} ${res.statusText}`;
    let code: string | undefined;
    let organizations: LoginOrganization[] | undefined;
    try {
      const body = (await res.json()) as ApiErrorBody;
      if (body.error?.message) message = body.error.message;
      code = body.error?.code;
      organizations = body.error?.organizations;
    } catch {
      // non-JSON error body — keep the default message
    }
    throw new ApiError(res.status, message, { code, organizations });
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Families
// ---------------------------------------------------------------------------

export function listFamilies(): Promise<Family[]> {
  return request('/families');
}

export function getFamily(id: string): Promise<Family | undefined> {
  return request(`/families/${id}`);
}

export function createFamily(input: FamilyInput): Promise<Family> {
  return request('/families', { method: 'POST', body: JSON.stringify(input) });
}

export function updateFamily(id: string, input: Partial<FamilyInput>): Promise<Family> {
  return request(`/families/${id}`, { method: 'PATCH', body: patchBody(input) });
}

export function deleteFamily(id: string): Promise<void> {
  return request(`/families/${id}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

export function listMembers(): Promise<Member[]> {
  return request('/members');
}

export function getMember(id: string): Promise<Member | undefined> {
  return request(`/members/${id}`);
}

export function createMember(input: MemberInput): Promise<Member> {
  return request('/members', { method: 'POST', body: JSON.stringify(input) });
}

export function updateMember(id: string, input: Partial<MemberInput>): Promise<Member> {
  return request(`/members/${id}`, { method: 'PATCH', body: patchBody(input) });
}

export function deleteMember(id: string): Promise<void> {
  return request(`/members/${id}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Pledges
// ---------------------------------------------------------------------------

export function listPledges(): Promise<Pledge[]> {
  return request('/pledges');
}

export function createPledge(input: PledgeInput): Promise<Pledge> {
  return request('/pledges', { method: 'POST', body: JSON.stringify(input) });
}

export function updatePledge(id: string, input: Partial<PledgeInput>): Promise<Pledge> {
  return request(`/pledges/${id}`, { method: 'PATCH', body: patchBody(input) });
}

export function deletePledge(id: string): Promise<void> {
  return request(`/pledges/${id}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Donations
// ---------------------------------------------------------------------------

export function listDonations(): Promise<Donation[]> {
  return request('/donations');
}

export function createDonation(input: DonationInput): Promise<Donation> {
  return request('/donations', { method: 'POST', body: JSON.stringify(input) });
}

export function updateDonation(id: string, input: Partial<DonationInput>): Promise<Donation> {
  return request(`/donations/${id}`, { method: 'PATCH', body: patchBody(input) });
}

export function deleteDonation(id: string): Promise<void> {
  return request(`/donations/${id}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Important dates
// ---------------------------------------------------------------------------

export function listImportantDates(): Promise<ImportantDate[]> {
  return request('/important-dates');
}

export function listUpcomingDates(days = 90): Promise<UpcomingDate[]> {
  return request(`/important-dates/upcoming?days=${days}`);
}

/** Every occurrence of every important date between two ISO dates (inclusive), for the calendar. */
export function listDateOccurrences(from: string, to: string): Promise<UpcomingDate[]> {
  return request(`/important-dates/occurrences?from=${from}&to=${to}`);
}

export function createImportantDate(input: ImportantDateInput): Promise<ImportantDate> {
  return request('/important-dates', { method: 'POST', body: JSON.stringify(input) });
}

export function updateImportantDate(
  id: string,
  input: Partial<ImportantDateInput>,
): Promise<ImportantDate> {
  return request(`/important-dates/${id}`, { method: 'PATCH', body: patchBody(input) });
}

export function deleteImportantDate(id: string): Promise<void> {
  return request(`/important-dates/${id}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export function listNotes(): Promise<Note[]> {
  return request('/notes');
}

export function createNote(input: NoteInput): Promise<Note> {
  return request('/notes', { method: 'POST', body: JSON.stringify(input) });
}

export function updateNote(id: string, input: Partial<NoteInput>): Promise<Note> {
  return request(`/notes/${id}`, { method: 'PATCH', body: patchBody(input) });
}

export function deleteNote(id: string): Promise<void> {
  return request(`/notes/${id}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Composed detail views (one entity + its related records, for the modals)
// ---------------------------------------------------------------------------

export function getFamilyDetail(id: string): Promise<FamilyDetail> {
  return request(`/families/${id}/detail`);
}

export function getMemberDetail(id: string): Promise<MemberDetail> {
  return request(`/members/${id}/detail`);
}

// ---------------------------------------------------------------------------
// Dashboard stats + reset
// ---------------------------------------------------------------------------

export function getDashboardStats(): Promise<DashboardStats> {
  return request('/dashboard/stats');
}

export function resetData(): Promise<void> {
  return request('/reset', { method: 'POST', body: JSON.stringify({}) });
}

// ---------------------------------------------------------------------------
// Shul settings (org profile, features, terms, lists) and the logo
// ---------------------------------------------------------------------------

export function getSettings(): Promise<Settings> {
  return request('/settings');
}

export function saveOrgProfile(input: OrgProfile): Promise<OrgProfile> {
  return request('/settings/org', { method: 'PUT', body: JSON.stringify(input) });
}

export function saveFeatures(input: Features): Promise<Features> {
  return request('/settings/features', { method: 'PUT', body: JSON.stringify(input) });
}

export function saveTerms(input: Terms): Promise<Terms> {
  return request('/settings/terms', { method: 'PUT', body: JSON.stringify(input) });
}

export function saveLookup<K extends LookupKind>(kind: K, items: Lookups[K]): Promise<Lookups> {
  return request(`/settings/lookups/${kind}`, { method: 'PUT', body: JSON.stringify(items) });
}

/** How many records use each key of a list (keys in use can be retired, not deleted). */
export function getLookupUsage(kind: LookupKind): Promise<Record<string, number>> {
  return request(`/settings/lookups/${kind}/usage`);
}

/** Upload the shul's logo (PNG, JPEG or WebP, max 2 MB). */
export async function uploadLogo(file: File): Promise<Settings> {
  let res: Response;
  try {
    res = await apiFetch('/org/logo', {
      method: 'PUT',
      body: file,
      headers: { 'content-type': file.type || 'application/octet-stream' },
    });
  } catch (err) {
    throw new ApiError(0, err instanceof Error ? err.message : String(err));
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as ApiErrorBody;
    throw new ApiError(res.status, body.error?.message ?? `Upload failed: ${res.status}`);
  }
  return (await res.json()) as Settings;
}

export function removeLogo(): Promise<void> {
  return request('/org/logo', { method: 'DELETE' });
}

/** URL of the uploaded logo; the version busts the browser cache after a change. */
export const logoUrl = (version?: string, orgSlug?: string) => {
  const params = new URLSearchParams();
  if (orgSlug) params.set('org', orgSlug);
  if (version) params.set('v', version);
  const q = params.toString();
  return apiUrl(`/org/logo${q ? `?${q}` : ''}`);
};

// ---------------------------------------------------------------------------
// Import / export
// ---------------------------------------------------------------------------

/** Read an uploaded CSV or Excel file into a header row and data rows (server-side). */
export async function parseImportFile(
  file: File,
): Promise<{ headers: string[]; rows: string[][] }> {
  let res: Response;
  try {
    res = await apiFetch('/import/parse', {
      method: 'POST',
      body: file,
      headers: { 'content-type': 'application/octet-stream' },
    });
  } catch (err) {
    throw new ApiError(0, err instanceof Error ? err.message : String(err));
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as ApiErrorBody;
    throw new ApiError(res.status, body.error?.message ?? `Could not read the file: ${res.status}`);
  }
  return (await res.json()) as { headers: string[]; rows: string[][] };
}

export function previewImport(entity: ImportEntity, req: ImportRequest): Promise<ImportPreview> {
  return request(`/import/${entity}/preview`, { method: 'POST', body: JSON.stringify(req) });
}

export function commitImport(entity: ImportEntity, req: ImportRequest): Promise<ImportResult> {
  return request(`/import/${entity}/commit`, { method: 'POST', body: JSON.stringify(req) });
}

export const exportUrl = (entity: ImportEntity, format: 'csv' | 'xlsx') =>
  apiUrl(`/export/${entity}?format=${format}`);

// ---------------------------------------------------------------------------
// Events and RSVPs
// ---------------------------------------------------------------------------

export function listEventSummaries(from?: string, to?: string): Promise<EventSummary[]> {
  const q = new URLSearchParams();
  if (from) q.set('from', from);
  if (to) q.set('to', to);
  return request(`/events/summary${q.size ? `?${q}` : ''}`);
}

export function getEventDetail(id: string): Promise<EventDetail> {
  return request(`/events/${id}/detail`);
}

export function createEvent(input: EventInput): Promise<ShulEvent> {
  return request('/events', { method: 'POST', body: JSON.stringify(input) });
}

export function updateEvent(id: string, input: Partial<EventInput>): Promise<ShulEvent> {
  return request(`/events/${id}`, { method: 'PATCH', body: patchBody(input) });
}

export function deleteEvent(id: string): Promise<void> {
  return request(`/events/${id}`, { method: 'DELETE' });
}

export function saveRsvp(input: RsvpInput): Promise<Rsvp> {
  return request('/rsvps', { method: 'PUT', body: JSON.stringify(input) });
}

export function deleteRsvp(id: string): Promise<void> {
  return request(`/rsvps/${id}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Documents (printed from /print/*), email, reports
// ---------------------------------------------------------------------------

export const getReceipt = (donationId: string) =>
  request<ReceiptData>(`/documents/receipt/${donationId}`);
export const getStatement = (familyId: string, year: number) =>
  request<StatementData>(`/documents/statement/${familyId}?year=${year}`);
export const getStatements = (year: number) =>
  request<StatementData[]>(`/documents/statements?year=${year}`);
export const getYahrzeitNotices = (from: string, to: string) =>
  request<YahrzeitNotice[]>(`/documents/yahrzeits?from=${from}&to=${to}`);

export const getEmailSettings = () => request<EmailSettingsView>('/email/settings');
export const saveEmailSettings = (input: EmailSettings & { clearPassword?: boolean }) =>
  request<EmailSettingsView>('/email/settings', { method: 'PUT', body: JSON.stringify(input) });
export const getEmailTemplates = () => request<EmailTemplate[]>('/email/templates');
export const saveEmailTemplates = (templates: EmailTemplate[]) =>
  request<EmailTemplate[]>('/email/templates', { method: 'PUT', body: JSON.stringify(templates) });
export const sendEmails = (req: SendEmailRequest) =>
  request<SendEmailResult>('/email/send', { method: 'POST', body: JSON.stringify(req) });
export const sendTestEmail = (to: string) =>
  request<{ ok: true; testMode: boolean }>('/email/test', {
    method: 'POST',
    body: JSON.stringify({ to }),
  });
export const getEmailLog = () => request<EmailLogEntry[]>('/email/log');

export const getReport = (key: ReportKey, year: number) =>
  request<ReportTable>(`/reports/${key}?year=${year}`);
export const reportCsvUrl = (key: ReportKey, year: number) =>
  `${API}/reports/${key}?year=${year}&format=csv`;

// ---------------------------------------------------------------------------
// Paged lists (search, sort, filters, limit/offset), done by the API
// ---------------------------------------------------------------------------

export function getPage<T>(
  list: 'families' | 'members' | 'pledges' | 'donations',
  query: PageQuery,
): Promise<Page<T>> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query))
    if (v !== undefined && v !== '') params.set(k, String(v));
  return request(`/${list}/page?${params}`);
}

// ---------------------------------------------------------------------------
// Backups (whole-database snapshots)
// ---------------------------------------------------------------------------

export interface BackupInfo {
  name: string;
  size: number;
  createdAt: string;
}

export const listBackups = () => request<BackupInfo[]>('/backups');
export const createBackup = () => request<BackupInfo>('/backups', { method: 'POST', body: '{}' });
export const deleteBackup = (name: string) =>
  request<void>(`/backups/${encodeURIComponent(name)}`, { method: 'DELETE' });
export const backupDownloadUrl = (name: string) =>
  `${API}/backups/${encodeURIComponent(name)}/download`;

// ---------------------------------------------------------------------------
// Sign-in, users, audit log
// ---------------------------------------------------------------------------

/** The shul's name, colors and logo: all the sign-in page may know. */
export interface PublicBranding {
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string;
  locale: string;
  hasLogo: boolean;
  logoVersion?: string;
  slug?: string;
}

export const getPublicBranding = (orgSlug?: string) =>
  request<PublicBranding>(`/settings/public${orgSlug ? `?org=${encodeURIComponent(orgSlug)}` : ''}`);
export const getLoginTargets = (email: string) =>
  request<{ organizations: LoginOrganization[] }>(`/auth/login-targets?email=${encodeURIComponent(email)}`);
export const getSession = () => request<Session>('/auth/session');
export const login = (email: string, password: string, orgSlug?: string) =>
  request<Session>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, ...(orgSlug ? { orgSlug } : {}) }),
  });
export const logout = () => request<void>('/auth/logout', { method: 'POST', body: '{}' });
export const setupOwner = (input: { name: string; email: string; password: string; code?: string }) =>
  request<Session>('/auth/setup', { method: 'POST', body: JSON.stringify(input) });
export const describeLink = (token: string) =>
  request<{ name: string; email: string; purpose: 'invite' | 'reset' }>(`/auth/token/${encodeURIComponent(token)}`);
export const acceptLink = (token: string, password: string) =>
  request<Session>(`/auth/token/${encodeURIComponent(token)}`, { method: 'POST', body: JSON.stringify({ password }) });
export const changePassword = (currentPassword: string, newPassword: string) =>
  request<void>('/auth/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
export const getAuthMemberships = () =>
  request<{ organizations: LoginOrganization[]; currentSlug?: string }>('/auth/memberships');
export const switchOrganization = (orgSlug: string) =>
  request<{ user: User }>('/auth/switch-org', { method: 'POST', body: JSON.stringify({ orgSlug }) });

export const listUsers = () => request<User[]>('/users');
export const inviteUser = (input: { name: string; email: string; role: Role; memberId?: string }) =>
  request<{ user: User; link: string }>('/users', { method: 'POST', body: JSON.stringify(input) });
export const updateUser = (id: string, patch: { role?: Role; status?: 'active' | 'disabled'; name?: string }) =>
  request<User>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
export const newUserLink = (id: string) =>
  request<{ user: User; link: string; purpose: 'invite' | 'reset' }>(`/users/${id}/link`, { method: 'POST', body: '{}' });

export const listHostOrganizations = () => request<OrganizationSummary[]>('/host/organizations');
export const suggestOrganizationSlug = (name: string) =>
  request<{ slug: string }>(`/host/organizations/suggest-slug?name=${encodeURIComponent(name)}`);
export const createOrganization = (input: CreateOrganizationInput) =>
  request<OrganizationSummary>('/host/organizations', { method: 'POST', body: JSON.stringify(input) });

export const getAuditLog = (
  query: { entity?: string; entityId?: string; before?: string; limit?: number; source?: 'portal' } = {},
) => {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') params.set(k, String(v));
  return request<AuditEntry[]>(`/audit${params.size ? `?${params}` : ''}`);
};

// ---------------------------------------------------------------------------
// Sponsorships (the office side)
// ---------------------------------------------------------------------------

export const listSponsorships = (from?: string, to?: string) => {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  return request<SponsorshipSummary[]>(`/sponsorships/summary${params.size ? `?${params}` : ''}`);
};
export const createSponsorship = (input: SponsorshipInput) =>
  request<Sponsorship>('/sponsorships', { method: 'POST', body: JSON.stringify(input) });
export const updateSponsorship = (id: string, input: Partial<SponsorshipInput>) =>
  request<Sponsorship>(`/sponsorships/${id}`, { method: 'PATCH', body: patchBody(input) });
export const deleteSponsorship = (id: string) => request<void>(`/sponsorships/${id}`, { method: 'DELETE' });
/** Release a claim as the office (the portal has its own, family-scoped version). */
export const releaseClaim = (claimId: string) =>
  request<void>(`/sponsorships/claims/${claimId}`, { method: 'DELETE' });
/** Register a family on a sponsorship from the office (same rules as the member portal). */
export const registerSponsorshipClaim = (sponsorshipId: string, input: StaffClaimInput) =>
  request<SponsorshipClaim>(`/sponsorships/${sponsorshipId}/claims`, {
    method: 'POST',
    body: JSON.stringify(input),
  });

/** Put back one change a family made about itself. */
export const undoChange = (auditId: string) =>
  request<{ action: string; entity: string }>(`/audit/${auditId}/undo`, { method: 'POST', body: '{}' });

// ---------------------------------------------------------------------------
// The member portal. The API works out which family from the signed-in user,
// so none of these takes a family id.
// ---------------------------------------------------------------------------

export const getPortalHome = () => request<PortalHome>('/portal/home');
export const savePortalFamily = (input: PortalFamilyInput) =>
  request<Family>('/portal/family', { method: 'PATCH', body: patchBody(input) });
export const addPortalMember = (input: PortalMemberInput) =>
  request<Member>('/portal/members', { method: 'POST', body: JSON.stringify(input) });
export const savePortalMember = (id: string, input: Partial<PortalMemberInput>) =>
  request<Member>(`/portal/members/${id}`, { method: 'PATCH', body: patchBody(input) });
export const addPortalDate = (input: PortalDateInput) =>
  request<ImportantDate>('/portal/dates', { method: 'POST', body: JSON.stringify(input) });
export const savePortalDate = (id: string, input: PortalDateInput) =>
  request<ImportantDate>(`/portal/dates/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
export const deletePortalDate = (id: string) => request<void>(`/portal/dates/${id}`, { method: 'DELETE' });
export const getPortalAccount = () => request<PortalAccount>('/portal/account');
export const listPortalSponsorships = (from?: string, to?: string) => {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  return request<SponsorshipSummary[]>(`/portal/sponsorships${params.size ? `?${params}` : ''}`);
};
export const claimSponsorship = (id: string, input: ClaimInput) =>
  request<SponsorshipClaim>(`/portal/sponsorships/${id}/claim`, { method: 'POST', body: JSON.stringify(input) });
export const releaseMyClaim = (claimId: string) => request<void>(`/portal/claims/${claimId}`, { method: 'DELETE' });
