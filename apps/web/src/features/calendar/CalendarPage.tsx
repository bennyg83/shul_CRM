import { useMemo, useState } from 'react';
import { Box, Card, CardContent, CircularProgress, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useQuery } from '@tanstack/react-query';
import {
  DATE_TYPE_COLOR,
  DATE_TYPE_LABEL,
  IMPORTANT_DATE_TYPES,
  formatHebrew,
  gregorianToHebrew,
  hebrewMonthName,
  type UpcomingDate,
} from '@pilzno/shared';
import { listDateOccurrences } from '@/features/core/service';
import { qk } from '@/features/core/queryKeys';
import { MemberDetailModal } from '@/features/members/MemberDetailModal';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const iso = (year: number, month: number, day: number) =>
  `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

/** How a date repeats, for the tooltip. */
const RECUR_NOTE: Record<UpcomingDate['recurBy'], string> = {
  hebrew: 'by the Hebrew date (begins the evening before)',
  gregorian: 'by the English date',
  once: 'one-time',
};

export function CalendarPage() {
  const [current, setCurrent] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const { year, month } = current;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const from = iso(year, month, 1);
  const to = iso(year, month, daysInMonth);
  const [memberId, setMemberId] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: qk.occurrences(from, to),
    queryFn: () => listDateOccurrences(from, to),
  });

  const byDay = useMemo(() => {
    const map = new Map<string, UpcomingDate[]>();
    for (const o of data ?? []) map.set(o.nextOccurrence, [...(map.get(o.nextOccurrence) ?? []), o]);
    return map;
  }, [data]);

  // The Hebrew months this English month spans, e.g. "Tishrei – Cheshvan 5787".
  const hebrewSpan = useMemo(() => {
    const a = gregorianToHebrew(from);
    const b = gregorianToHebrew(to);
    const left = a.year === b.year ? hebrewMonthName(a.month, a.year) : `${hebrewMonthName(a.month, a.year)} ${a.year}`;
    return a.month === b.month ? `${left} ${b.year}` : `${left} – ${hebrewMonthName(b.month, b.year)} ${b.year}`;
  }, [from, to]);

  const shift = (delta: number) =>
    setCurrent(({ year: y, month: m }) => {
      const d = new Date(y, m + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  const todayIso = (() => {
    const now = new Date();
    return iso(now.getFullYear(), now.getMonth(), now.getDate());
  })();
  const leadingBlanks = new Date(year, month, 1).getDay();

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 3 }}>
        Calendar
      </Typography>

      <Card>
        <CardContent>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
            <Box>
              <Typography variant="h6">
                {MONTHS[month]} {year}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {hebrewSpan}
              </Typography>
            </Box>
            <Stack direction="row" alignItems="center" spacing={0.5}>
              {isLoading && <CircularProgress size={18} sx={{ mr: 1 }} />}
              <IconButton aria-label="Previous month" onClick={() => shift(-1)}>
                <ChevronLeftIcon />
              </IconButton>
              <IconButton aria-label="Next month" onClick={() => shift(1)}>
                <ChevronRightIcon />
              </IconButton>
            </Stack>
          </Stack>

          {isError && (
            <Typography color="error" sx={{ mb: 2 }}>
              {(error as Error).message}
            </Typography>
          )}

          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 0.5 }}>
            {WEEKDAYS.map((dow) => (
              <Typography key={dow} variant="caption" align="center" color="text.secondary">
                {dow}
              </Typography>
            ))}
            {Array.from({ length: leadingBlanks }, (_, i) => (
              <Box key={`blank-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const dayIso = iso(year, month, day);
              const hebrew = gregorianToHebrew(dayIso);
              const items = byDay.get(dayIso) ?? [];
              return (
                <Box
                  key={dayIso}
                  sx={{
                    minHeight: 76,
                    border: 1,
                    borderColor: dayIso === todayIso ? 'primary.main' : 'divider',
                    borderRadius: 1,
                    p: 0.5,
                    bgcolor: items.length > 0 ? 'action.hover' : undefined,
                    overflow: 'hidden',
                  }}
                >
                  <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                    <Typography variant="body2" fontWeight={dayIso === todayIso ? 700 : 400}>
                      {day}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" title={formatHebrew(hebrew.day, hebrew.month, hebrew.year)}>
                      {hebrew.day === 1 ? `1 ${hebrewMonthName(hebrew.month, hebrew.year)}` : hebrew.day}
                    </Typography>
                  </Stack>
                  {items.map((o) => (
                    <Tooltip
                      key={`${o.id}-${o.nextOccurrence}`}
                      title={`${DATE_TYPE_LABEL[o.type]}: ${o.memberName} (${o.familyName}), ${RECUR_NOTE[o.recurBy]}`}
                    >
                      <Box
                        component="button"
                        type="button"
                        onClick={() => setMemberId(o.memberId)}
                        sx={{
                          display: 'block',
                          width: '100%',
                          mt: 0.25,
                          px: 0.5,
                          border: 0,
                          borderRadius: 0.5,
                          bgcolor: DATE_TYPE_COLOR[o.type],
                          color: '#fff',
                          font: 'inherit',
                          fontSize: 11,
                          lineHeight: 1.6,
                          textAlign: 'left',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          cursor: 'pointer',
                        }}
                      >
                        {o.memberName}
                      </Box>
                    </Tooltip>
                  ))}
                </Box>
              );
            })}
          </Box>

          <Stack direction="row" flexWrap="wrap" gap={2} sx={{ mt: 2 }}>
            {IMPORTANT_DATE_TYPES.map((type) => (
              <Stack key={type} direction="row" alignItems="center" spacing={0.5}>
                <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: DATE_TYPE_COLOR[type] }} />
                <Typography variant="caption" color="text.secondary">
                  {DATE_TYPE_LABEL[type]}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </CardContent>
      </Card>

      {memberId && <MemberDetailModal memberId={memberId} open onClose={() => setMemberId(null)} />}
    </Box>
  );
}
