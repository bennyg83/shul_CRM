import { useSettings } from '@/features/settings/useSettings';

/** A long date in the shul's locale ("October 15, 2026"), without time-zone drift. */
export function useLongDate() {
  const { org } = useSettings();
  return (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString(org.locale, {
      dateStyle: 'long',
      timeZone: 'UTC',
    });
}
