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
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CURRENCIES, CURRENCY_LABEL, type Pledge, type PledgeInput } from '@pilzno/shared';
import { createPledge, listFamilies, updatePledge } from '@/features/core/service';

const formSchema = z.object({
  fund: z.string().min(1, 'Fund is required'),
  type: z.enum(['annual', 'one_time']).optional().or(z.literal('')),
  familyId: z.string().min(1, 'Family is required'),
  year: z.coerce.number().int('Year must be a whole number'),
  dueDate: z.string().optional().or(z.literal('')),
  amount: z.coerce.number().nonnegative('Amount must be 0 or more'),
  currency: z.enum(CURRENCIES).default('USD'),
});

type FormValues = z.infer<typeof formSchema>;

const emptyForm = (familyId: string): FormValues => ({
  fund: 'General',
  type: 'annual',
  familyId,
  year: new Date().getFullYear(),
  dueDate: '',
  amount: 0,
  currency: 'USD',
});

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial?: Pledge;
  /** When set, the family is fixed (e.g. adding a pledge to a specific family). */
  fixedFamilyId?: string;
}

export function PledgeFormDialog({ open, onClose, onSaved, initial, fixedFamilyId }: Props) {
  const fixed = Boolean(fixedFamilyId) && !initial;
  const { data: families } = useQuery({
    queryKey: ['families'],
    queryFn: listFamilies,
    enabled: open && !fixed,
  });

  const defaultFamilyId = fixedFamilyId ?? families?.[0]?.id ?? '';

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: emptyForm(defaultFamilyId) });

  useEffect(() => {
    if (!open) return;
    if (initial) {
      reset({
        fund: initial.fund,
        type: initial.type ?? '',
        familyId: initial.familyId,
        year: initial.year,
        dueDate: initial.dueDate ?? '',
        amount: initial.amount,
        currency: initial.currency ?? 'USD',
      });
    } else {
      reset(emptyForm(fixedFamilyId ?? families?.[0]?.id ?? ''));
    }
  }, [open, initial, fixedFamilyId, families, reset]);

  const mutation = useMutation({
    mutationFn: (input: PledgeInput) => (initial ? updatePledge(initial.id, input) : createPledge(input)),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });

  const onSubmit = handleSubmit((values) => {
    const input: PledgeInput = {
      fund: values.fund.trim(),
      type: values.type || undefined,
      familyId: values.familyId,
      year: values.year,
      dueDate: values.dueDate || undefined,
      amount: values.amount,
      currency: values.currency,
    };
    mutation.mutate(input);
  });

  const familyOptions = useMemo(() => families ?? [], [families]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{initial ? 'Edit Pledge' : 'New Pledge'}</DialogTitle>
      <form onSubmit={onSubmit} noValidate>
        <DialogContent dividers>
          <Stack spacing={2.5} sx={{ mt: 0.5 }}>
            {!fixed && (
              <FormControl error={Boolean(errors.familyId)}>
                <FormLabel>Family</FormLabel>
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
            <TextField
              label="Fund"
              required
              error={Boolean(errors.fund)}
              helperText={errors.fund?.message}
              {...register('fund')}
            />
            <FormControl>
              <FormLabel>Type</FormLabel>
              <Controller
                name="type"
                control={control}
                render={({ field }) => (
                  <Select {...field} value={field.value ?? ''}>
                    <MenuItem value="">—</MenuItem>
                    <MenuItem value="annual">Annual</MenuItem>
                    <MenuItem value="one_time">One-time</MenuItem>
                  </Select>
                )}
              />
            </FormControl>
            <Stack direction="row" spacing={2}>
              <TextField
                label="Year"
                required
                type="number"
                sx={{ flexGrow: 1 }}
                error={Boolean(errors.year)}
                helperText={errors.year?.message}
                {...register('year')}
              />
              <TextField
                label="Due date"
                type="date"
                sx={{ flexGrow: 1 }}
                InputLabelProps={{ shrink: true }}
                {...register('dueDate')}
              />
            </Stack>
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
              <FormControl sx={{ width: 150 }}>
                <FormLabel>Currency</FormLabel>
                <Controller
                  name="currency"
                  control={control}
                  render={({ field }) => (
                    <Select {...field} value={field.value ?? ''}>
                      {CURRENCIES.map((c) => (
                        <MenuItem key={c} value={c}>
                          {CURRENCY_LABEL[c]}
                        </MenuItem>
                      ))}
                    </Select>
                  )}
                />
              </FormControl>
            </Stack>
            {mutation.isError && <Alert severity="error">{(mutation.error as Error).message}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={mutation.isPending}>
            {initial ? 'Save changes' : 'Create pledge'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
