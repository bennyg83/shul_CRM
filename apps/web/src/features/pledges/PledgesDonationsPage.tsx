import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Donation, DonationRow, Pledge, PledgeRow } from '@shulcrm/shared';
import {
  deleteDonation,
  deletePledge,
  getDashboardStats,
  listPledges,
} from '@/features/core/service';
import { invalidateRelated, qk } from '@/features/core/queryKeys';
import { useDebounced, usePaged, useSort } from '@/features/core/usePaged';
import { DonationFormDialog, PledgeFormDialog } from '@/features/core/forms';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ReceiptActions } from '@/features/email/DocumentActions';
import { useSettings } from '@/features/settings/useSettings';

const PLEDGE_TYPE: Record<NonNullable<Pledge['type']>, string> = {
  annual: 'Annual',
  one_time: 'One-time',
};

const thisYear = new Date().getFullYear();
const YEARS = Array.from({ length: 8 }, (_, i) => thisYear + 1 - i);

/** A table header cell that sorts its column. */
function SortCell({
  sort,
  col,
  label,
  align,
  first = 'asc',
}: {
  sort: ReturnType<typeof useSort>;
  col: string;
  label: string;
  align?: 'right';
  first?: 'asc' | 'desc';
}) {
  return (
    <TableCell align={align} sortDirection={sort.key === col ? sort.order : false}>
      <TableSortLabel
        active={sort.key === col}
        direction={sort.key === col ? sort.order : first}
        onClick={() => sort.toggle(col, first)}
      >
        {label}
      </TableSortLabel>
    </TableCell>
  );
}

/** Search box and year filter shared by both tables. */
function Filters({
  search,
  onSearch,
  year,
  onYear,
  placeholder,
}: {
  search: string;
  onSearch: (v: string) => void;
  year: string;
  onYear: (v: string) => void;
  placeholder: string;
}) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ flexGrow: 1 }}>
      <TextField
        size="small"
        placeholder={placeholder}
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        InputProps={{
          startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />,
        }}
        sx={{ maxWidth: 320 }}
      />
      <Select
        size="small"
        value={year}
        displayEmpty
        onChange={(e) => onYear(e.target.value)}
        inputProps={{ 'aria-label': 'Year' }}
        sx={{ minWidth: 120 }}
      >
        <MenuItem value="">All years</MenuItem>
        {YEARS.map((y) => (
          <MenuItem key={y} value={String(y)}>
            {y}
          </MenuItem>
        ))}
      </Select>
    </Stack>
  );
}

