import { useEffect, useMemo, useRef } from 'react';
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
import {
  RECUR_BY,
  formatHebrew,
  gregorianToHebrew,
  hebrewAnniversaryInYear,
  nextOccurrence,
  todayISO,
} from '@shulcrm/shared';
import type { ImportantDate, ImportantDateInput, Member } from '@shulcrm/shared';
import { createImportantDate, listMembers, updateImportantDate } from '@/features/core/service';
import { useSettings } from '@/features/settings/useSettings';
import { LookupSelect } from './LookupSelect';

const formSchema = z.object({
  memberId: z.string().min(1, 'Member is required'),
  type: z.string().min(1, 'Type is required'),
  date: z.string().min(1, 'Date is required'),
  // The Hebrew day starts at nightfall, so one English date can be two Hebrew dates.
  timeOfDay: z.enum(['', 'day', 'night']),
  recurring: z.boolean(),
  recurBy: z.enum(RECUR_BY),
  note: z.string().optional().or(z.literal('')),
});

/** The nightfall answer is required only while the Hebrew calendar is switched on. */
const schemaFor = (hebrewCalendar: boolean) =>
  hebrewCalendar
    ? formSchema.refine((v) => v.timeOfDay !== '', {
        path: ['timeOfDay'],
        message: 'Choose whether this was before or after nightfall',
      })
    : formSchema;

type FormValues = z.infer<typeof formSchema>;

const emptyForm = (memberId: string): FormValues => ({
  memberId,
  type: 'birthday',
  date: '',
  timeOfDay: '',
  recurring: false,
  recurBy: 'gregorian',
  note: '',
});

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A sensible starting date for a new entry, from the member's birth date: the birthday
 * itself, or the bar/bat mitzvah (the 13th / 12th Hebrew birthday). */
function suggestedDate(
  type: FormValues['type'],
  birthDate: string | undefined,
): string | undefined {
  if (!birthDate || !ISO_DATE.test(birthDate)) return undefined;
  if (type === 'birthday') return birthDate;
  if (type === 'bar_mitzvah' || type === 'bat_mitzvah') {
    const born = gregorianToHebrew(birthDate);
    return hebrewAnniversaryInYear(born, born.year + (type === 'bar_mitzvah' ? 13 : 12));
  }
  return undefined;
}

const formatGregorian = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial?: ImportantDate;
  members?: Member[];
  fixedMemberId?: string;
}

