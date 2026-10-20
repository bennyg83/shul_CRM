import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormLabel,
  IconButton,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import MailIcon from '@mui/icons-material/MailOutline';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { todayISO, type EventInput, type EventSummary, type Rsvp } from '@shulcrm/shared';
import {
  createEvent,
  deleteEvent,
  deleteRsvp,
  getEventDetail,
  listEventSummaries,
  listFamilies,
  saveRsvp,
  updateEvent,
} from '@/features/core/service';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SendEmailDialog } from '@/features/email/SendEmailDialog';
import { useSettings } from '@/features/settings/useSettings';
import { useLongDate } from '@/features/print/useLongDate';

const formSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date is required'),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
  capacity: z.union([z.literal(''), z.coerce.number().int().nonnegative('0 or more')]),
  rsvpOpen: z.boolean(),
});
type FormValues = z.infer<typeof formSchema>;

const timeText = (e: Pick<EventSummary, 'startTime' | 'endTime'>) =>
  e.startTime ? `${e.startTime}${e.endTime ? `–${e.endTime}` : ''}` : '';

function EventFormDialog({
  open,
  onClose,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  initial?: EventSummary;
}) {
  const queryClient = useQueryClient();
  const { control, register, handleSubmit, reset, formState } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  });
  useEffect(() => {
    if (!open) return;
    reset({
      title: initial?.title ?? '',
      date: initial?.date ?? todayISO(),
      startTime: initial?.startTime ?? '',
      endTime: initial?.endTime ?? '',
      location: initial?.location ?? '',
      description: initial?.description ?? '',
      capacity: initial?.capacity ?? '',
      rsvpOpen: initial?.rsvpOpen ?? true,
    });
  }, [open, initial, reset]);
  const save = useMutation({
    mutationFn: (input: EventInput) =>
      initial ? updateEvent(initial.id, input) : createEvent(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['events'] });
      void queryClient.invalidateQueries({ queryKey: ['upcoming-dates'] });
      onClose();
    },
  });
  const onSubmit = handleSubmit((v) =>
    save.mutate({
      title: v.title.trim(),
      date: v.date,
      startTime: v.startTime || undefined,
      endTime: v.endTime || undefined,
      location: v.location?.trim() || undefined,
      description: v.description?.trim() || undefined,
      capacity: v.capacity === '' ? undefined : v.capacity,
      rsvpOpen: v.rsvpOpen,
    }),
  );
  const e = formState.errors;
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{initial ? 'Edit event' : 'New event'}</DialogTitle>
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
              <TextField
                label="Starts"
                type="time"
                InputLabelProps={{ shrink: true }}
                {...register('startTime')}
              />
              <TextField
                label="Ends"
                type="time"
                InputLabelProps={{ shrink: true }}
                {...register('endTime')}
              />
            </Stack>
            <TextField label="Location" {...register('location')} />
            <TextField label="Description" multiline minRows={2} {...register('description')} />
            <Stack direction="row" spacing={2} alignItems="center">
              <TextField
                label="Capacity (people)"
                type="number"
                sx={{ width: 180 }}
                error={Boolean(e.capacity)}
                helperText={e.capacity?.message ?? 'Leave empty for no limit'}
                {...register('capacity')}
              />
              <Controller
                name="rsvpOpen"
                control={control}
                render={({ field }) => (
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={Boolean(field.value)}
                        onChange={(ev) => field.onChange(ev.target.checked)}
                      />
                    }
                    label="Taking RSVPs"
                  />
                )}
              />
            </Stack>
            {save.isError && <Alert severity="error">{(save.error as Error).message}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {initial ? 'Save changes' : 'Create event'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function EventDetailDialog({ eventId, onClose }: { eventId: string | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { t } = useSettings();
  const longDate = useLongDate();
  const { data } = useQuery({
    queryKey: ['events', 'detail', eventId],
    queryFn: () => getEventDetail(eventId as string),
    enabled: eventId !== null,
  });
  const { data: families } = useQuery({
    queryKey: ['families'],
    queryFn: listFamilies,
    enabled: eventId !== null,
  });
  const [draft, setDraft] = useState<{
    familyId: string;
    status: Rsvp['status'];
    adults: number;
    children: number;
    note: string;
  }>({
    familyId: '',
    status: 'yes',
    adults: 1,
    children: 0,
    note: '',
  });
  const [inviting, setInviting] = useState(false);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['events'] });
  const save = useMutation({
    mutationFn: () =>
      saveRsvp({ eventId: eventId as string, ...draft, note: draft.note || undefined }),
    onSuccess: () => {
      refresh();
      setDraft((d) => ({ ...d, familyId: '', note: '' }));
    },
  });
  const remove = useMutation({ mutationFn: deleteRsvp, onSuccess: refresh });
  const invitees = useMemo(() => (families ?? []).filter((f) => f.status === 'active'), [families]);

  const event = data?.event;
  const left =
    event?.capacity !== undefined
      ? Math.max(0, event.capacity - (data?.attending ?? 0))
      : undefined;
  return (
    <Dialog open={eventId !== null} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{event?.title ?? 'Event'}</DialogTitle>
      <DialogContent dividers>
        {event && (
          <Stack spacing={2}>
            <Typography>
              {longDate(event.date)}
              {timeText(event) && `, ${timeText(event)}`}
              {event.location && ` · ${event.location}`}
            </Typography>
            {event.description && (
              <Typography color="text.secondary">{event.description}</Typography>
            )}
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip color="success" label={`${data.attending} coming`} />
              {left !== undefined && <Chip label={`${left} place${left === 1 ? '' : 's'} left`} />}
              <Chip
                variant="outlined"
                label={`${data.rsvps.length} RSVP${data.rsvps.length === 1 ? '' : 's'}`}
              />
              {!event.rsvpOpen && <Chip color="warning" label="RSVPs closed" />}
            </Stack>

            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('family')}</TableCell>
                  <TableCell>Answer</TableCell>
                  <TableCell align="right">Adults</TableCell>
                  <TableCell align="right">Children</TableCell>
                  <TableCell>Note</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {data.rsvps.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.familyName}</TableCell>
                    <TableCell>{r.status}</TableCell>
                    <TableCell align="right">{r.adults}</TableCell>
                    <TableCell align="right">{r.children}</TableCell>
                    <TableCell>{r.note ?? ''}</TableCell>
                    <TableCell align="right">
                      <IconButton
                        size="small"
                        aria-label={`Change RSVP for ${r.familyName}`}
                        onClick={() =>
                          setDraft({
                            familyId: r.familyId,
                            status: r.status,
                            adults: r.adults,
                            children: r.children,
                            note: r.note ?? '',
                          })
                        }
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        aria-label={`Remove RSVP for ${r.familyName}`}
                        onClick={() => remove.mutate(r.id)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {data.rsvps.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} sx={{ color: 'text.secondary' }}>
                      No RSVPs yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            <Typography variant="subtitle2">Add or change an RSVP</Typography>
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={1}
              alignItems={{ md: 'flex-end' }}
            >
              <FormControl sx={{ minWidth: 200 }}>
                <FormLabel>{t('family')}</FormLabel>
                <Select
                  size="small"
                  value={draft.familyId}
                  displayEmpty
                  onChange={(e) => setDraft((d) => ({ ...d, familyId: e.target.value }))}
                >
                  <MenuItem value="">— Choose —</MenuItem>
                  {(families ?? []).map((f) => (
                    <MenuItem key={f.id} value={f.id}>
                      {f.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>Answer</FormLabel>
                <Select
                  size="small"
                  value={draft.status}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, status: e.target.value as Rsvp['status'] }))
                  }
                >
                  <MenuItem value="yes">Yes</MenuItem>
                  <MenuItem value="maybe">Maybe</MenuItem>
                  <MenuItem value="no">No</MenuItem>
                </Select>
              </FormControl>
              <TextField
                size="small"
                label="Adults"
                type="number"
                sx={{ width: 90 }}
                value={draft.adults}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, adults: Math.max(0, Number(e.target.value) || 0) }))
                }
              />
              <TextField
                size="small"
                label="Children"
                type="number"
                sx={{ width: 90 }}
                value={draft.children}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, children: Math.max(0, Number(e.target.value) || 0) }))
                }
              />
              <TextField
                size="small"
                label="Note"
                value={draft.note}
                onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              />
              <Button disabled={!draft.familyId || save.isPending} onClick={() => save.mutate()}>
                Save RSVP
              </Button>
            </Stack>
            {save.isError && <Alert severity="error">{(save.error as Error).message}</Alert>}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button
          variant="outlined"
          startIcon={<MailIcon />}
          disabled={!event || invitees.length === 0}
          onClick={() => setInviting(true)}
        >
          Email invitations
        </Button>
        <Box sx={{ flexGrow: 1 }} />
        <Button variant="text" onClick={onClose}>
          Close
        </Button>
      </DialogActions>
      {event && (
        <SendEmailDialog
          open={inviting}
          onClose={() => setInviting(false)}
          title={`Invite to ${event.title}`}
          template="event"
          recipients={invitees.map((f) => ({ familyId: f.id, eventId: event.id }))}
        />
      )}
    </Dialog>
  );
}

