import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  sponsorshipInputSchema,
  todayISO,
  type SponsorshipInput,
  type SponsorshipSummary,
} from '@shulcrm/shared';
import {
  createSponsorship,
  deleteSponsorship,
  listSponsorships,
  releaseClaim,
  updateSponsorship,
} from '@/features/core/service';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { LookupSelect } from '@/features/core/forms/LookupSelect';
import { useSettings } from '@/features/settings/useSettings';
import { useLongDate } from '@/features/print/useLongDate';

type Claim = SponsorshipSummary['claims'][number];

/** What a number box holds, as the shared schema wants it: a real number, or nothing. */
const toNumberOrUndefined = (value: unknown) => {
  if (value === '' || value === null || value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

function SponsorshipFormDialog({
  open,
  onClose,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  initial?: SponsorshipSummary;
}) {
  const queryClient = useQueryClient();
  const settings = useSettings();
  const { control, register, handleSubmit, reset, formState } = useForm<SponsorshipInput>({
    resolver: zodResolver(sponsorshipInputSchema),
  });
  useEffect(() => {
    if (!open) return;
    reset({
      title: initial?.title ?? '',
      date: initial?.date ?? todayISO(),
      fund: initial?.fund ?? '',
      suggestedAmount: initial?.suggestedAmount,
      currency: initial?.currency ?? settings.org.defaultCurrency,
      maxSponsors: initial?.maxSponsors ?? 1,
      note: initial?.note ?? '',
      open: initial?.open ?? true,
    });
  }, [open, initial, reset, settings]);

  const save = useMutation({
    mutationFn: (input: SponsorshipInput) =>
      initial ? updateSponsorship(initial.id, input) : createSponsorship(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sponsorships'] });
      onClose();
    },
  });
  const onSubmit = handleSubmit((v) =>
    save.mutate({
      ...v,
      title: v.title.trim(),
      note: v.note?.trim() || undefined,
    }),
  );
  const e = formState.errors;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{initial ? 'Edit sponsorship' : 'New sponsorship'}</DialogTitle>
      <form onSubmit={onSubmit} noValidate>
        <DialogContent dividers>
          <Stack spacing={2}>
            <TextField
              label="Title"
              required
              error={Boolean(e.title)}
              helperText={e.title?.message}
              {...register('title')}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Date"
                type="date"
                required
                InputLabelProps={{ shrink: true }}
                error={Boolean(e.date)}
                helperText={e.date?.message}
                sx={{ flexGrow: 1 }}
                {...register('date')}
              />
              <LookupSelect
                control={control}
                name="fund"
                label="Fund"
                kind="funds"
                emptyLabel="— Choose —"
                error={e.fund?.message}
                sx={{ minWidth: 200 }}
              />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Suggested amount"
                type="number"
                inputProps={{ min: 0, step: 'any' }}
                error={Boolean(e.suggestedAmount)}
                helperText={e.suggestedAmount?.message ?? 'Leave empty to let families choose'}
                sx={{ flexGrow: 1 }}
                // The field is optional in the schema, so an empty or unreadable box has to come
                // through as nothing at all — a NaN would fail validation with a puzzling message.
                {...register('suggestedAmount', { setValueAs: toNumberOrUndefined })}
              />
              <LookupSelect
                control={control}
                name="currency"
                label="Currency"
                kind="currencies"
                error={e.currency?.message}
                sx={{ minWidth: 160 }}
              />
            </Stack>
            <TextField
              label="How many families may share it"
              type="number"
              inputProps={{ min: 1, max: 20, step: 1 }}
              error={Boolean(e.maxSponsors)}
              helperText={e.maxSponsors?.message ?? 'One unless you allow co-sponsors'}
              sx={{ width: 280 }}
              // Cleared or unreadable reads as missing, so the schema asks for a number
              // instead of complaining about a NaN.
              {...register('maxSponsors', { setValueAs: toNumberOrUndefined })}
            />
            <TextField
              label="Note"
              multiline
              minRows={2}
              error={Boolean(e.note)}
              helperText={e.note?.message}
              {...register('note')}
            />
            <Controller
              name="open"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={
                    <Switch
                      checked={Boolean(field.value)}
                      onChange={(ev) => field.onChange(ev.target.checked)}
                    />
                  }
                  label="Open for sponsorship"
                />
              )}
            />
            {save.isError && <Alert severity="error">{(save.error as Error).message}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {initial ? 'Save changes' : 'Create sponsorship'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

/** Mounted per sponsorship (keyed by id), so one row's release error never greets the next. */
function SponsorshipDetailDialog({
  sponsorship,
  onClose,
}: {
  sponsorship: SponsorshipSummary;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { t, money, label } = useSettings();
  const longDate = useLongDate();
  const [pendingRelease, setPendingRelease] = useState<Claim | null>(null);

  const release = useMutation({
    mutationFn: (claimId: string) => releaseClaim(claimId),
    onSuccess: () => {
      // Releasing deletes the pledge too, so the money pages have to refetch as well.
      void queryClient.invalidateQueries({ queryKey: ['sponsorships'] });
      void queryClient.invalidateQueries({ queryKey: ['pledges'] });
    },
  });
  const claims = sponsorship.claims;

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{sponsorship.title}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography>
            {longDate(sponsorship.date)} · {label('funds', sponsorship.fund)}
            {sponsorship.suggestedAmount !== undefined &&
              ` · suggested ${money(sponsorship.suggestedAmount, sponsorship.currency)}`}
          </Typography>
          {sponsorship.note && <Typography color="text.secondary">{sponsorship.note}</Typography>}
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip color="success" label={`${claims.length} of ${sponsorship.maxSponsors} taken`} />
            <Chip
              label={`${sponsorship.remaining} place${sponsorship.remaining === 1 ? '' : 's'} left`}
            />
            {!sponsorship.open && <Chip color="warning" label="Closed" />}
          </Stack>

          {release.isError && <Alert severity="error">{(release.error as Error).message}</Alert>}

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('family')}</TableCell>
                <TableCell>Dedication</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>Taken</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {claims.map((c) => {
                const whoTookIt = c.familyName ?? `this ${t('family').toLowerCase()}`;
                return (
                  <TableRow key={c.id}>
                    <TableCell>{c.familyName ?? '—'}</TableCell>
                    <TableCell>{c.dedication ?? '—'}</TableCell>
                    <TableCell align="right">
                      {money(c.amount, c.currency)}
                      {c.paid > 0 && (
                        <Typography variant="caption" color="success.main" display="block">
                          {money(c.paid, c.currency)} paid
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {new Date(c.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell align="right">
                      {/* The tooltip has to sit on a wrapper: a disabled button fires no hover events. */}
                      <Tooltip
                        title={
                          c.paid > 0
                            ? 'Already partly paid, so the office needs to undo the payment first'
                            : ''
                        }
                      >
                        <Box component="span">
                          <Button
                            variant="text"
                            size="small"
                            color="error"
                            disabled={release.isPending || c.paid > 0}
                            aria-label={`Release the sponsorship taken by ${whoTookIt}`}
                            onClick={() => setPendingRelease(c)}
                          >
                            Release
                          </Button>
                        </Box>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
              {claims.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} sx={{ color: 'text.secondary' }}>
                    Nobody has taken this one yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button variant="text" onClick={onClose}>
          Close
        </Button>
      </DialogActions>
      <ConfirmDialog
        open={pendingRelease !== null}
        title="Release this sponsorship"
        message={`${pendingRelease?.familyName ?? `This ${t('family').toLowerCase()}`} will no longer have this sponsorship, and the ${t('pledge').toLowerCase()} it created will be removed with it. If anything has already been paid towards it, the release is refused and nothing changes.`}
        confirmLabel="Release"
        onConfirm={() => {
          if (pendingRelease) release.mutate(pendingRelease.id);
          setPendingRelease(null);
        }}
        onClose={() => setPendingRelease(null)}
      />
    </Dialog>
  );
}

export function SponsorshipsPage() {
  const queryClient = useQueryClient();
  const { t, money, label } = useSettings();
  const longDate = useLongDate();
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming');
  const today = todayISO();
  const { data, isLoading, error } = useQuery({
    queryKey: ['sponsorships', 'summary'],
    queryFn: () => listSponsorships(),
  });
  const [form, setForm] = useState<{ open: boolean; initial?: SponsorshipSummary }>({
    open: false,
  });
  const [detailId, setDetailId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SponsorshipSummary | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => deleteSponsorship(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sponsorships'] });
      void queryClient.invalidateQueries({ queryKey: ['pledges'] });
    },
  });

  const shown = (data ?? [])
    .filter((s) => (when === 'upcoming' ? s.date >= today : s.date < today))
    .sort((a, b) =>
      when === 'upcoming' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date),
    );
  // Read the open row back out of the list, so a release shows up without a second request.
  const detail = (data ?? []).find((s) => s.id === detailId) ?? null;

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
          <Typography variant="h5">Sponsorships</Typography>
          <Typography variant="body2" color="text.secondary">
            Kiddushim, seudos and anything else a {t('family').toLowerCase()} can sponsor. When a{' '}
            {t('family').toLowerCase()} takes one on, the shul records a {t('pledge').toLowerCase()}{' '}
            for the amount, so it appears alongside everything else they owe.
          </Typography>
        </Box>
        <Button startIcon={<AddIcon />} onClick={() => setForm({ open: true })}>
          New sponsorship
        </Button>
      </Stack>
      <Card>
        <CardContent>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={when}
            onChange={(_, v) => v && setWhen(v)}
            aria-label="Which sponsorships to show"
            sx={{ mb: 2 }}
          >
            <ToggleButton value="upcoming">Upcoming</ToggleButton>
            <ToggleButton value="past">Past</ToggleButton>
          </ToggleButtonGroup>
          {error && <Alert severity="error">{(error as Error).message}</Alert>}
          {remove.isError && <Alert severity="error">{(remove.error as Error).message}</Alert>}
          {isLoading && <Typography color="text.secondary">Loading…</Typography>}
          {!isLoading && shown.length === 0 && (
            <Typography color="text.secondary">
              {when === 'upcoming' ? 'Nothing coming up to sponsor.' : 'No past sponsorships.'}
            </Typography>
          )}
          {shown.length > 0 && (
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>What</TableCell>
                    <TableCell>Fund</TableCell>
                    <TableCell align="right">Suggested</TableCell>
                    <TableCell align="right">Taken</TableCell>
                    <TableCell>Open</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {shown.map((s) => (
                    <TableRow
                      key={s.id}
                      hover
                      sx={{ cursor: 'pointer' }}
                      onClick={() => setDetailId(s.id)}
                    >
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{longDate(s.date)}</TableCell>
                      <TableCell>{s.title}</TableCell>
                      <TableCell>{label('funds', s.fund)}</TableCell>
                      <TableCell align="right">
                        {s.suggestedAmount === undefined
                          ? '—'
                          : money(s.suggestedAmount, s.currency)}
                      </TableCell>
                      <TableCell align="right">
                        {s.claims.length} of {s.maxSponsors}
                      </TableCell>
                      <TableCell>
                        {s.open ? (
                          <Chip
                            size="small"
                            color={s.remaining > 0 ? 'success' : 'default'}
                            label={s.remaining > 0 ? 'Open' : 'Full'}
                          />
                        ) : (
                          <Chip size="small" color="warning" label="Closed" />
                        )}
                      </TableCell>
                      <TableCell align="right" onClick={(ev) => ev.stopPropagation()}>
                        <IconButton
                          size="small"
                          aria-label={`Edit ${s.title}`}
                          onClick={() => setForm({ open: true, initial: s })}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          aria-label={`Delete ${s.title}`}
                          onClick={() => setPendingDelete(s)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </CardContent>
      </Card>
      <SponsorshipFormDialog
        open={form.open}
        initial={form.initial}
        onClose={() => setForm({ open: false })}
      />
      {detail && (
        <SponsorshipDetailDialog
          key={detail.id}
          sponsorship={detail}
          onClose={() => setDetailId(null)}
        />
      )}
      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete ${pendingDelete?.title ?? 'sponsorship'}`}
        message={`The sponsorship goes, and so does every claim on it — the ${t('family').toLowerCase()} names, their dedications and the ${t('pledge').toLowerCase()}s they created. This cannot be undone.`}
        onConfirm={() => {
          if (pendingDelete) remove.mutate(pendingDelete.id);
          setPendingDelete(null);
        }}
        onClose={() => setPendingDelete(null)}
      />
    </Box>
  );
}
