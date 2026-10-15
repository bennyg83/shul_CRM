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
} from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CURRENCIES, CURRENCY_LABEL, formatMoney, type Donation, type DonationInput, type Pledge } from '@pilzno/shared';
import { createDonation, listFamilies, updateDonation } from '@/features/core/service';

const formSchema = z.object({
  familyId: z.string().min(1, 'Family is required'),
  fund: z.string().min(1, 'Fund is required'),
  pledgeId: z.string().optional().or(z.literal('')),
  amount: z.coerce.number().nonnegative('Amount must be 0 or more'),
  currency: z.enum(CURRENCIES).default('USD'),
  date: z.string().min(1, 'Date is required'),
  method: z.enum(['cash', 'check', 'credit', 'transfer']),
  note: z.string().optional().or(z.literal('')),
});

type FormValues = z.infer<typeof formSchema>;

const emptyForm = (familyId: string, fund: string, date: string): FormValues => ({
  familyId,
  fund,
  pledgeId: '',
  amount: 0,
  currency: 'USD',
  date,
  method: 'check',
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

export function DonationFormDialog({ open, onClose, onSaved, initial, pledges, fixedFamilyId, defaultFund }: Props) {
  const fixed = Boolean(fixedFamilyId) && !initial;
  const { data: families } = useQuery({
    queryKey: ['families'],
    queryFn: listFamilies,
    enabled: open && !fixed,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  useEffect(() => {
    if (!open) return;
    if (initial) {
      reset({
        familyId: initial.familyId,
        fund: initial.fund,
        pledgeId: initial.pledgeId ?? '',
        amount: initial.amount,
        currency: initial.currency ?? 'USD',
        date: initial.date,
        method: initial.method,
        note: initial.note ?? '',
      });
    } else {
      reset(
        emptyForm(
          fixedFamilyId ?? families?.[0]?.id ?? '',
          defaultFund ?? 'General',
          new Date().toISOString().slice(0, 10)
        )
      );
    }
  }, [open, initial, fixedFamilyId, families, defaultFund, reset]);

  const mutation = useMutation({
    mutationFn: (input: DonationInput) => (initial ? updateDonation(initial.id, input) : createDonation(input)),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });

  const onSubmit = handleSubmit((values) => {
    const input: DonationInput = {
      familyId: values.familyId,
      fund: values.fund.trim(),
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
      <DialogTitle>{initial ? 'Edit Donation' : 'New Donation'}</DialogTitle>
      <form onSubmit={onSubmit} noValidate>
        <DialogContent dividers>
          <Stack spacing={2.5} sx={{ mt: 0.5 }}>
            {!fixed && (
              <FormControl>
                <FormLabel>Family</FormLabel>
                <Select {...register('familyId')}>
                  {familyOptions.map((f) => (
                    <MenuItem key={f.id} value={f.id}>
                      {f.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            <TextField
              label="Fund"
              required
              error={Boolean(errors.fund)}
              helperText={errors.fund?.message}
              {...register('fund')}
            />
            {pledges && pledges.length > 0 && (
              <FormControl>
                <FormLabel>Link to pledge (optional)</FormLabel>
                <Select {...register('pledgeId')}>
                  <MenuItem value="">— Not linked —</MenuItem>
                  {pledges.map((p) => (
                    <MenuItem key={p.id} value={p.id}>
                      {`${p.fund} ${p.year} — ${formatMoney(p.amount, p.currency)}`}
                    </MenuItem>
                  ))}
                </Select>
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
              <FormControl sx={{ width: 150 }}>
                <FormLabel>Currency</FormLabel>
                <Select {...register('currency')}>
                  {CURRENCIES.map((c) => (
                    <MenuItem key={c} value={c}>
                      {CURRENCY_LABEL[c]}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl sx={{ flexGrow: 1 }}>
                <FormLabel>Method</FormLabel>
                <Select {...register('method')}>
                  <MenuItem value="cash">Cash</MenuItem>
                  <MenuItem value="check">Check</MenuItem>
                  <MenuItem value="credit">Credit</MenuItem>
                  <MenuItem value="transfer">Transfer</MenuItem>
                </Select>
              </FormControl>
            </Stack>
            <TextField label="Note" multiline minRows={2} {...register('note')} />
            {mutation.isError && <Alert severity="error">{(mutation.error as Error).message}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={mutation.isPending}>
            {initial ? 'Save changes' : 'Create donation'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
