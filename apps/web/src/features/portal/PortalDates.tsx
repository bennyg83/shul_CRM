import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  FormLabel,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  RECUR_BY,
  formatHebrew,
  gregorianToHebrew,
  type ImportantDate,
  type Member,
  type PortalDateInput,
} from '@shulcrm/shared';
import { addPortalDate, deletePortalDate, savePortalDate } from '@/features/core/service';
import { useSettings } from '@/features/settings/useSettings';
import { LookupSelect } from '@/features/core/forms/LookupSelect';
import { ISO_DATE, fullName, portalKeys, useDateFormat, usePortalHome } from './usePortalData';

const dateFormSchema = z.object({
  memberId: z.string().min(1, 'Please choose who this date is for'),
  type: z.string().min(1, 'Please choose what kind of date this is'),
  date: z.string().regex(ISO_DATE, 'Please give the date'),
  // The Hebrew day starts at nightfall, so one English date can mean two Hebrew dates.
  timeOfDay: z.enum(['', 'day', 'night']),
  recurring: z.boolean(),
  recurBy: z.enum(RECUR_BY),
  personName: z.string().max(80).optional(),
  personHebrewName: z.string().max(80).optional(),
  relationship: z.string().max(60).optional(),
  note: z.string().max(2000).optional(),
});

/** The nightfall answer is only asked, and only needed, while the Hebrew calendar is on. */
const schemaFor = (hebrewCalendar: boolean) =>
  hebrewCalendar
    ? dateFormSchema.refine((values) => values.timeOfDay !== '', {
        path: ['timeOfDay'],
        message: 'Please say whether this was before or after nightfall',
      })
    : dateFormSchema;

type DateFormValues = z.infer<typeof dateFormSchema>;

const trimmed = (value: string | undefined) => {
  const text = value?.trim();
  return text ? text : undefined;
};