export function EventsPage() {
  const queryClient = useQueryClient();
  const longDate = useLongDate();
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming');
  const today = todayISO();
  const { data, isLoading, error } = useQuery({
    queryKey: ['events', 'summary'],
    queryFn: () => listEventSummaries(),
  });
  const [form, setForm] = useState<{ open: boolean; initial?: EventSummary }>({ open: false });
  const [detail, setDetail] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<EventSummary | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => deleteEvent(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['events'] }),
  });

  const shown = (data ?? [])
    .filter((e) => (when === 'upcoming' ? e.date >= today : e.date < today))
    .sort((a, b) =>
      when === 'upcoming' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date),
    );

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
          <Typography variant="h5">Events</Typography>
          <Typography variant="body2" color="text.secondary">
            Kiddushim, classes and simchas, with RSVPs. Events also show on the calendar.
          </Typography>
        </Box>
        <Button startIcon={<AddIcon />} onClick={() => setForm({ open: true })}>
          New event
        </Button>
      </Stack>
      <Card>
        <CardContent>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={when}
            onChange={(_, v) => v && setWhen(v)}
            sx={{ mb: 2 }}
          >
            <ToggleButton value="upcoming">Upcoming</ToggleButton>
            <ToggleButton value="past">Past</ToggleButton>
          </ToggleButtonGroup>
          {error && <Alert severity="error">{(error as Error).message}</Alert>}
          {isLoading && <Typography color="text.secondary">Loading…</Typography>}
          {!isLoading && shown.length === 0 && (
            <Typography color="text.secondary">
              {when === 'upcoming' ? 'No upcoming events.' : 'No past events.'}
            </Typography>
          )}
          {shown.length > 0 && (
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Event</TableCell>
                    <TableCell>Where</TableCell>
                    <TableCell align="right">Coming</TableCell>
                    <TableCell align="right">Capacity</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {shown.map((e) => (
                    <TableRow
                      key={e.id}
                      hover
                      sx={{ cursor: 'pointer' }}
                      onClick={() => setDetail(e.id)}
                    >
                      <TableCell>
                        {longDate(e.date)}
                        {timeText(e) && (
                          <Typography variant="caption" color="text.secondary" display="block">
                            {timeText(e)}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>{e.title}</TableCell>
                      <TableCell>{e.location ?? ''}</TableCell>
                      <TableCell align="right">
                        {e.attending}
                        {e.maybe > 0 && ` (+${e.maybe} maybe)`}
                      </TableCell>
                      <TableCell align="right">{e.capacity ?? '—'}</TableCell>
                      <TableCell align="right" onClick={(ev) => ev.stopPropagation()}>
                        <IconButton
                          size="small"
                          aria-label={`Edit ${e.title}`}
                          onClick={() => setForm({ open: true, initial: e })}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          aria-label={`Delete ${e.title}`}
                          onClick={() => setPendingDelete(e)}
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
      <EventFormDialog
        open={form.open}
        initial={form.initial}
        onClose={() => setForm({ open: false })}
      />
      <EventDetailDialog eventId={detail} onClose={() => setDetail(null)} />
      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete ${pendingDelete?.title ?? 'event'}`}
        message="The event and its RSVPs will be deleted. This cannot be undone."
        onConfirm={() => {
          if (pendingDelete) remove.mutate(pendingDelete.id);
          setPendingDelete(null);
        }}
        onClose={() => setPendingDelete(null)}
      />
    </Box>
  );
}
