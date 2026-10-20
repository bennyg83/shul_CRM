import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import MailIcon from '@mui/icons-material/MailOutline';
import { useQuery } from '@tanstack/react-query';
import { getYahrzeitNotices } from '@/features/core/service';
import { SendEmailDialog } from '@/features/email/SendEmailDialog';
import { openPrint } from '@/features/print/openPrint';
import { useSettings } from '@/features/settings/useSettings';

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The next twelve English months, starting with next month (notices go out ahead). */
function months(locale: string) {
  const now = new Date();
  return Array.from({ length: 13 }, (_, i) => {
    const first = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    return {
      value: iso(first).slice(0, 7),
      label: first.toLocaleDateString(locale, { month: 'long', year: 'numeric' }),
      from: iso(first),
      to: iso(last),
    };
  });
}

/** Yahrzeit notices for a month: print the list or the letters, or email the families. */
export function YahrzeitNotices() {
  const { org } = useSettings();
  const options = months(org.locale);
  const [month, setMonth] = useState(options[1].value);
  const [emailing, setEmailing] = useState(false);
  const chosen = options.find((m) => m.value === month) ?? options[1];
  const { data, isLoading, error } = useQuery({
    queryKey: ['yahrzeit-notices', chosen.from, chosen.to],
    queryFn: () => getYahrzeitNotices(chosen.from, chosen.to),
  });
  const count = data?.length ?? 0;
  const missing = (data ?? []).filter((n) => n.missingName);
  const range = `from=${chosen.from}&to=${chosen.to}`;

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Yahrzeit notices
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Letters and reminders for the yahrzeits in a month. The wording comes from the “Yahrzeit
          reminder” template (Settings → Email).
        </Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
          <Select
            size="small"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            inputProps={{ 'aria-label': 'Month' }}
          >
            {options.map((m) => (
              <MenuItem key={m.value} value={m.value}>
                {m.label}
              </MenuItem>
            ))}
          </Select>
          <Typography variant="body2" sx={{ minWidth: 120 }}>
            {isLoading ? 'Counting…' : `${count} yahrzeit${count === 1 ? '' : 's'}`}
          </Typography>
          <Button
            variant="outlined"
            size="small"
            startIcon={<PrintIcon />}
            disabled={count === 0}
            onClick={() => openPrint(`/print/yahrzeit-list?${range}`)}
          >
            Print list
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<PrintIcon />}
            disabled={count === 0}
            onClick={() => openPrint(`/print/yahrzeit-letters?${range}`)}
          >
            Print letters
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<MailIcon />}
            disabled={count === 0}
            onClick={() => setEmailing(true)}
          >
            Email reminders
          </Button>
        </Stack>
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {(error as Error).message}
          </Alert>
        )}
        {missing.length > 0 && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {missing.length === 1 ? 'This yahrzeit doesn’t' : `${missing.length} yahrzeits don’t`}{' '}
            say who is remembered, so the letter would name the member instead:{' '}
            {missing.map((n) => `${n.member.firstName} ${n.member.lastName}`).join(', ')}. Open the
            date and fill in “In memory of”.
          </Alert>
        )}
        <SendEmailDialog
          open={emailing}
          onClose={() => setEmailing(false)}
          title={`Yahrzeit reminders, ${chosen.label}`}
          template="yahrzeit"
          recipients={(data ?? []).map((n) => ({
            familyId: n.family.id,
            importantDateId: n.date.id,
            occurrence: n.occurrence.nextOccurrence,
          }))}
        />
      </CardContent>
    </Card>
  );
}
