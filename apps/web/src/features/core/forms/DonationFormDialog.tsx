import { useEffect, useMemo } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Donation, DonationInput, Pledge } from '@shulcrm/shared';
import { createDonation, listFamilies, updateDonation } from '@/features/core/service';
import { useSettings } from '@/features/settings/useSettings';
import { LookupSelect } from './LookupSelect';

const formSchema = z.object({
  familyId: z.string().min(1, 'Family is required'),
  fund: z.string().min(1, 'Fund is required'),
  pledgeId: z.string().optional().or(z.literal('')),
  amount: z.coerce.number().nonnegative('Amount must be 0 or more'),
  currency: z.string().min(1, 'Currency is required'),
  date: z.string().min(1, 'Date is required'),
  method: z.string().min(1, 'Method is required'),
  note: z.string().optional().or(z.literal('')),
});

type FormValues = z.infer<typeof formSchema>;

const emptyForm = (
  familyId: string,
  fund: string,
  currency: string,
  method: string,
  date: string,
): FormValues => ({
  familyId,
  fund,
  pledgeId: '',
  amount: 0,
  currency,
  date,
  method,
  note: '',
});

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial?: Donation;
  /** Pledges offered in the "Link to pledge" select (usually the family's pledges). */
  pledges?: Pledge[];
  /** When set, the family is fixed (e.g. adding a donation to a specific family). */
  fixedFamilyId?: string;
  /** Default fund label (usually a common fund). */
  defaultFund?: string;
}

export function DonationFormDialog({
  open,
  onClose,
  onSaved,
  initial,
  pledges,
  fixedFamilyId,
  defaultFund,
}: Props) {
  const fixed = Boolean(fixedFamilyId) && !initial;
  const settings = useSettings();
  const { t, money } = settings;
  const firstActive = (
    items: ReadonlyArray<{ key: string; active: boolean }>,
    preferred?: string,
  ) =>
    items.find((i) => i.active && i.key === preferred)?.key ??
    items.find((i) => i.active)?.key ??
    '';
  const defaults = {
    fund: firstActive(settings.lookups.funds, defaultFund ?? 'General'),
    currency: firstActive(settings.lookups.currencies, settings.org.defaultCurrency),
    method: firstActive(settings.lookups.paymentMethods, 'check'),
  };
  const { data: families } = useQuery({
    queryKey: ['families'],
    queryFn: listFamilies,
    enabled: open && !fixed,
  });

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });
  // Only the chosen family's pledges can be linked.
  const familyIdValue = useWatch({ control, name: 'familyId' });
  const familyPledges = (pledges ?? []).filter((p) => p.familyId === familyIdValue);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      reset({
        familyId: initial.familyId,
        fund: initial.fund,
        pledgeId: initial.pledgeId ?? '',
        amount: initial.amount,
        currency: initial.currency ?? defaults.currency,
        date: initial.date,
        method: initial.method,
        note: initial.note ?? '',
      });
    } else {
      reset(
        emptyForm(
          fixedFamilyId ?? families?.[0]?.id ?? '',
          defaults.fund,
          defaults.currency,
          defaults.method,
          new Date().toISOString().slice(0, 10),
        ),
      );
    }
  }, [
    open,
    initial,
    fixedFamilyId,
    families,
    defaults.fund,
    defaults.currency,
    defaults.method,
    reset,
  ]);

  const mutation = useMutation({
    mutationFn: (input: DonationInput) =>
      initial ? updateDonation(initial.id, input) : createDonation(input),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });

  const onSubmit = handleSubmit((values) => {
    const input: DonationInput = {
      familyId: values.familyId,
      fund: values.fund,
      pledgeId: values.pledgeId || undefined,
      amount: values.amount,
      currency: values.currency,
      date: values.date,
      method: values.method,
      note: values.note?.trim() || undefined,
    };
    mutation.mutate(input);
  });

  const familyOptions = useMemo(() => families ?? [], [families]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{`${initial ? 'Edit' : 'New'} ${t('donation')}`}</DialogTitle>
      <form onSubmit={onSubmit} noValidate>
        <DialogContent dividers>
          <Stack spacing={2.5} sx={{ mt: 0.5 }}>
            {!fixed && (
              <FormControl error={Boolean(errors.familyId)}>
                <FormLabel>{t('family')}</FormLabel>
                <Controller
                  name="familyId"
                  control={control}
                  render={({ field }) => (
                    <Select {...field} value={field.value ?? ''}>
                      {familyOptions.map((f) => (
                        <MenuItem key={f.id} value={f.id}>
                          {f.name}
                        </MenuItem>
                      ))}
                    </Select>
                  )}
                />
                {errors.familyId && (
                  <Typography variant="caption" color="error">
                    {errors.familyId.message}
                  </Typography>
                )}
              </FormControl>
            )}
            <LookupSelect
              control={control}
              name="fund"
              label="Fund"
              kind="funds"
              error={errors.fund?.message}
            />
            {settings.features.pledges && familyPledges.length > 0 && (
              <FormControl>
                <FormLabel>{`Link to ${t('pledge').toLowerCase()} (optional)`}</FormLabel>
                <Controller
                  name="pledgeId"
                  control={control}
                  render={({ field }) => (
                    <Select {...field} value={field.value ?? ''}>
                      <MenuItem value="">— Not linked —</MenuItem>
                      {familyPledges.map((p) => (
                        <MenuItem key={p.id} value={p.id}>
                          {`${settings.label('funds', p.fund)} ${p.year} — ${money(p.amount, p.currency)}`}
                        </MenuItem>
                      ))}
                    </Select>
                  )}
                />
              </FormControl>
            )}
            <Stack direction="row" spacing={2}>
              <TextField
                label="Amount"
                required
                type="number"
                sx={{ flexGrow: 1 }}
                error={Boolean(errors.amount)}
                helperText={errors.amount?.message}
                {...register('amount')}
              />
              <TextField
                label="Date"
                required
                type="date"
                sx={{ flexGrow: 1 }}
                InputLabelProps={{ shrink: true }}
                error={Boolean(errors.date)}
                helperText={errors.date?.message}
                {...register('date')}
              />
            </Stack>
            <Stack direction="row" spacing={2}>
              <LookupSelect
                control={control}
                name="currency"
                label="Currency"
                kind="currencies"
                error={errors.currency?.message}
                sx={{ width: 150 }}
              />
              <LookupSelect
                control={control}
                name="method"
                label="Method"
                kind="paymentMethods"
                error={errors.method?.message}
                sx={{ flexGrow: 1 }}
              />
            </Stack>
            <TextField label="Note" multiline minRows={2} {...register('note')} />
            {mutation.isError && (
              <Alert severity="error">{(mutation.error as Error).message}</Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={mutation.isPending}>
            {initial ? 'Save changes' : `Create ${t('donation').toLowerCase()}`}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
