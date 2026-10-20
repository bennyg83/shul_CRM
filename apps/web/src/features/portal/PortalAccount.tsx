import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { buildPaymentUrl, type PortalPledge } from '@shulcrm/shared';
import { getPortalAccount } from '@/features/core/service';
import { useSettings } from '@/features/settings/useSettings';
import { portalKeys, useDateFormat } from './usePortalData';

/** One headline figure per currency, or a plain reassurance when there is nothing to show. */
function Figures({
  title,
  totals,
  empty,
  money,
}: {
  title: string;
  totals: Record<string, number>;
  empty: string;
  money: (amount: number, currency: string) => string;
}) {
  const entries = Object.entries(totals).filter(([, amount]) => amount !== 0);
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, flex: 1 }}>
      <Typography variant="body2" color="text.secondary">
        {title}
      </Typography>
      {entries.length === 0 ? (
        <Typography variant="h6" sx={{ mt: 0.5 }}>
          {empty}
        </Typography>
      ) : (
        entries.map(([currency, amount]) => (
          <Typography key={currency} variant="h4" sx={{ mt: 0.5, fontWeight: 700 }}>
            {money(amount, currency)}
          </Typography>
        ))
      )}
    </Paper>
  );
}

export function PortalAccount() {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'));
  const settings = useSettings();
  const formatDate = useDateFormat();
  const {
    data: account,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: portalKeys.account,
    queryFn: getPortalAccount,
  });

  if (isPending) {
    return (
      <Stack alignItems="center" sx={{ py: 6 }}>
        <CircularProgress aria-label="Loading what we owe" />
      </Stack>
    );
  }

  if (isError || !account) {
    return (
      <Alert severity="warning">
        {error instanceof Error
          ? error.message
          : 'We could not load this just now. Please try again in a moment.'}
      </Alert>
    );
  }

  const open = account.pledges.filter((pledge) => pledge.balance > 0);
  const owedCurrencies = Object.entries(account.owed).filter(([, amount]) => amount > 0);
  // A single figure to carry over to the payment page; with two currencies there is no one total.
  const payableTotal = owedCurrencies.length === 1 ? owedCurrencies[0][1] : undefined;

  const payHref = (amount?: number, reference?: string) =>
    account.payment ? buildPaymentUrl(account.payment.url, { amount, reference }) : '';

  const payButton = (label: string, amount?: number, reference?: string, big = false) =>
    account.payment ? (
      <Button
        variant={big ? 'contained' : 'outlined'}
        size={big ? 'large' : 'small'}
        href={payHref(amount, reference)}
        target="_blank"
        rel="noopener"
        endIcon={big ? <OpenInNewIcon /> : undefined}
        aria-label={label}
      >
        {big ? 'Pay now' : 'Pay'}
      </Button>
    ) : null;

  return (
    <Stack spacing={3}>
      <Alert severity="info">
        This page is for your information only. The office records payments, so please contact them
        if something here does not look right.
      </Alert>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <Figures
          title="Still owed"
          totals={account.owed}
          empty="Nothing owed"
          money={settings.money}
        />
        <Figures
          title={`Given in ${account.year}`}
          totals={account.givenThisYear}
          empty="Nothing yet this year"
          money={settings.money}
        />
      </Stack>

      {account.payment && (
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 } }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            sx={{ alignItems: { sm: 'center' } }}
          >
            {payButton(
              'Pay now, on the shul payment page in a new tab',
              payableTotal,
              undefined,
              true,
            )}
            {account.payment.note && (
              <Typography variant="body2" color="text.secondary">
                {account.payment.note}
              </Typography>
            )}
          </Stack>
        </Paper>
      )}

      <Box>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Open {settings.t('pledges').toLowerCase()}
        </Typography>
        {open.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Nothing is outstanding. Thank you.
          </Typography>
        ) : isPhone ? (
          <Stack spacing={1.5}>
            {open.map((pledge) => (
              <Paper key={pledge.id} variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  {pledge.fundLabel}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {pledge.year}
                </Typography>
                <Stack spacing={0.5} sx={{ mt: 1 }}>
                  <Typography variant="body2">
                    Promised {settings.money(pledge.amount, pledge.currency)}
                  </Typography>
                  <Typography variant="body2">
                    Paid {settings.money(pledge.paid, pledge.currency)}
                  </Typography>
                  <Typography variant="body1" sx={{ fontWeight: 700 }}>
                    Still owed {settings.money(pledge.balance, pledge.currency)}
                  </Typography>
                </Stack>
                {account.payment && (
                  <Box sx={{ mt: 1.5 }}>
                    {payButton(
                      `Pay ${settings.money(pledge.balance, pledge.currency)} towards ${pledge.fundLabel} ${pledge.year}, in a new tab`,
                      pledge.balance,
                      pledge.id,
                    )}
                  </Box>
                )}
              </Paper>
            ))}
          </Stack>
        ) : (
          <Paper variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Fund</TableCell>
                  <TableCell>Year</TableCell>
                  <TableCell align="right">Promised</TableCell>
                  <TableCell align="right">Paid</TableCell>
                  <TableCell align="right">Still owed</TableCell>
                  {account.payment && <TableCell />}
                </TableRow>
              </TableHead>
              <TableBody>
                {open.map((pledge: PortalPledge) => (
                  <TableRow key={pledge.id}>
                    <TableCell>{pledge.fundLabel}</TableCell>
                    <TableCell>{pledge.year}</TableCell>
                    <TableCell align="right">
                      {settings.money(pledge.amount, pledge.currency)}
                    </TableCell>
                    <TableCell align="right">
                      {settings.money(pledge.paid, pledge.currency)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      {settings.money(pledge.balance, pledge.currency)}
                    </TableCell>
                    {account.payment && (
                      <TableCell align="right">
                        {payButton(
                          `Pay ${settings.money(pledge.balance, pledge.currency)} towards ${pledge.fundLabel} ${pledge.year}, in a new tab`,
                          pledge.balance,
                          pledge.id,
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        )}
      </Box>

      <Box>
        <Typography variant="h6" sx={{ mb: 1 }}>
          What we have given
        </Typography>
        {account.donations.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Nothing recorded yet.
          </Typography>
        ) : isPhone ? (
          <Paper variant="outlined">
            <Stack divider={<Divider />}>
              {account.donations.map((donation) => (
                <Box key={donation.id} sx={{ p: 2 }}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 2 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                      {donation.fundLabel}
                    </Typography>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                      {settings.money(donation.amount, donation.currency)}
                    </Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {formatDate(donation.date)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Receipt {donation.receiptNumber}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Paper>
        ) : (
          <Paper variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Fund</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell>Receipt</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {account.donations.map((donation) => (
                  <TableRow key={donation.id}>
                    <TableCell>{formatDate(donation.date)}</TableCell>
                    <TableCell>{donation.fundLabel}</TableCell>
                    <TableCell align="right">
                      {settings.money(donation.amount, donation.currency)}
                    </TableCell>
                    <TableCell>{donation.receiptNumber}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        )}
      </Box>
    </Stack>
  );
}
