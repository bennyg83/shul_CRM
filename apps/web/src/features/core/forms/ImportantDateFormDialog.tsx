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
  Radio,
  RadioGroup,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { formatHebrew, gregorianToHebrew } from '@pilzno/shared';
import type { ImportantDate, ImportantDateInput, Member } from '@pilzno/shared';
import { createImportantDate, listMembers, updateImportantDate } from '@/features/core/service';

const formSchema = z.object({
  memberId: z.string().min(1, 'Member is required'),
  type: z.enum(['birthday', 'yahrzeit', 'bar_mitzvah', 'bat_mitzvah', 'anniversary', "seuda_hoda'a"]),
  date: z.string().min(1, 'Date is required'),
  // The Hebrew day starts at nightfall, so one English date can be two Hebrew dates.
  timeOfDay: z
    .enum(['', 'day', 'night'])
    .refine((v): boolean => v !== '', 'Choose whether this was before or after nightfall'),
  recurring: z.boolean().optional(),
  note: z.string().optional().or(z.literal('')),
});

type FormValues = z.infer<typeof formSchema>;

const emptyForm = (memberId: string): FormValues => ({
  memberId,
  type: 'birthday',
  date: '',
  timeOfDay: '',
  recurring: false,
  note: '',
});

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial?: ImportantDate;
  members?: Member[];
  fixedMemberId?: string;
}

/** Calculate event date from birthdate + age (13 for male, 12 for female). */
function calculateEventFromBirthdate(birthdate: string, gender?: 'male' | 'female'): string {
  const [y, m, d] = birthdate.split('-').map(Number);
  const birthYear = y;
  const eventYear = birthYear + (gender === 'female' ? 12 : 13);
  return `${eventYear}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
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
    setValue,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  const dateValue = useWatch({ control, name: 'date' });
  const memberValue = useWatch({ control, name: 'memberId' });

  useEffect(() => {
    if (open && !initial) {
      reset(emptyForm(fixedMemberId ?? memberOptions[0]?.id ?? ''));
    } else if (initial) {
      reset({
        memberId: initial.memberId,
        type: initial.type as FormValues['type'],
        date: initial.date,
        // Older dates never recorded this; leave it unanswered so the user must choose.
        timeOfDay: initial.afterNightfall === undefined ? '' : initial.afterNightfall ? 'night' : 'day',
        recurring: initial.recurring ?? false,
        note: initial.note ?? '',
      });
    }
  }, [open, initial, fixedMemberId, memberOptions, reset]);

  useEffect(() => {
    // For new birthday entries, auto-calculate from birthdate + age
    if (!initial && !open) return;
    const member = memberOptions.find((m) => m.id === memberValue);
    if (member?.birthDate && dateValue === '') {
      const birthGender = member.gender === 'other' ? undefined : member.gender;
      const calculatedDate = calculateEventFromBirthdate(member.birthDate, birthGender);
      // Only fill the date: a full reset would also wipe the type and nightfall answers.
      setValue('date', calculatedDate);
    }
  }, [open, initial, memberValue, dateValue, memberOptions, setValue]);

  // Show the Hebrew date each answer produces, so the choice is concrete.
  const validDate = Boolean(dateValue) && /^\d{4}-\d{2}-\d{2}$/.test(dateValue);
  const hebrewLabel = (afterNightfall: boolean) => {
    if (!validDate) return '';
    const h = gregorianToHebrew(dateValue, { afterNightfall });
    return ` → ${formatHebrew(h.day, h.month, h.year)}`;
  };

  const mutation = useMutation({
    mutationFn: (input: ImportantDateInput) =>
      initial ? updateImportantDate(initial.id, input) : createImportantDate(input),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });

  const onSubmit = handleSubmit((values) => {
    const afterNightfall = values.timeOfDay === 'night';
    const heb = /^\d{4}-\d{2}-\d{2}$/.test(values.date)
      ? gregorianToHebrew(values.date, { afterNightfall })
      : undefined;
    const input: ImportantDateInput = {
      memberId: values.memberId,
      type: values.type as ImportantDate['type'],
      date: values.date,
      afterNightfall,
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
                <MenuItem value="birthday">Birthday (age 13 male / age 12 female)</MenuItem>
                <MenuItem value="yahrzeit">Yahrzeit (Memorial)</MenuItem>
                <MenuItem value="bar_mitzvah">Bar Mitzvah</MenuItem>
                <MenuItem value="bat_mitzvah">Bat Mitzvah</MenuItem>
                <MenuItem value="anniversary">Anniversary</MenuItem>
                <MenuItem value="seuda_hoda'a">Seuda Hoda&apos;a (Thanksgiving Meal)</MenuItem>
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
              <FormControl error={Boolean(errors.timeOfDay)}>
                <FormLabel>Was this before or after nightfall?</FormLabel>
                <Controller
                  name="timeOfDay"
                  control={control}
                  render={({ field }) => (
                    <RadioGroup {...field}>
                      <FormControlLabel
                        value="day"
                        control={<Radio size="small" />}
                        label={`Before nightfall (daytime)${hebrewLabel(false)}`}
                      />
                      <FormControlLabel
                        value="night"
                        control={<Radio size="small" />}
                        label={`After nightfall (evening)${hebrewLabel(true)}`}
                      />
                    </RadioGroup>
                  )}
                />
                {errors.timeOfDay && (
                  <Typography variant="caption" color="error">
                    {errors.timeOfDay.message}
                  </Typography>
                )}
              </FormControl>
            </Stack>
            <FormControlLabel
              control={<Checkbox {...register('recurring')} />}
              label="Repeats annually (e.g. birthday, yahrzeit, anniversary)"
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
