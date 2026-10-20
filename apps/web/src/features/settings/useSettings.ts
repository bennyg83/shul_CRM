import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  DEFAULT_FEATURES,
  DEFAULT_LOOKUPS,
  DEFAULT_TERMS,
  defaultOrgProfile,
  formatMoneyWith,
  lookupLabel,
  lookupOptions,
  type DateTypeItem,
  type LookupKind,
  type Lookups,
  type RecurrenceOptions,
  type Settings,
  type TermKey,
} from '@shulcrm/shared';
import { getSettings } from '@/features/core/service';
import { qk } from '@/features/core/queryKeys';

/** Used until the real settings arrive (and if the API is down), so pages never wait on them. */
const FALLBACK: Settings = {
  org: defaultOrgProfile('00000000-0000-7000-8000-000000000000'),
  features: DEFAULT_FEATURES,
  terms: DEFAULT_TERMS,
  lookups: DEFAULT_LOOKUPS,
  hasLogo: false,
};

const UNKNOWN_DATE_TYPE = (key: string): DateTypeItem => ({
  key,
  label: key,
  active: false,
  color: '#607d8b',
  recurBy: 'gregorian',
  rules: 'anniversary',
});

/** The shul's settings plus helpers for labels, dropdown options, money and terms. */
export function useSettings() {
  const { data } = useQuery({ queryKey: qk.settings, queryFn: getSettings, staleTime: 5 * 60_000 });
  return useMemo(() => {
    const s = data ?? FALLBACK;
    const { lookups, features } = s;
    return {
      ...s,
      loaded: data !== undefined,
      /** A list item's label for a stored key. */
      label: (kind: LookupKind, key: string | undefined) => lookupLabel(lookups[kind], key),
      /** Items to offer in a dropdown: the active ones, plus `current` if it was retired. */
      options: <K extends LookupKind>(kind: K, current?: string) =>
        lookupOptions(lookups[kind] as Lookups[K], current) as Lookups[K],
      /** Date types to offer; yahrzeit-rule types are hidden when the yahrzeits module is off. */
      dateTypeOptions: (current?: string) =>
        lookupOptions(lookups.dateTypes, current).filter(
          (t) => features.yahrzeits || t.rules !== 'yahrzeit' || t.key === current,
        ),
      dateType: (key: string) =>
        lookups.dateTypes.find((t) => t.key === key) ?? UNKNOWN_DATE_TYPE(key),
      money: (amount: number, currency: string) =>
        formatMoneyWith(lookups.currencies, amount, currency),
      /** Per-currency totals as one line ("$1,200 · ₪2,000"), in list order; "—" when all are zero. */
      moneyTotals: (totals: Readonly<Record<string, number>>) => {
        const order = [...lookups.currencies.map((c) => c.key), ...Object.keys(totals)];
        const parts = [...new Set(order)]
          .filter((code) => (totals[code] ?? 0) !== 0)
          .map((code) => formatMoneyWith(lookups.currencies, totals[code], code));
        return parts.length > 0 ? parts.join('   ·   ') : '—';
      },
      recurrence: {
        adarYahrzeit: s.org.adarYahrzeit,
        dateTypes: lookups.dateTypes,
        hebrewCalendar: features.hebrewCalendar,
      } satisfies RecurrenceOptions,
      /** The shul's word for a thing ("Family" or "Household"). */
      t: (key: TermKey) => s.terms[key],
    };
  }, [data]);
}

export type SettingsView = ReturnType<typeof useSettings>;
