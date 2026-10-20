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
import { listUpcomingDates } from '@/features/core/service';
import { formatHebrew, type UpcomingDate } from '@shulcrm/shared';
import { qk } from '@/features/core/queryKeys';
import { useSettings } from '@/features/settings/useSettings';
import { YahrzeitNotices } from './YahrzeitNotices';

const REPEATS: Record<UpcomingDate['recurBy'], string> = {
  hebrew: 'Yearly (Hebrew date)',
  gregorian: 'Yearly (English date)',
  once: 'Once',
};

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
  const settings = useSettings();
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
        Upcoming birthdays, yahrzeits, and b&apos;nai mitzvah across all families. Yahrzeits and
        other Hebrew dates fall on their Hebrew anniversary and begin the evening before.
      </Typography>

      {settings.features.yahrzeits && <YahrzeitNotices />}
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
                  <TableCell>{settings.t('family')}</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Hebrew date</TableCell>
                  <TableCell>Repeats</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.map((d) => (
                  <TableRow key={`${d.id}-${d.nextOccurrence}`} hover>
                    <TableCell>{formatGregorian(d.nextOccurrence)}</TableCell>
                    <TableCell>{daysLabel(d.daysUntil)}</TableCell>
                    <TableCell>{d.memberName}</TableCell>
                    <TableCell>{d.familyName}</TableCell>
                    <TableCell>{settings.dateType(d.type).label}</TableCell>
                    <TableCell>
                      {formatHebrew(
                        d.occurrenceHebrew.day,
                        d.occurrenceHebrew.month,
                        d.occurrenceHebrew.year,
                      )}
                    </TableCell>
                    <TableCell>{REPEATS[d.recurBy]}</TableCell>
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
