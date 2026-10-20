import { Box, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router-dom';
import type { StatementData } from '@shulcrm/shared';
import {
  getReceipt,
  getStatement,
  getStatements,
  getYahrzeitNotices,
  sendEmails,
} from '@/features/core/service';
import { useSettings } from '@/features/settings/useSettings';
import { AddressBlock, Letterhead, Page, Paragraphs, PrintLayout } from './PrintLayout';
import { useLongDate } from './useLongDate';

const thisYear = () => new Date().getFullYear();
const cell = { py: 0.75, px: 1, fontSize: 13 } as const;

function ReceiptFooter() {
  const { org } = useSettings();
  if (!org.taxId && !org.receiptFooter) return null;
  return (
    <Box sx={{ mt: 4, pt: 1.5, borderTop: 1, borderColor: '#ddd', fontSize: 12, color: '#555' }}>
      {org.taxId && (
        <Typography sx={{ fontSize: 12 }}>Tax / charity number: {org.taxId}</Typography>
      )}
      {org.receiptFooter && (
        <Typography sx={{ fontSize: 12, whiteSpace: 'pre-line' }}>{org.receiptFooter}</Typography>
      )}
    </Box>
  );
}

export function ReceiptPrint() {
  const { donationId = '' } = useParams();
  const { money, org } = useSettings();
  const longDate = useLongDate();
  const { data, isLoading, error } = useQuery({
    queryKey: ['receipt', donationId],
    queryFn: () => getReceipt(donationId),
  });
  return (
    <PrintLayout title="Donation receipt" loading={isLoading} error={error}>
      {data && (
        <Page>
          <Letterhead />
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 2,
            }}
          >
            <AddressBlock name={data.greeting} lines={data.addressLines} />
            <Box sx={{ textAlign: 'right' }}>
              <Typography sx={{ fontSize: 22, fontWeight: 700 }}>Receipt</Typography>
              <Typography>No. {data.receiptNumber}</Typography>
              <Typography>{longDate(data.donation.date)}</Typography>
            </Box>
          </Box>
          <Typography sx={{ mb: 2 }}>
            Dear {data.greeting}, thank you for your gift to {org.name}.
          </Typography>
          <Table size="small" sx={{ mb: 2 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={cell}>Date</TableCell>
                <TableCell sx={cell}>Fund</TableCell>
                <TableCell sx={cell}>Method</TableCell>
                <TableCell sx={cell} align="right">
                  Amount
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                <TableCell sx={cell}>{longDate(data.donation.date)}</TableCell>
                <TableCell sx={cell}>{data.fundLabel}</TableCell>
                <TableCell sx={cell}>{data.methodLabel}</TableCell>
                <TableCell sx={{ ...cell, fontWeight: 700 }} align="right">
                  {money(data.donation.amount, data.donation.currency)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          {data.donation.note && (
            <Typography sx={{ color: '#555' }}>Note: {data.donation.note}</Typography>
          )}
          <ReceiptFooter />
        </Page>
      )}
    </PrintLayout>
  );
}

function StatementSheet({ s }: { s: StatementData }) {
  const { money, t } = useSettings();
  const longDate = useLongDate();
  const totals = Object.entries(s.totals);
  return (
    <Page>
      <Letterhead />
      <Box
        sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}
      >
        <AddressBlock name={s.greeting} lines={s.addressLines} />
        <Box sx={{ textAlign: 'right' }}>
          <Typography sx={{ fontSize: 20, fontWeight: 700 }}>Statement of giving</Typography>
          <Typography>
            {longDate(`${s.year}-01-01`)} – {longDate(`${s.year}-12-31`)}
          </Typography>
        </Box>
      </Box>
      <Typography sx={{ mb: 2 }}>
        Dear {s.greeting}, thank you for your support during {s.year}. These are the{' '}
        {t('donations').toLowerCase()} we received from you.
      </Typography>
      <Table size="small" sx={{ mb: 2 }}>
        <TableHead>
          <TableRow>
            <TableCell sx={cell}>Receipt</TableCell>
            <TableCell sx={cell}>Date</TableCell>
            <TableCell sx={cell}>Fund</TableCell>
            <TableCell sx={cell}>Method</TableCell>
            <TableCell sx={cell} align="right">
              Amount
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {s.donations.map((d) => (
            <TableRow key={d.id}>
              <TableCell sx={cell}>{d.receiptNumber}</TableCell>
              <TableCell sx={cell}>{longDate(d.date)}</TableCell>
              <TableCell sx={cell}>{d.fundLabel}</TableCell>
              <TableCell sx={cell}>{d.methodLabel}</TableCell>
              <TableCell sx={cell} align="right">
                {money(d.amount, d.currency)}
              </TableCell>
            </TableRow>
          ))}
          {totals.map(([currency, total]) => (
            <TableRow key={currency}>
              <TableCell sx={{ ...cell, fontWeight: 700 }} colSpan={4}>
                Total{totals.length > 1 ? ` (${currency})` : ''}
              </TableCell>
              <TableCell sx={{ ...cell, fontWeight: 700 }} align="right">
                {money(total, currency)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {s.donations.length === 0 && (
        <Typography sx={{ mb: 2 }}>
          No {t('donations').toLowerCase()} were recorded this year.
        </Typography>
      )}
      {s.pledges.length > 0 && (
        <>
          <Typography
            sx={{ fontWeight: 700, mt: 3, mb: 1 }}
          >{`${t('pledges')} for ${s.year}`}</Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={cell}>Fund</TableCell>
                <TableCell sx={cell} align="right">
                  Pledged
                </TableCell>
                <TableCell sx={cell} align="right">
                  Paid
                </TableCell>
                <TableCell sx={cell} align="right">
                  Still open
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {s.pledges.map((p) => (
                <TableRow key={p.id}>
                  <TableCell sx={cell}>{p.fundLabel}</TableCell>
                  <TableCell sx={cell} align="right">
                    {money(p.amount, p.currency)}
                  </TableCell>
                  <TableCell sx={cell} align="right">
                    {money(p.paid, p.currency)}
                  </TableCell>
                  <TableCell sx={cell} align="right">
                    {money(p.balance, p.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
      <ReceiptFooter />
    </Page>
  );
}

export function StatementPrint() {
  const { familyId = '' } = useParams();
  const [params] = useSearchParams();
  const year = Number(params.get('year')) || thisYear();
  const { data, isLoading, error } = useQuery({
    queryKey: ['statement', familyId, year],
    queryFn: () => getStatement(familyId, year),
  });
  return (
    <PrintLayout title={`Statement ${year}`} loading={isLoading} error={error}>
      {data && <StatementSheet s={data} />}
    </PrintLayout>
  );
}

export function StatementsPrint() {
  const [params] = useSearchParams();
  const year = Number(params.get('year')) || thisYear();
  const { t } = useSettings();
  const { data, isLoading, error } = useQuery({
    queryKey: ['statements', year],
    queryFn: () => getStatements(year),
  });
  return (
    <PrintLayout
      title={`Statements ${year}${data ? ` (${data.length})` : ''}`}
      loading={isLoading}
      error={error}
      empty={data?.length === 0 && `No ${t('donations').toLowerCase()} were recorded in ${year}.`}
    >
      {data?.map((s) => (
        <StatementSheet key={s.family.id} s={s} />
      ))}
    </PrintLayout>
  );
}

/** Yahrzeit letters, one per page, worded by the "Yahrzeit reminder" email template. */
export function YahrzeitLettersPrint() {
  const [params] = useSearchParams();
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const longDate = useLongDate();
  const { data, isLoading, error } = useQuery({
    queryKey: ['yahrzeit-letters', from, to],
    queryFn: async () => {
      const notices = await getYahrzeitNotices(from, to);
      if (notices.length === 0) return { notices, messages: [] };
      const rendered = await sendEmails({
        template: 'yahrzeit',
        dryRun: true,
        recipients: notices.map((n) => ({
          familyId: n.family.id,
          importantDateId: n.date.id,
          occurrence: n.occurrence.nextOccurrence,
        })),
      });
      return { notices, messages: rendered.messages };
    },
  });
  return (
    <PrintLayout
      title={`Yahrzeit letters, ${from} to ${to}`}
      loading={isLoading}
      error={error}
      empty={data?.notices.length === 0 && 'No yahrzeits fall in these dates.'}
    >
      {data?.notices.map((n, i) => (
        <Page key={`${n.date.id}-${n.occurrence.nextOccurrence}`}>
          <Letterhead />
          <Typography sx={{ textAlign: 'right', mb: 2 }}>
            {longDate(new Date().toISOString().slice(0, 10))}
          </Typography>
          <AddressBlock name={n.greeting} lines={n.addressLines} />
          <Paragraphs text={data.messages[i]?.text ?? ''} />
        </Page>
      ))}
    </PrintLayout>
  );
}

/** A one-page list of the yahrzeits in a range, for the gabbai or the board. */
export function YahrzeitListPrint() {
  const [params] = useSearchParams();
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const { t } = useSettings();
  const longDate = useLongDate();
  const { data, isLoading, error } = useQuery({
    queryKey: ['yahrzeit-list', from, to],
    queryFn: () => getYahrzeitNotices(from, to),
  });
  return (
    <PrintLayout
      title="Yahrzeit list"
      loading={isLoading}
      error={error}
      empty={data?.length === 0 && 'No yahrzeits fall in these dates.'}
    >
      <Page>
        <Letterhead />
        <Typography sx={{ fontSize: 18, fontWeight: 700, mb: 2 }}>
          Yahrzeits, {from && longDate(from)} – {to && longDate(to)}
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={cell}>Date</TableCell>
              <TableCell sx={cell}>Hebrew date</TableCell>
              <TableCell sx={cell}>In memory of</TableCell>
              <TableCell sx={cell}>Mourner</TableCell>
              <TableCell sx={cell}>{t('family')}</TableCell>
              <TableCell sx={cell}>Phone</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data?.map((n) => (
              <TableRow key={`${n.date.id}-${n.occurrence.nextOccurrence}`}>
                <TableCell sx={cell}>{longDate(n.occurrence.nextOccurrence)}</TableCell>
                <TableCell sx={cell}>{n.hebrewDate}</TableCell>
                <TableCell sx={cell}>
                  {n.name}
                  {n.hebrewName ? ` (${n.hebrewName})` : ''}
                  {n.relationship ? `, ${n.relationship.toLowerCase()}` : ''}
                </TableCell>
                <TableCell sx={cell}>{`${n.member.firstName} ${n.member.lastName}`}</TableCell>
                <TableCell sx={cell}>{n.family.name}</TableCell>
                <TableCell sx={cell}>{n.family.phone ?? ''}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Page>
    </PrintLayout>
  );
}
