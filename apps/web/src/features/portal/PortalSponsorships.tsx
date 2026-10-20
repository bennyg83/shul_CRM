import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { todayISO, type SponsorshipSummary } from '@shulcrm/shared';
import { claimSponsorship, listPortalSponsorships, releaseMyClaim } from '@/features/core/service';
import { useSettings } from '@/features/settings/useSettings';
import { portalKeys, useDateFormat, usePortalHome } from './usePortalData';

const claimFormSchema = z.object({
  dedication: z.string().max(300, 'Please keep this a little shorter').optional(),
  amount: z
    .string()
    .refine(
      (value) => value === '' || Number(value) >= 0,
      'Please give an amount, or leave it empty',
    ),
});

type ClaimFormValues = z.infer<typeof claimFormSchema>;

const placesLeft = (remaining: number) => {
  if (remaining <= 0) return 'All places taken';
  return remaining === 1 ? 'One place left' : `${remaining} places left`;
};

export function PortalSponsorships() {
  const settings = useSettings();
  const formatDate = useDateFormat();
  const queryClient = useQueryClient();
  const { data: home } = usePortalHome();
  const [claiming, setClaiming] = useState<SponsorshipSummary | null>(null);
  const [releasing, setReleasing] = useState<{ claimId: string; title: string } | null>(null);

  const {
    data: sponsorships,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: portalKeys.sponsorships,
    // Only what is still to come: a past date is nothing a family can take on.
    queryFn: () => listPortalSponsorships(todayISO()),
  });

  const release = useMutation({
    mutationFn: (claimId: string) => releaseMyClaim(claimId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: portalKeys.sponsorships });
      await queryClient.invalidateQueries({ queryKey: portalKeys.account });
      setReleasing(null);
    },
  });

  /** Our own claim on a sponsorship. The API names only our family's claims, never anyone else's. */
  const myClaim = (sponsorship: SponsorshipSummary) =>
    sponsorship.claims.find((claim) => claim.familyId === home?.family.id);

  if (isPending) {
    return (
      <Stack alignItems="center" sx={{ py: 6 }}>
        <CircularProgress aria-label="Loading what can be sponsored" />
      </Stack>
    );
  }

  if (isError || !sponsorships) {
    return (
      <Alert severity="warning">
        {error instanceof Error
          ? error.message
          : 'We could not load this just now. Please try again in a moment.'}
      </Alert>
    );
  }

  const canEdit = home?.canEdit ?? false;
  const upcoming = [...sponsorships].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h6">Sponsor something</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          A kiddush, a seudah or another occasion you would like to sponsor. Choose one and the
          office will be in touch.
        </Typography>
      </Box>

      {upcoming.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          Nothing is open for sponsorship at the moment. Please look again soon.
        </Typography>
      )}

      {upcoming.map((sponsorship) => {
        const mine = myClaim(sponsorship);
        const takeable = canEdit && !mine && sponsorship.open && sponsorship.remaining > 0;
        return (
          <Paper key={sponsorship.id} variant="outlined" sx={{ p: { xs: 2, sm: 2.5 } }}>
            <Stack spacing={1.5}>
              <Box>
                <Stack
                  direction="row"
                  spacing={1}
                  useFlexGap
                  flexWrap="wrap"
                  sx={{ alignItems: 'center' }}
                >
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    {sponsorship.title}
                  </Typography>
                  {mine && <Chip size="small" color="success" label="You are sponsoring this" />}
                  {!mine && (
                    <Chip
                      size="small"
                      variant="outlined"
                      label={placesLeft(sponsorship.remaining)}
                    />
                  )}
                  {!sponsorship.open && <Chip size="small" variant="outlined" label="Closed" />}
                </Stack>
                <Typography variant="body2">{formatDate(sponsorship.date)}</Typography>
              </Box>

              {sponsorship.suggestedAmount !== undefined && (
                <Typography variant="body2" color="text.secondary">
                  Suggested amount{' '}
                  {settings.money(sponsorship.suggestedAmount, sponsorship.currency)}
                </Typography>
              )}

              {sponsorship.note && <Typography variant="body2">{sponsorship.note}</Typography>}

              {mine && (
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    {mine.dedication
                      ? `Your dedication: ${mine.dedication}`
                      : 'You have not added a dedication.'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {settings.money(mine.amount, mine.currency)}
                  </Typography>
                </Box>
              )}

              <Stack direction="row" spacing={1}>
                {takeable && (
                  <Button
                    variant="contained"
                    onClick={() => setClaiming(sponsorship)}
                    aria-label={`Sponsor ${sponsorship.title} on ${formatDate(sponsorship.date)}`}
                  >
                    Sponsor this
                  </Button>
                )}
                {mine && canEdit && (
                  <Button
                    variant="outlined"
                    onClick={() => setReleasing({ claimId: mine.id, title: sponsorship.title })}
                    aria-label={`Give back ${sponsorship.title} on ${formatDate(sponsorship.date)}`}
                  >
                    Give this back
                  </Button>
                )}
              </Stack>
            </Stack>
          </Paper>
        );
      })}

      <ClaimDialog
        sponsorship={claiming}
        onClose={() => setClaiming(null)}
        dateLabel={claiming ? formatDate(claiming.date) : ''}
      />

      <Dialog open={releasing !== null} onClose={() => setReleasing(null)} fullWidth maxWidth="xs">
        <DialogTitle>Give this back?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {releasing ? `${releasing.title} will become free for another family to take on.` : ''}
          </DialogContentText>
          {release.isError && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              {release.error instanceof Error
                ? release.error.message
                : 'That could not be done just now. Please contact the office.'}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setReleasing(null)}>Keep it</Button>
          <Button
            variant="contained"
            disabled={release.isPending}
            onClick={() => releasing && release.mutate(releasing.claimId)}
          >
            Give it back
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function ClaimDialog({
  sponsorship,
  dateLabel,
  onClose,
}: {
  sponsorship: SponsorshipSummary | null;
  dateLabel: string;
  onClose: () => void;
}) {
  const settings = useSettings();
  const queryClient = useQueryClient();
  const open = sponsorship !== null;
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ClaimFormValues>({ resolver: zodResolver(claimFormSchema) });

  useEffect(() => {
    if (!sponsorship) return;
    reset({
      dedication: '',
      amount: sponsorship.suggestedAmount === undefined ? '' : String(sponsorship.suggestedAmount),
    });
  }, [sponsorship, reset]);

  const claim = useMutation({
    mutationFn: (values: ClaimFormValues) =>
      claimSponsorship(sponsorship?.id ?? '', {
        dedication: values.dedication?.trim() || undefined,
        amount: values.amount === '' ? undefined : Number(values.amount),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: portalKeys.sponsorships });
      await queryClient.invalidateQueries({ queryKey: portalKeys.account });
      onClose();
    },
    // Someone else may have taken the last place: the list is refreshed so the page agrees
    // with the answer the member has just been given.
    onError: () => void queryClient.invalidateQueries({ queryKey: portalKeys.sponsorships }),
  });

  const onSubmit = handleSubmit((values) => claim.mutate(values));
  const currencyLabel = sponsorship
    ? (settings.lookups.currencies.find((c) => c.key === sponsorship.currency)?.symbol ??
      sponsorship.currency)
    : '';

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{sponsorship ? `Sponsor ${sponsorship.title}` : 'Sponsor'}</DialogTitle>
      <form onSubmit={onSubmit} noValidate>
        <DialogContent dividers>
          <Stack spacing={2.5} sx={{ mt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              {dateLabel}
            </Typography>
            <TextField
              label="Dedication"
              placeholder="In memory of…"
              multiline
              minRows={2}
              error={Boolean(errors.dedication)}
              helperText={
                errors.dedication?.message ?? 'If you would like something said, add it here.'
              }
              {...register('dedication')}
            />
            <TextField
              label="Amount"
              type="number"
              inputProps={{ min: 0, step: '1' }}
              InputProps={{
                startAdornment: <InputAdornment position="start">{currencyLabel}</InputAdornment>,
              }}
              error={Boolean(errors.amount)}
              helperText={errors.amount?.message}
              {...register('amount')}
            />
            {claim.isError && (
              <Alert severity="warning">
                {claim.error instanceof Error
                  ? claim.error.message
                  : 'That could not be taken on just now. Please try again.'}
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={claim.isPending}>
            Sponsor this
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
