// ---------------------------------------------------------------------------
// Important-date types: the one place for their labels, colors, and how they
// repeat by default. Pages import from here instead of keeping their own copies.
// ---------------------------------------------------------------------------

export const IMPORTANT_DATE_TYPES = [
  'birthday',
  'yahrzeit',
  'bar_mitzvah',
  'bat_mitzvah',
  'anniversary',
  "seuda_hoda'a",
] as const;

export type ImportantDateType = (typeof IMPORTANT_DATE_TYPES)[number];

/** A recurring date repeats on its Hebrew date or on its Gregorian (English) date. */
export const RECUR_BY = ['hebrew', 'gregorian'] as const;
export type RecurBy = (typeof RECUR_BY)[number];

export const DATE_TYPE_LABEL: Record<ImportantDateType, string> = {
  birthday: 'Birthday',
  yahrzeit: 'Yahrzeit (Memorial)',
  bar_mitzvah: 'Bar Mitzvah',
  bat_mitzvah: 'Bat Mitzvah',
  anniversary: 'Anniversary',
  "seuda_hoda'a": "Seuda Hoda'a (Thanksgiving Meal)",
};

export const DATE_TYPE_COLOR: Record<ImportantDateType, string> = {
  birthday: '#4caf50',
  yahrzeit: '#9c27b0',
  bar_mitzvah: '#2196f3',
  bat_mitzvah: '#2196f3',
  anniversary: '#ff9800',
  "seuda_hoda'a": '#009688',
};

/** Yahrzeits and other religious anniversaries follow the Hebrew calendar; birthdays and
 * wedding anniversaries are usually kept on the English date. Each date can override this. */
export const DEFAULT_RECUR_BY: Record<ImportantDateType, RecurBy> = {
  birthday: 'gregorian',
  yahrzeit: 'hebrew',
  bar_mitzvah: 'hebrew',
  bat_mitzvah: 'hebrew',
  anniversary: 'gregorian',
  "seuda_hoda'a": 'hebrew',
};