export function PortalDates() {
  const settings = useSettings();
  const formatDate = useDateFormat();
  const queryClient = useQueryClient();
  const { data: home } = usePortalHome();
  const [editing, setEditing] = useState<ImportantDate | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<ImportantDate | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => deletePortalDate(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: portalKeys.home });
      setRemoving(null);
    },
  });

  if (!home) return null;
  const canEdit = home.canEdit;
  const hebrewOn = settings.features.hebrewCalendar;

  const hebrewOf = (date: ImportantDate) => {
    if (date.hebrewDay && date.hebrewMonth && date.hebrewYear) {
      return formatHebrew(date.hebrewDay, date.hebrewMonth, date.hebrewYear);
    }
    if (!ISO_DATE.test(date.date)) return '';
    const hebrew = gregorianToHebrew(date.date, { afterNightfall: date.afterNightfall === true });
    return formatHebrew(hebrew.day, hebrew.month, hebrew.year);
  };

  const repeatsText = (date: ImportantDate) => {
    if (!date.recurring) return 'Marked once only';
    if (!hebrewOn) return 'Every year';
    const by = date.recurBy ?? settings.dateType(date.type).recurBy;
    return by === 'hebrew' ? 'Every year, by the Hebrew date' : 'Every year, by the English date';
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
        >
          <Typography variant="h6">Our important dates</Typography>
          {canEdit && (
            <Button variant="contained" onClick={() => setAdding(true)}>
              Add a date
            </Button>
          )}
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Birthdays, yahrzeits and simchas for everyone in the {settings.t('family').toLowerCase()}.
          We use them to remember you at the right time of year.
        </Typography>
      </Box>

      {home.members.map((member) => {
        const dates = home.dates
          .filter((date) => date.memberId === member.id)
          .sort((a, b) => a.date.localeCompare(b.date));
        return (
          <Paper key={member.id} variant="outlined" sx={{ p: { xs: 2, sm: 2.5 } }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: dates.length ? 1.5 : 0 }}>
              {fullName(member)}
            </Typography>
            {dates.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No dates recorded yet.
              </Typography>
            ) : (
              <Stack divider={<Divider flexItem />} spacing={1.5}>
                {dates.map((date) => (
                  <Stack
                    key={date.id}
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1}
                    sx={{ pt: 1.5, justifyContent: 'space-between' }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Stack
                        direction="row"
                        spacing={1}
                        useFlexGap
                        flexWrap="wrap"
                        sx={{ alignItems: 'center' }}
                      >
                        <Typography variant="body1" sx={{ fontWeight: 600 }}>
                          {settings.dateType(date.type).label}
                        </Typography>
                        <Chip size="small" label={repeatsText(date)} variant="outlined" />
                      </Stack>
                      <Typography variant="body2">{formatDate(date.date)}</Typography>
                      {hebrewOn && (
                        <Typography variant="body2" color="text.secondary">
                          {hebrewOf(date)}
                        </Typography>
                      )}
                      {date.personName && (
                        <Typography variant="body2" color="text.secondary">
                          In memory of {date.personName}
                          {date.relationship ? ` (${date.relationship})` : ''}
                        </Typography>
                      )}
                      {date.note && (
                        <Typography variant="body2" color="text.secondary">
                          {date.note}
                        </Typography>
                      )}
                    </Box>
                    {canEdit && (
                      <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                        <Button
                          size="small"
                          aria-label={`Edit the ${settings.dateType(date.type).label.toLowerCase()} for ${fullName(member)}`}
                          onClick={() => setEditing(date)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="small"
                          color="inherit"
                          aria-label={`Remove the ${settings.dateType(date.type).label.toLowerCase()} for ${fullName(member)}`}
                          onClick={() => setRemoving(date)}
                        >
                          Remove
                        </Button>
                      </Stack>
                    )}
                  </Stack>
                ))}
              </Stack>
            )}
          </Paper>
        );
      })}

      <PortalDateDialog
        open={adding || editing !== null}
        initial={editing}
        members={home.members}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
      />

      <Dialog open={removing !== null} onClose={() => setRemoving(null)} fullWidth maxWidth="xs">
        <DialogTitle>Remove this date?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {removing
              ? `We will stop keeping the ${settings
                  .dateType(removing.type)
                  .label.toLowerCase()} on ${formatDate(removing.date)}.`
              : ''}
          </DialogContentText>
          {remove.isError && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              {remove.error instanceof Error
                ? remove.error.message
                : 'That could not be removed. Please try again.'}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setRemoving(null)}>Keep it</Button>
          <Button
            variant="contained"
            disabled={remove.isPending}
            onClick={() => removing && remove.mutate(removing.id)}
          >
            Remove it
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function PortalDateDialog({
  open,
  initial,
  members,
  onClose,
}: {
  open: boolean;
  initial: ImportantDate | null;
  members: Member[];
  onClose: () => void;
}) {
  const settings = useSettings();
  const queryClient = useQueryClient();
  const hebrewOn = settings.features.hebrewCalendar;

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DateFormValues>({ resolver: zodResolver(schemaFor(hebrewOn)) });

  const dateValue = useWatch({ control, name: 'date' });
  const typeValue = useWatch({ control, name: 'type' });
  const recurringValue = useWatch({ control, name: 'recurring' });

  useEffect(() => {
    if (!open) return;
    reset({
      memberId: initial?.memberId ?? members[0]?.id ?? '',
      type: initial?.type ?? 'birthday',
      date: initial?.date ?? '',
      // An older date may never have been asked the question: leave it unanswered.
      timeOfDay:
        initial?.afterNightfall === undefined ? '' : initial.afterNightfall ? 'night' : 'day',
      recurring: initial?.recurring ?? true,
      recurBy: initial?.recurBy ?? 'gregorian',
      personName: initial?.personName ?? '',
      personHebrewName: initial?.personHebrewName ?? '',
      relationship: initial?.relationship ?? '',
      note: initial?.note ?? '',
    });
  }, [open, initial, members, reset]);

  const save = useMutation({
    mutationFn: (input: PortalDateInput) =>
      initial ? savePortalDate(initial.id, input) : addPortalDate(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: portalKeys.home });
      onClose();
    },
  });

  const onSubmit = handleSubmit((values) => {
    // With the Hebrew calendar off the question is never asked, so keep whatever was stored.
    const afterNightfall = hebrewOn ? values.timeOfDay === 'night' : initial?.afterNightfall;
    save.mutate({
      memberId: values.memberId,
      type: values.type,
      date: values.date,
      afterNightfall,
      recurring: values.recurring,
      recurBy: values.recurBy,
      personName: trimmed(values.personName),
      personHebrewName: trimmed(values.personHebrewName),
      relationship: trimmed(values.relationship),
      note: trimmed(values.note),
    });
  });

  // Show the Hebrew date each answer gives, so the choice is a real one and not a guess.
  const validDate = Boolean(dateValue) && ISO_DATE.test(dateValue);
  const hebrewLabel = (afterNightfall: boolean) => {
    if (!validDate) return '';
    const hebrew = gregorianToHebrew(dateValue, { afterNightfall });
    return ` — ${formatHebrew(hebrew.day, hebrew.month, hebrew.year)}`;
  };

  const isYahrzeit = settings.dateType(typeValue ?? '').rules === 'yahrzeit';

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{initial ? 'Edit this date' : 'Add a date'}</DialogTitle>
      <form onSubmit={onSubmit} noValidate>
        <DialogContent dividers>
          <Stack spacing={2.5} sx={{ mt: 0.5 }}>
            <FormControl error={Boolean(errors.memberId)}>
              <FormLabel id="portal-date-member">Who is this for?</FormLabel>
              <Controller
                name="memberId"
                control={control}
                render={({ field }) => (
                  <Select
                    {...field}
                    value={field.value ?? ''}
                    inputProps={{ 'aria-labelledby': 'portal-date-member' }}
                  >
                    {members.map((member) => (
                      <MenuItem key={member.id} value={member.id}>
                        {fullName(member)}
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

            <LookupSelect
              control={control}
              name="type"
              label="What kind of date is it?"
              kind="dateTypes"
              error={errors.type?.message}
            />

            <TextField
              label="Date"
              required
              type="date"
              InputLabelProps={{ shrink: true }}
              error={Boolean(errors.date)}
              helperText={errors.date?.message}
              {...register('date')}
            />

            {hebrewOn && (
              <FormControl error={Boolean(errors.timeOfDay)}>
                <FormLabel>Was it before or after nightfall?</FormLabel>
                <Controller
                  name="timeOfDay"
                  control={control}
                  render={({ field }) => (
                    <RadioGroup {...field} value={field.value ?? ''}>
                      <FormControlLabel
                        value="day"
                        control={<Radio />}
                        label={`Before nightfall, during the day${hebrewLabel(false)}`}
                      />
                      <FormControlLabel
                        value="night"
                        control={<Radio />}
                        label={`After nightfall, in the evening${hebrewLabel(true)}`}
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

            <Box>
              <Controller
                name="recurring"
                control={control}
                render={({ field }) => (
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={Boolean(field.value)}
                        onChange={(event) => field.onChange(event.target.checked)}
                        onBlur={field.onBlur}
                        inputRef={field.ref}
                      />
                    }
                    label="This comes round every year"
                  />
                )}
              />
              {recurringValue && hebrewOn && (
                <FormControl sx={{ pl: 4 }}>
                  <FormLabel>Which date should come round?</FormLabel>
                  <Controller
                    name="recurBy"
                    control={control}
                    render={({ field }) => (
                      <RadioGroup {...field} value={field.value ?? 'gregorian'}>
                        <FormControlLabel
                          value="hebrew"
                          control={<Radio />}
                          label="The Hebrew date"
                        />
                        <FormControlLabel
                          value="gregorian"
                          control={<Radio />}
                          label="The English date"
                        />
                      </RadioGroup>
                    )}
                  />
                </FormControl>
              )}
            </Box>

            {isYahrzeit && (
              <Stack spacing={1.5}>
                <Box>
                  <Typography variant="subtitle2">In memory of</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Leave these empty if the date is for the person named above.
                  </Typography>
                </Box>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField label="Their name" fullWidth {...register('personName')} />
                  <TextField
                    label="Their Hebrew name"
                    fullWidth
                    inputProps={{ dir: 'auto' }}
                    {...register('personHebrewName')}
                  />
                </Stack>
                <TextField
                  label="How they were related"
                  placeholder="Father"
                  {...register('relationship')}
                />
              </Stack>
            )}

            <TextField
              label="Anything we should know"
              multiline
              minRows={2}
              {...register('note')}
            />

            {save.isError && (
              <Alert severity="warning">
                {save.error instanceof Error
                  ? save.error.message
                  : 'That could not be saved. Please try again.'}
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={save.isPending}>
            {initial ? 'Save changes' : 'Add this date'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
