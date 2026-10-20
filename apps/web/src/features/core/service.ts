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
} from '@pilzno/shared';

// ---------------------------------------------------------------------------
// API client — talks to @pilzno/api over /api/* (Vite dev proxy -> :3000).
// Replaces the old localStorage mock; page call sites are unchanged.
// ---------------------------------------------------------------------------

const API = '/api';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface ApiErrorBody {
  error?: { message?: string };
}

/** A PATCH body: fields set to `undefined` (cleared in a form) are sent as `null`, which the API
 * reads as "clear this field". JSON.stringify would otherwise drop them and the old value would stay. */
const patchBody = (input: object) => JSON.stringify(input, (_key, value: unknown) => (value === undefined ? null : value));

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    const headers = new Headers(init?.headers);
    headers.set('content-type', 'application/json');
    res = await fetch(`${API}${path}`, { ...init, headers });
  } catch (err) {
    throw new ApiError(0, err instanceof Error ? err.message : String(err));
  }

  if (!res.ok) {
    let message = `Request failed: ${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as ApiErrorBody;
      if (body.error?.message) message = body.error.message;
    } catch {
      // non-JSON error body — keep the default message
    }
    throw new ApiError(res.status, message);
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

/** Total amount paid toward a specific pledge (sum of donations linked by pledgeId). */
export function paidForPledge(donations: readonly Donation[], pledgeId: string): number {
  return donations
    .filter((d) => d.pledgeId === pledgeId)
    .reduce((sum, d) => sum + d.amount, 0);
}
