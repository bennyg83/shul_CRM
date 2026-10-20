import type { QueryClient } from '@tanstack/react-query';

/** Canonical React Query keys (must match the literal keys used by the pages). */
export const qk = {
  families: ['families'] as const,
  members: ['members'] as const,
  pledges: ['pledges'] as const,
  donations: ['donations'] as const,
  dates: ['important-dates'] as const,
  notes: ['notes'] as const,
  familyDetail: (id: string) => ['familyDetail', id] as const,
  memberDetail: (id: string) => ['memberDetail', id] as const,
  dashboard: ['dashboard-stats'] as const,
  settings: ['settings'] as const,
  upcoming: (days: number) => ['upcoming-dates', days] as const,
  occurrences: (from: string, to: string) => ['upcoming-dates', 'range', from, to] as const,
};

/**
 * Invalidate the detail queries and every top-level entity list after a mutation,
 * so the family/member modals and the pages all refetch consistent data.
 */
export function invalidateRelated(queryClient: QueryClient, familyId?: string, memberId?: string): void {
  if (familyId) void queryClient.invalidateQueries({ queryKey: qk.familyDetail(familyId) });
  if (memberId) void queryClient.invalidateQueries({ queryKey: qk.memberDetail(memberId) });
  void queryClient.invalidateQueries({ queryKey: qk.families });
  void queryClient.invalidateQueries({ queryKey: qk.members });
  void queryClient.invalidateQueries({ queryKey: qk.pledges });
  void queryClient.invalidateQueries({ queryKey: qk.donations });
  void queryClient.invalidateQueries({ queryKey: qk.dates });
  void queryClient.invalidateQueries({ queryKey: qk.notes });
  void queryClient.invalidateQueries({ queryKey: qk.dashboard });
  void queryClient.invalidateQueries({ queryKey: ['upcoming-dates'] });
}
