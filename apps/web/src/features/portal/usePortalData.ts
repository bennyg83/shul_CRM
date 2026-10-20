import { useQuery } from '@tanstack/react-query';
import type { Member } from '@shulcrm/shared';
import { getPortalHome } from '@/features/core/service';
import { useSettings } from '@/features/settings/useSettings';

/** Query keys for the portal's own data, kept apart from the office app's lists. */
export const portalKeys = {
  home: ['portal', 'home'] as const,
  account: ['portal', 'account'] as const,
  sponsorships: ['portal', 'sponsorships'] as const,
};

/**
 * The signed-in member, their family and its dates. Every tab reads it through this one
 * cached query, so the portal asks for it once and moving between tabs never waits again.
 */
export function usePortalHome() {
  return useQuery({ queryKey: portalKeys.home, queryFn: getPortalHome, staleTime: 5 * 60_000 });
}

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const fullName = (member: Pick<Member, 'firstName' | 'lastName'>) =>
  `${member.firstName} ${member.lastName}`.trim();

/** Dates written out in the shul's own locale, long enough to read aloud without decoding. */
export function useDateFormat() {
  const { org } = useSettings();
  return (iso: string | undefined, options?: Intl.DateTimeFormatOptions): string => {
    if (!iso || !ISO_DATE.test(iso)) return '—';
    const [year, month, day] = iso.split('-').map(Number);
    // Built from the parts rather than parsed, so the date never shifts by a time zone.
    return new Date(year, month - 1, day).toLocaleDateString(
      org.locale,
      options ?? { day: 'numeric', month: 'long', year: 'numeric' },
    );
  };
}