export function ImportantDateFormDialog({
  open,
  onClose,
  onSaved,
  initial,
  members,
  fixedMemberId,
}: Props) {
  const fixed = Boolean(fixedMemberId) && !initial;
  const settings = useSettings();
  const hebrewOn = settings.features.hebrewCalendar;
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
  } = useForm<FormValues>({ resolver: zodResolver(schemaFor(hebrewOn)) });

  const dateValue = useWatch({ control, name: 'date' });
  const memberValue = useWatch({ control, name: 'memberId' });
  const typeValue = useWatch({ control, name: 'type' });
  const recurringValue = useWatch({ control, name: 'recurring' });
  const recurByValue = useWatch({ control, name: 'recurBy' });
  const timeOfDayValue = useWatch({ control, name: 'timeOfDay' });

  useEffect(() => {
    if (open && !initial) {
      reset(emptyForm(fixedMemberId ?? memberOptions[0]?.id ?? ''));
    } else if (initial) {
      reset({
        memberId: initial.memberId,
        type: initial.type,
        date: initial.date,
        // Older dates never recorded this; leave it unanswered so the user must choose.
        timeOfDay:
          initial.afterNightfall === undefined ? '' : initial.afterNightfall ? 'night' : 'day',
        recurring: initial.recurring ?? false,
        recurBy: initial.recurBy ?? settings.dateType(initial.type).recurBy,
        note: initial.note ?? '',
      });
    }
    // settings.dateType only matters for the initial value; don't reset the form when settings refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial, fixedMemberId, memberOptions, reset]);

  // New dates: follow the type's usual recurrence (Hebrew for a yahrzeit) until the user picks one.
  useEffect(() => {
    if (open && !initial && typeValue) setValue('recurBy', settings.dateType(typeValue).recurBy);
    // Only a type change should reset the choice, not a settings refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial, typeValue, setValue]);

  // New dates: suggest the date from the member's birth date. Only an empty date, or one we
  // suggested ourselves, is replaced, so a typed date is never overwritten.
  const suggested = useRef('');
  useEffect(() => {
    if (!open || initial) return;
    if (dateValue !== '' && dateValue !== suggested.current) return;
    const member = memberOptions.find((m) => m.id === memberValue);
    const next = suggestedDate(typeValue, member?.birthDate) ?? '';
    if (next === dateValue) return;
    suggested.current = next;
    // Only fill the date: a full reset would also wipe the type and nightfall answers.
    setValue('date', next);
  }, [open, initial, memberValue, typeValue, dateValue, memberOptions, setValue]);

  // Show the Hebrew date each answer produces, so the choice is concrete.
  const validDate = Boolean(dateValue) && ISO_DATE.test(dateValue);
  const hebrewLabel = (afterNightfall: boolean) => {
    if (!validDate) return '';
    const h = gregorianToHebrew(dateValue, { afterNightfall });
    return ` → ${formatHebrew(h.day, h.month, h.year)}`;
  };

  // When it next comes round, so the Hebrew/English choice is concrete too.
  const nextLabel = (() => {
    if (!validDate || !recurringValue || (hebrewOn && timeOfDayValue === '')) return '';
    const next = nextOccurrence(
      {
        type: typeValue,
        date: dateValue,
        afterNightfall: timeOfDayValue === 'night',
        recurring: true,
        recurBy: recurByValue,
      },
      todayISO(),
      settings.recurrence,
    );
    if (!next) return '';
    const h = gregorianToHebrew(next);
    if (!hebrewOn) return `Next: ${formatGregorian(next)}`;
    return `Next: ${formatGregorian(next)} (${formatHebrew(h.day, h.month, h.year)})${
      recurByValue === 'hebrew' ? ', starting the evening before' : ''
    }`;
  })();

  const mutation = useMutation({
    mutationFn: (input: ImportantDateInput) =>
      initial ? updateImportantDate(initial.id, input) : createImportantDate(input),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });

  const onSubmit = handleSubmit((values) => {
    // With the Hebrew calendar off the question isn't asked: keep whatever answer was stored.
    const afterNightfall = hebrewOn ? values.timeOfDay === 'night' : initial?.afterNightfall;
    const heb = /^\d{4}-\d{2}-\d{2}$/.test(values.date)
      ? gregorianToHebrew(values.date, { afterNightfall })
      : undefined;
    const input: ImportantDateInput = {
      memberId: values.memberId,
      type: values.type,
      date: values.date,
      afterNightfall,
      hebrewDay: heb?.day,
      hebrewMonth: heb?.month,
      hebrewYear: heb?.year,
      recurring: values.recurring,
      recurBy: values.recurBy,
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
              <FormControl error={Boolean(errors.memberId)}>
                <FormLabel>{settings.t('member')}</FormLabel>
                <Controller
                  name="memberId"
                  control={control}
                  render={({ field }) => (
                    <Select {...field} value={field.value ?? ''}>
                      {memberOptions.map((m) => (
                        <MenuItem key={m.id} value={m.id}>
                          {m.firstName} {m.lastName}
                        </MenuItem>
                      ))}
                    </Select>
                  )}
                />
                {errors.memberId && (
                  <Typography variant="caption" color="error">
                    {errors.memberId.message}
                  </Typography>
                )}
              </FormControl>
            )}
            <LookupSelect
              control={control}
              name="type"
              label="Type"
              kind="dateTypes"
              error={errors.type?.message}
            />
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
              {hebrewOn && (
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
              )}
            </Stack>
            <Stack spacing={0.5}>
              <Controller
                name="recurring"
                control={control}
                render={({ field }) => (
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={Boolean(field.value)}
                        onChange={(e) => field.onChange(e.target.checked)}
                        onBlur={field.onBlur}
                        inputRef={field.ref}
                      />
                    }
                    label="Repeats annually (e.g. birthday, yahrzeit, anniversary)"
                  />
                )}
              />
              {recurringValue && (
                <FormControl sx={{ pl: 4 }}>
                  {hebrewOn && (
                    <>
                      <FormLabel>Repeats on</FormLabel>
                      <Controller
                        name="recurBy"
                        control={control}
                        render={({ field }) => (
                          <RadioGroup {...field} row>
                            <FormControlLabel
                              value="hebrew"
                              control={<Radio size="small" />}
                              label="Hebrew date"
                            />
                            <FormControlLabel
                              value="gregorian"
                              control={<Radio size="small" />}
                              label="English date"
                            />
                          </RadioGroup>
                        )}
                      />
                    </>
                  )}
                  {nextLabel && (
                    <Typography variant="caption" color="text.secondary">
                      {nextLabel}
                    </Typography>
                  )}
                </FormControl>
              )}
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
            {initial ? 'Save changes' : 'Create date'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
