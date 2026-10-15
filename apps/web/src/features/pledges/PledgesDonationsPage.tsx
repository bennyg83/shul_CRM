import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Grid,
  IconButton,
  Paper,
  Skeleton,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CURRENCIES, formatMoney, type Currency, type Donation, type Pledge } from '@pilzno/shared';
import {
  deleteDonation,
  deletePledge,
  listDonations,
  listFamilies,
  listPledges,
  paidForPledge,
} from '@/features/core/service';
import { invalidateRelated, qk } from '@/features/core/queryKeys';
import { DonationFormDialog, PledgeFormDialog } from '@/features/core/forms';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { palette } from '@/app/theme';

const PLEDGE_TYPE: Record<NonNullable<Pledge['type']>, string> = {
  annual: 'Annual',
  one_time: 'One-time',
};

const DONATION_METHOD: Record<Donation['method'], string> = {
  cash: 'Cash',
  check: 'Check',
  credit: 'Credit',
  transfer: 'Transfer',
};

// Per-currency totals so mixed-currency KPIs don't add apples and oranges.
const moneyBreakdown = <T extends { currency: Currency }>(items: readonly T[], valueOf: (t: T) => number) => {
  const totals: Record<Currency, number> = { USD: 0, AUD: 0, GBP: 0, NIS: 0 };
  for (const it of items) totals[it.currency] += valueOf(it);
  const parts = CURRENCIES.map((c) => (totals[c] > 0 ? formatMoney(totals[c], c) : null)).filter(
    (s): s is string => s !== null,
  );
  return parts.length > 0 ? parts.join('   ·   ') : '—';
};

