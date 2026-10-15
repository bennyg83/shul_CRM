import { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import type { ImportantDate } from '@pilzno/shared';
import { listUpcomingDates } from '@/features/core/service';
import { formatHebrew } from '@/features/core/hebrewDate';
import { qk } from '@/features/core/queryKeys';

const DATE_LABELS: Record<ImportantDate['type'], string> = {
  birthday: 'Birthday',
  yahrzeit: 'Yahrzeit (Memorial)',
  bar_mitzvah: 'Bar Mitzvah',
  bat_mitzvah: 'Bat Mitzvah',
  anniversary: 'Anniversary',
  "seuda_hoda'a": 'Seuda Hoda\'a (Thanksgiving Meal)',
} as const;

const WINDOWS = [
  { days: 30, label: '30 days' },
  { days: 60, label: '60 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '1 year' },
] as const;

/** Format a local ISO date (YYYY-MM-DD) readably, without UTC drift. */
function formatGregorian(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function daysLabel(daysUntil: number): string {
  if (daysUntil === 0) return 'Today';
  if (daysUntil === 1) return 'Tomorrow';
  return `In ${daysUntil} days`;
}

export function UpcomingDatesPage() {
  const [days, setDays] = useState<number>(90);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: qk.upcoming(days),
    queryFn: () => listUpcomingDates(days),
  });

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
        <Typography variant="h5">Important Dates</Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={days}
          onChange={(_e, v) => {
            if (v !== null) setDays(v);
          }}
          aria-label="Date window"
        >
          {WINDOWS.map((w) => (
            <ToggleButton key={w.days} value={w.days}>
              {w.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Stack>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Upcoming birthdays, yahrzeits, and b&apos;nai mitzvah across all families, with the Hebrew date where set.
      </Typography>

      <Card>
        <CardContent>
          {isLoading && (
            <Stack alignItems="center" sx={{ py: 4 }}>
              <CircularProgress size={28} />
            </Stack>
          )}

          {isError && (
            <Typography color="error" sx={{ py: 2 }}>
              {(error as Error).message}
            </Typography>
          )}

          {!isLoading && !isError && data && data.length === 0 && (
            <Typography color="text.secondary" sx={{ py: 2 }}>
              No important dates in this window.
            </Typography>
          )}

          {!isLoading && !isError && data && data.length > 0 && (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>When</TableCell>
                  <TableCell>Member</TableCell>
                  <TableCell>Family</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Hebrew</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.map((d) => (
                  <TableRow key={d.id} hover>
                    <TableCell>{formatGregorian(d.nextOccurrence)}</TableCell>
                    <TableCell>{daysLabel(d.daysUntil)}</TableCell>
                    <TableCell>{d.memberName}</TableCell>
                    <TableCell>{d.familyName}</TableCell>
                    <TableCell>{DATE_LABELS[d.type]}</TableCell>
                    <TableCell>
                      {d.hebrewDay && d.hebrewMonth && d.hebrewYear
                        ? formatHebrew(d.hebrewDay, d.hebrewMonth, d.hebrewYear)
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
