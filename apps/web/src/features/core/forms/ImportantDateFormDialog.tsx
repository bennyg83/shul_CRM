import { useEffect, useMemo } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { ImportantDate, ImportantDateInput, Member } from '@pilzno/shared';
import { createImportantDate, listMembers, updateImportantDate } from '@/features/core/service';
import { gregorianToHebrew, formatHebrew } from '@/features/core/hebrewDate';

const formSchema = z.object({
  memberId: z.string().min(1, 'Member is required'),
  type: z.enum(['birthday', 'yahrzeit', 'brit_mitzvah']),
  date: z.string().min(1, 'Date is required'),
  recurring: z.boolean().optional(),
  note: z.string().optional().or(z.literal('')),
});

type FormValues = z.infer<typeof formSchema>;

const emptyForm = (memberId: string): FormValues => ({
  memberId,
  type: 'birthday',
  date: '',
  recurring: false,
  note: '',
});

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial?: ImportantDate;
  /** Members offered in the select (usually the family's members). */
  members?: Member[];
  /** When set, the member is fixed (e.g. adding a date to a specific member). */
  fixedMemberId?: string;
}

export function ImportantDateFormDialog({ open, onClose, onSaved, initial, members, fixedMemberId }: Props) {
  const fixed = Boolean(fixedMemberId) && !initial;
  const { data: allMembers } = useQuery({
    queryKey: ['members'],
    queryFn: listMembers,
    enabled: open && !fixed && !members,
  });

  const memberOptions = useMemo<Member[]>(() => {
    if (members && members.length > 0) return members;
    return allMembers ?? [];
  }, [members, allMembers]);

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  const dateValue = useWatch({ control, name: 'date' });
  const hebrew = dateValue && /^\d{4}-\d{2}-\d{2}$/.test(dateValue) ? gregorianToHebrew(dateValue) : undefined;

  useEffect(() => {
    if (!open) return;
    if (initial) {
      reset({
        memberId: initial.memberId,
        type: initial.type,
        date: initial.date,
        recurring: initial.recurring ?? false,
        note: initial.note ?? '',
      });
    } else {
      reset(emptyForm(fixedMemberId ?? memberOptions[0]?.id ?? ''));
    }
  }, [open, initial, fixedMemberId, memberOptions, reset]);

  const mutation = useMutation({
    mutationFn: (input: ImportantDateInput) =>
      initial ? updateImportantDate(initial.id, input) : createImportantDate(input),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });

  const onSubmit = handleSubmit((values) => {
    const heb = /^\d{4}-\d{2}-\d{2}$/.test(values.date) ? gregorianToHebrew(values.date) : undefined;
    const input: ImportantDateInput = {
      memberId: values.memberId,
      type: values.type,
      date: values.date,
      hebrewDay: heb?.day,
      hebrewMonth: heb?.month,
      hebrewYear: heb?.year,
      recurring: values.recurring ?? undefined,
      note: values.note?.trim() || undefined,
    };
    mutation.mutate(input);
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{initial ? 'Edit Date' : 'New Date'}</DialogTitle>
      <form onSubmit={onSubmit} noValidate>
        <DialogContent dividers>
          <Stack spacing={2.5} sx={{ mt: 0.5 }}>
            {!fixed && (
              <FormControl>
                <FormLabel>Member</FormLabel>
                <Select {...register('memberId')}>
                  {memberOptions.map((m) => (
                    <MenuItem key={m.id} value={m.id}>
                      {m.firstName} {m.lastName}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            <FormControl>
              <FormLabel>Type</FormLabel>
              <Select {...register('type')}>
                <MenuItem value="birthday">Birthday</MenuItem>
                <MenuItem value="yahrzeit">Yahrzeit</MenuItem>
                <MenuItem value="brit_mitzvah">Bar / Bat Mitzvah</MenuItem>
              </Select>
            </FormControl>
            <Stack spacing={1}>
              <TextField
                label="Gregorian date"
                required
                type="date"
                InputLabelProps={{ shrink: true }}
                error={Boolean(errors.date)}
                helperText={errors.date?.message}
                {...register('date')}
              />
              <Typography variant="body2" color="text.secondary">
                Hebrew: {hebrew ? formatHebrew(hebrew.day, hebrew.month, hebrew.year) : '—'}
              </Typography>
            </Stack>
            <FormControlLabel
              control={<Checkbox {...register('recurring')} />}
              label="Repeats annually (e.g. birthday, yahrzeit)"
            />
            <TextField label="Note" multiline minRows={2} {...register('note')} />
            {mutation.isError && <Alert severity="error">{(mutation.error as Error).message}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={mutation.isPending}>
            {initial ? 'Save changes' : 'Create date'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