export function PledgesDonationsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState(0);

  const [pledgeDialog, setPledgeDialog] = useState<{ open: boolean; initial?: Pledge }>({ open: false });
  const [donationDialog, setDonationDialog] = useState<{ open: boolean; initial?: Donation }>({ open: false });
  const [pendingDelete, setPendingDelete] = useState<{ fn: () => Promise<unknown>; label: string } | null>(null);

  const { data: families, isLoading: familiesLoading } = useQuery({
    queryKey: qk.families,
    queryFn: listFamilies,
  });
  const {
    data: pledges,
    isLoading: pledgesLoading,
    isError: pledgesError,
    error: pledgeError,
  } = useQuery({ queryKey: qk.pledges, queryFn: listPledges });
  const {
    data: donations,
    isLoading: donationsLoading,
    isError: donationsError,
    error: donationError,
  } = useQuery({ queryKey: qk.donations, queryFn: listDonations });

  const isLoading = familiesLoading || pledgesLoading || donationsLoading;

  // familyId -> display name, and pledgeId -> amount paid (donations linked by pledgeId).
  const familyName = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of families ?? []) map.set(f.id, f.name);
    return (id: string) => map.get(id) ?? '—';
  }, [families]);

  const pledgePaid = useMemo(() => {
    const list = donations ?? [];
    return (pledgeId: string) => paidForPledge(list, pledgeId);
  }, [donations]);

  const currentYear = new Date().getFullYear();

  const onSaved = () => invalidateRelated(queryClient);
  const confirmDelete = (fn: () => Promise<unknown>, label: string) => setPendingDelete({ fn, label });

  const kpis = [
    { label: 'Total pledged', value: moneyBreakdown(pledges ?? [], (p) => p.amount), hint: `${pledges?.length ?? 0} pledges, all time` },
    { label: 'Total donated', value: moneyBreakdown(donations ?? [], (d) => d.amount), hint: `${donations?.length ?? 0} donations, all time` },
    {
      label: 'Open balance',
      value: moneyBreakdown((pledges ?? []).filter((p) => p.year === currentYear), (p) => Math.max(0, p.amount - pledgePaid(p.id))),
      hint: `Remaining for ${currentYear}`,
    },
    {
      label: 'Donated this year',
      value: moneyBreakdown((donations ?? []).filter((d) => d.date.startsWith(String(currentYear))), (d) => d.amount),
      hint: `Since ${currentYear}-01-01`,
    },
  ];

  return (
    <Box>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ sm: 'center' }}
        spacing={2}
        sx={{ mb: 3 }}
      >
        <Box>
          <Typography variant="h5">Pledges &amp; Donations</Typography>
          <Typography variant="body2" color="text.secondary">
            Record pledges and track the donations paid against them.
          </Typography>
        </Box>
      </Stack>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {kpis.map((kpi) => (
          <Grid item xs={12} sm={6} md={3} key={kpi.label}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  {kpi.label}
                </Typography>
                {isLoading ? (
                  <Skeleton variant="text" width={100} />
                ) : (
                  <Typography variant="h4" sx={{ color: palette.purple.primary }}>
                    {kpi.value}
                  </Typography>
                )}
                <Typography variant="caption" color="text.secondary">
                  {kpi.hint}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {(pledgesError || donationsError) && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Alert severity="error">{((pledgeError ?? donationError) as Error).message}</Alert>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
          >
            <Tab label={`Pledges (${pledges?.length ?? 0})`} />
            <Tab label={`Donations (${donations?.length ?? 0})`} />
          </Tabs>

          {tab === 0 && (
            <Stack spacing={2}>
              <Stack direction="row" justifyContent="flex-end">
                <Button variant="contained" startIcon={<AddIcon />} onClick={() => setPledgeDialog({ open: true })}>
                  Add pledge
                </Button>
              </Stack>
              {pledgesLoading ? (
                <Stack alignItems="center" sx={{ py: 4 }}>
                  <Skeleton variant="text" width={200} />
                </Stack>
              ) : (pledges ?? []).length === 0 ? (
                <Typography color="text.secondary" sx={{ py: 2 }}>
                  No pledges yet.
                </Typography>
              ) : (
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Fund</TableCell>
                        <TableCell>Family</TableCell>
                        <TableCell>Year</TableCell>
                        <TableCell>Type</TableCell>
                        <TableCell>Due</TableCell>
                        <TableCell align="right">Pledged</TableCell>
                        <TableCell align="right">Paid</TableCell>
                        <TableCell align="right">Balance</TableCell>
                        <TableCell align="right">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(pledges ?? []).map((p) => {
                        const paid = pledgePaid(p.id);
                        const balance = Math.max(0, p.amount - paid);
                        return (
                          <TableRow key={p.id} hover>
                            <TableCell>{p.fund}</TableCell>
                            <TableCell>{familyName(p.familyId)}</TableCell>
                            <TableCell>{p.year}</TableCell>
                            <TableCell>{p.type ? PLEDGE_TYPE[p.type] : '—'}</TableCell>
                            <TableCell>{p.dueDate ?? '—'}</TableCell>
                            <TableCell align="right">{formatMoney(p.amount, p.currency)}</TableCell>
                            <TableCell align="right">{formatMoney(paid, p.currency)}</TableCell>
                            <TableCell align="right">{formatMoney(balance, p.currency)}</TableCell>
                            <TableCell align="right">
                              <IconButton
                                size="small"
                                aria-label="Edit pledge"
                                onClick={() => setPledgeDialog({ open: true, initial: p })}
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                              <IconButton
                                size="small"
                                aria-label="Delete pledge"
                                onClick={() => confirmDelete(() => deletePledge(p.id), 'pledge')}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Stack>
          )}

          {tab === 1 && (
            <Stack spacing={2}>
              <Stack direction="row" justifyContent="flex-end">
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => setDonationDialog({ open: true })}
                >
                  Add donation
                </Button>
              </Stack>
              {donationsLoading ? (
                <Stack alignItems="center" sx={{ py: 4 }}>
                  <Skeleton variant="text" width={200} />
                </Stack>
              ) : (donations ?? []).length === 0 ? (
                <Typography color="text.secondary" sx={{ py: 2 }}>
                  No donations yet.
                </Typography>
              ) : (
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Date</TableCell>
                        <TableCell>Family</TableCell>
                        <TableCell>Fund</TableCell>
                        <TableCell align="right">Amount</TableCell>
                        <TableCell>Method</TableCell>
                        <TableCell>Pledge</TableCell>
                        <TableCell>Note</TableCell>
                        <TableCell align="right">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(donations ?? []).map((d) => {
                        const linked = d.pledgeId ? (pledges ?? []).find((p) => p.id === d.pledgeId) : undefined;
                        return (
                          <TableRow key={d.id} hover>
                            <TableCell>{d.date}</TableCell>
                            <TableCell>{familyName(d.familyId)}</TableCell>
                            <TableCell>{d.fund}</TableCell>
                            <TableCell align="right">{formatMoney(d.amount, d.currency)}</TableCell>
                            <TableCell>{DONATION_METHOD[d.method]}</TableCell>
                            <TableCell>{linked ? `${linked.fund} ${linked.year}` : '—'}</TableCell>
                            <TableCell>{d.note ?? '—'}</TableCell>
                            <TableCell align="right">
                              <IconButton
                                size="small"
                                aria-label="Edit donation"
                                onClick={() => setDonationDialog({ open: true, initial: d })}
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                              <IconButton
                                size="small"
                                aria-label="Delete donation"
                                onClick={() => confirmDelete(() => deleteDonation(d.id), 'donation')}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Stack>
          )}
        </CardContent>
      </Card>

      <PledgeFormDialog
        open={pledgeDialog.open}
        onClose={() => setPledgeDialog({ open: false })}
        onSaved={onSaved}
        initial={pledgeDialog.initial}
      />
      <DonationFormDialog
        open={donationDialog.open}
        onClose={() => setDonationDialog({ open: false })}
        onSaved={onSaved}
        initial={donationDialog.initial}
        pledges={pledges}
        defaultFund="General"
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete ${pendingDelete?.label ?? ''}`}
        message="This cannot be undone."
        onConfirm={() => {
          const action = pendingDelete;
          setPendingDelete(null);
          if (action) void action.fn().then(onSaved);
        }}
        onClose={() => setPendingDelete(null)}
      />
    </Box>
  );
}
