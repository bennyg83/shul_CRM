import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  MenuItem,
  Select,
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
import DownloadIcon from '@mui/icons-material/Download';
import { useQuery } from '@tanstack/react-query';
import { REPORTS, type ReportKey } from '@shulcrm/shared';
import { getReport, reportCsvUrl } from '@/features/core/service';
import { useSettings } from '@/features/settings/useSettings';

const thisYear = new Date().getFullYear();
const YEARS = Array.from({ length: 8 }, (_, i) => thisYear + 1 - i);

export function ReportsPage() {
  const { features, org } = useSettings();
  const available = REPORTS.filter(
    (r) =>
      (features.pledges || r.key !== 'pledgeStatus') &&
      (features.yahrzeits || r.key !== 'yahrzeits'),
  );
  const [key, setKey] = useState<ReportKey>('donationsByFund');
  const [year, setYear] = useState(thisYear);
  const report = available.find((r) => r.key === key) ?? available[0];
  const { data, isLoading, error } = useQuery({
    queryKey: ['report', report.key, year],
    queryFn: () => getReport(report.key, year),
  });
  const number = new Intl.NumberFormat(org.locale, { maximumFractionDigits: 2 });

  return (
    <Box>
      <Typography variant="h5">Reports</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Download any report as CSV to open it in a spreadsheet. Amounts are kept per currency.
      </Typography>
      <Card>
        <CardContent>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            alignItems={{ md: 'center' }}
            sx={{ mb: 2 }}
          >
            <ToggleButtonGroup
              exclusive
              size="small"
              value={report.key}
              onChange={(_, v: ReportKey | null) => v && setKey(v)}
              sx={{ flexWrap: 'wrap' }}
            >
              {available.map((r) => (
                <ToggleButton key={r.key} value={r.key}>
                  {r.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <Box sx={{ flexGrow: 1 }} />
            {report.key !== 'directory' && (
              <Select
                size="small"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                inputProps={{ 'aria-label': 'Year' }}
              >
                {YEARS.map((y) => (
                  <MenuItem key={y} value={y}>
                    {y}
                  </MenuItem>
                ))}
              </Select>
            )}
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              href={reportCsvUrl(report.key, year)}
            >
              CSV
            </Button>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {report.help}
          </Typography>
          {isLoading && <CircularProgress size={24} />}
          {error && <Alert severity="error">{(error as Error).message}</Alert>}
          {data && (
            <>
              <Typography variant="h6" sx={{ mb: 1 }}>
                {data.title}
              </Typography>
              {data.rows.length === 0 ? (
                <Typography color="text.secondary">Nothing to show.</Typography>
              ) : (
                <Box sx={{ overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        {data.columns.map((c, i) => (
                          <TableCell
                            key={c}
                            align={data.numeric?.includes(i) ? 'right' : 'left'}
                            sx={{ whiteSpace: 'nowrap' }}
                          >
                            {c}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.rows.map((row, r) => (
                        <TableRow key={r} hover>
                          {row.map((v, i) => (
                            <TableCell key={i} align={data.numeric?.includes(i) ? 'right' : 'left'}>
                              {typeof v === 'number' ? number.format(v) : v}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