export function PledgesDonationsPage() {
  const queryClient = useQueryClient();
  const [tabChoice, setTab] = useState(0);
  const settings = useSettings();
  const { t, money, label, moneyTotals } = settings;
  const pledgesOn = settings.features.pledges;
  // With pledges switched off there is only the donations list.
  const tab = pledgesOn ? tabChoice : 1;

  const [pledgeDialog, setPledgeDialog] = useState<{ open: boolean; initial?: Pledge }>({
    open: false,
  });
  const [donationDialog, setDonationDialog] = useState<{ open: boolean; initial?: Donation }>({
    open: false,
  });
  const [pendingDelete, setPendingDelete] = useState<{
    fn: () => Promise<unknown>;
    label: string;
  } | null>(null);

  // Pledges table: search, year, sort, page (all done by the API).
  const [pSearch, setPSearch] = useState('');
  const [pYear, setPYear] = useState('');
  const [pPage, setPPage] = useState(0);
  const [pRows, setPRows] = useState(25);
  const pSort = useSort('year', 'desc');
  const pq = useDebounced(pSearch.trim());
  useEffect(() => setPPage(0), [pq, pYear, pSort.key, pSort.order, pRows]);
  const pledges = usePaged<PledgeRow>('pledges', {
    q: pq,
    year: pYear,
    sort: pSort.key,
    order: pSort.order,
    limit: pRows,
    offset: pPage * pRows,
  });

  // Donations table.
  const [dSearch, setDSearch] = useState('');
  const [dYear, setDYear] = useState('');
  const [dPage, setDPage] = useState(0);
  const [dRows, setDRows] = useState(25);
  const dSort = useSort('date', 'desc');
  const dq = useDebounced(dSearch.trim());
  useEffect(() => setDPage(0), [dq, dYear, dSort.key, dSort.order, dRows]);
  const donations = usePaged<DonationRow>('donations', {
    q: dq,
    year: dYear,
    sort: dSort.key,
    order: dSort.order,
    limit: dRows,
    offset: dPage * dRows,
  });

  // Summary cards: all-time totals and this year's, from the API (not from one page of rows).
  const allPledges = usePaged<PledgeRow>('pledges', { limit: 1 });
  const allDonations = usePaged<DonationRow>('donations', { limit: 1 });
  const yearDonations = usePaged<DonationRow>('donations', { limit: 1, year: String(thisYear) });
  const { data: stats } = useQuery({ queryKey: qk.dashboard, queryFn: getDashboardStats });

  // The donation form offers this family's pledges to link to.
  const { data: pledgeOptions } = useQuery({
    queryKey: qk.pledges,
    queryFn: listPledges,
    enabled: donationDialog.open && pledgesOn,
  });

  const onSaved = () => invalidateRelated(queryClient);
  const confirmDelete = (fn: () => Promise<unknown>, what: string) =>
    setPendingDelete({ fn, label: what });
  const loadingCards = allDonations.isLoading;

  const kpis = [
    ...(pledgesOn
      ? [
          {
            label: 'Total pledged',
            value: moneyTotals(allPledges.data?.totals ?? {}),
            hint: `${allPledges.data?.total ?? 0} ${t('pledges').toLowerCase()}, all time`,
          },
        ]
      : []),
    {
      label: 'Total donated',
      value: moneyTotals(allDonations.data?.totals ?? {}),
      hint: `${allDonations.data?.total ?? 0} ${t('donations').toLowerCase()}, all time`,
    },
    ...(pledgesOn
      ? [
          {
            label: 'Open balance',
            value: moneyTotals(stats?.openPledgeBalance ?? {}),
            hint: `Remaining for ${thisYear}`,
          },
        ]
      : []),
    {
      label: 'Donated this year',
      value: moneyTotals(yearDonations.data?.totals ?? {}),
      hint: `Since ${thisYear}-01-01`,
    },
  ];

  const error = (pledges.error ?? donations.error) as Error | null;

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
          <Typography variant="h5">
            {pledgesOn ? `${t('pledges')} & ${t('donations')}` : t('donations')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {pledgesOn
              ? `Record ${t('pledges').toLowerCase()} and track the ${t('donations').toLowerCase()} paid against them.`
              : `Record ${t('donations').toLowerCase()}.`}
          </Typography>
        </Box>
      </Stack>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {kpis.map((kpi) => (
          <Grid item xs={12} sm={6} md={12 / kpis.length} key={kpi.label}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  {kpi.label}
                </Typography>
                {loadingCards ? (
                  <Skeleton variant="text" width={100} />
                ) : (
                  <Typography variant="h4" sx={{ color: 'primary.main' }}>
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

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error.message}
        </Alert>
      )}

      <Card>
        <CardContent>
          {pledgesOn && (
            <Tabs
              value={tab}
              onChange={(_, v) => setTab(v)}
              sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
            >
              <Tab label={`${t('pledges')} (${allPledges.data?.total ?? 0})`} />
              <Tab label={`${t('donations')} (${allDonations.data?.total ?? 0})`} />
            </Tabs>
          )}

          {tab === 0 && (
            <Stack spacing={2}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1}
                justifyContent="space-between"
              >
                <Filters
                  search={pSearch}
                  onSearch={setPSearch}
                  year={pYear}
                  onYear={setPYear}
                  placeholder={`Search ${t('pledges').toLowerCase()}…`}
                />
                <Button startIcon={<AddIcon />} onClick={() => setPledgeDialog({ open: true })}>
                  {`Add ${t('pledge').toLowerCase()}`}
                </Button>
              </Stack>
              {pledges.isLoading ? (
                <Skeleton variant="text" width={200} />
              ) : (pledges.data?.items ?? []).length === 0 ? (
                <Typography color="text.secondary" sx={{ py: 2 }}>
                  {pq || pYear ? 'Nothing matches.' : `No ${t('pledges').toLowerCase()} yet.`}
                </Typography>
              ) : (
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <SortCell sort={pSort} col="fund" label="Fund" />
                        <SortCell sort={pSort} col="family" label={t('family')} />
                        <SortCell sort={pSort} col="year" label="Year" first="desc" />
                        <TableCell>Type</TableCell>
                        <SortCell sort={pSort} col="due" label="Due" />
                        <SortCell
                          sort={pSort}
                          col="amount"
                          label="Pledged"
                          align="right"
                          first="desc"
                        />
                        <TableCell align="right">Paid</TableCell>
                        <TableCell align="right">Balance</TableCell>
                        <TableCell align="right">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(pledges.data?.items ?? []).map((p) => (
                        <TableRow key={p.id} hover>
                          <TableCell>{label('funds', p.fund)}</TableCell>
                          <TableCell>{p.familyName}</TableCell>
                          <TableCell>{p.year}</TableCell>
                          <TableCell>{p.type ? PLEDGE_TYPE[p.type] : '—'}</TableCell>
                          <TableCell>{p.dueDate ?? '—'}</TableCell>
                          <TableCell align="right">{money(p.amount, p.currency)}</TableCell>
                          <TableCell align="right">{money(p.paid, p.currency)}</TableCell>
                          <TableCell align="right">
                            {money(Math.max(0, p.amount - p.paid), p.currency)}
                          </TableCell>
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
                              onClick={() =>
                                confirmDelete(() => deletePledge(p.id), t('pledge').toLowerCase())
                              }
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <TablePagination
                    component="div"
                    count={pledges.data?.total ?? 0}
                    page={pPage}
                    onPageChange={(_, n) => setPPage(n)}
                    rowsPerPage={pRows}
                    onRowsPerPageChange={(e) => setPRows(Number(e.target.value))}
                    rowsPerPageOptions={[25, 50, 100]}
                  />
                </TableContainer>
              )}
              {(pq || pYear) && pledges.data && (
                <Typography variant="body2" color="text.secondary">
                  {pledges.data.total} matching, totalling {moneyTotals(pledges.data.totals ?? {})}
                </Typography>
              )}
            </Stack>
          )}

          {tab === 1 && (
            <Stack spacing={2}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1}
                justifyContent="space-between"
              >
                <Filters
                  search={dSearch}
                  onSearch={setDSearch}
                  year={dYear}
                  onYear={setDYear}
                  placeholder={`Search ${t('donations').toLowerCase()}…`}
                />
                <Button startIcon={<AddIcon />} onClick={() => setDonationDialog({ open: true })}>
                  {`Add ${t('donation').toLowerCase()}`}
                </Button>
              </Stack>
              {donations.isLoading ? (
                <Skeleton variant="text" width={200} />
              ) : (donations.data?.items ?? []).length === 0 ? (
                <Typography color="text.secondary" sx={{ py: 2 }}>
                  {dq || dYear ? 'Nothing matches.' : `No ${t('donations').toLowerCase()} yet.`}
                </Typography>
              ) : (
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <SortCell sort={dSort} col="date" label="Date" first="desc" />
                        <SortCell sort={dSort} col="family" label={t('family')} />
                        <SortCell sort={dSort} col="fund" label="Fund" />
                        <SortCell
                          sort={dSort}
                          col="amount"
                          label="Amount"
                          align="right"
                          first="desc"
                        />
                        <SortCell sort={dSort} col="method" label="Method" />
                        {pledgesOn && <TableCell>{t('pledge')}</TableCell>}
                        <TableCell>Note</TableCell>
                        <TableCell align="right">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(donations.data?.items ?? []).map((d) => (
                        <TableRow key={d.id} hover>
                          <TableCell>{d.date}</TableCell>
                          <TableCell>{d.familyName}</TableCell>
                          <TableCell>{label('funds', d.fund)}</TableCell>
                          <TableCell align="right">{money(d.amount, d.currency)}</TableCell>
                          <TableCell>{label('paymentMethods', d.method)}</TableCell>
                          {pledgesOn && (
                            <TableCell>
                              {d.pledgeFund
                                ? `${label('funds', d.pledgeFund)} ${d.pledgeYear ?? ''}`
                                : '—'}
                            </TableCell>
                          )}
                          <TableCell>{d.note ?? '—'}</TableCell>
                          <TableCell align="right">
                            <ReceiptActions donation={d} />
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
                              onClick={() =>
                                confirmDelete(
                                  () => deleteDonation(d.id),
                                  t('donation').toLowerCase(),
                                )
                              }
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <TablePagination
                    component="div"
                    count={donations.data?.total ?? 0}
                    page={dPage}
                    onPageChange={(_, n) => setDPage(n)}
                    rowsPerPage={dRows}
                    onRowsPerPageChange={(e) => setDRows(Number(e.target.value))}
                    rowsPerPageOptions={[25, 50, 100]}
                  />
                </TableContainer>
              )}
              {(dq || dYear) && donations.data && (
                <Typography variant="body2" color="text.secondary">
                  {donations.data.total} matching, totalling{' '}
                  {moneyTotals(donations.data.totals ?? {})}
                </Typography>
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
        pledges={pledgeOptions}
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
