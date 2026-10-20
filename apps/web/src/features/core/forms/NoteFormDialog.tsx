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
import { useQuery } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Member, Note, NoteInput } from '@pilzno/shared';
import { createNote, listMembers, updateNote } from '@/features/core/service';

const formSchema = z.object({
  familyId: z.string().optional().or(z.literal('')),
  memberId: z.string().optional().or(z.literal('')),
  type: z
    .enum(['general', 'pastoral', 'membership', 'lifecycle', 'donation', 'other'])
    .optional()
    .or(z.literal('')),
  priority: z.enum(['low', 'medium', 'high']).optional().or(z.literal('')),
  subject: z.string().optional().or(z.literal('')),
  body: z.string().min(1, 'Note text is required'),
});

type FormValues = z.infer<typeof formSchema>;

const emptyForm = (familyId: string, memberId: string): FormValues => ({
  familyId,
  memberId,
  type: 'general',
  priority: 'medium',
  subject: '',
  body: '',
});

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial?: Note;
  /** Fix the family (e.g. notes on the family modal). */
  fixedFamilyId?: string;
  /** Fix the member (e.g. notes on the member modal). */
  fixedMemberId?: string;
  /** Members available for the optional member link (usually the family's members). */
  members?: Member[];
}

export function NoteFormDialog({ open, onClose, onSaved, initial, fixedFamilyId, fixedMemberId, members }: Props) {
  const showMemberSelect = !fixedMemberId;
  const { data: allMembers } = useQuery({
    queryKey: ['members'],
    queryFn: listMembers,
    enabled: open && showMemberSelect && !members,
  });

  const memberOptions = useMemo<Member[]>(() => members ?? allMembers ?? [], [members, allMembers]);

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  useEffect(() => {
    if (!open) return;
    if (initial) {
      reset({
        familyId: initial.familyId ?? '',
        memberId: initial.memberId ?? '',
        type: initial.type ?? '',
        priority: initial.priority ?? '',
        subject: initial.subject ?? '',
        body: initial.body,
      });
    } else {
      reset(emptyForm(fixedFamilyId ?? '', fixedMemberId ?? ''));
    }
  }, [open, initial, fixedFamilyId, fixedMemberId, reset]);

  const mutation = useMutation({
    mutationFn: (input: NoteInput) => (initial ? updateNote(initial.id, input) : createNote(input)),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });

  const onSubmit = handleSubmit((values) => {
    const input: NoteInput = {
      familyId: values.familyId || undefined,
      memberId: values.memberId || undefined,
      type: values.type || undefined,
      priority: values.priority || undefined,
      subject: values.subject?.trim() || undefined,
      body: values.body.trim(),
    };
    mutation.mutate(input);
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{initial ? 'Edit Note' : 'New Note'}</DialogTitle>
      <form onSubmit={onSubmit} noValidate>
        <DialogContent dividers>
          <Stack spacing={2.5} sx={{ mt: 0.5 }}>
            <TextField
              label="Subject (optional)"
              error={Boolean(errors.subject)}
              helperText={errors.subject?.message}
              {...register('subject')}
            />
            {showMemberSelect && memberOptions.length > 0 && (
              <FormControl>
                <FormLabel>Link to member (optional)</FormLabel>
                <Controller
                  name="memberId"
                  control={control}
                  render={({ field }) => (
                    <Select {...field} value={field.value ?? ''}>
                      <MenuItem value="">— None —</MenuItem>
                      {memberOptions.map((m) => (
                        <MenuItem key={m.id} value={m.id}>
                          {m.firstName} {m.lastName}
                        </MenuItem>
                      ))}
                    </Select>
                  )}
                />
              </FormControl>
            )}
            <Stack direction="row" spacing={2}>
              <FormControl sx={{ flexGrow: 1 }}>
                <FormLabel>Type</FormLabel>
                <Controller
                  name="type"
                  control={control}
                  render={({ field }) => (
                    <Select {...field} value={field.value ?? ''}>
                      <MenuItem value="">—</MenuItem>
                      <MenuItem value="general">General</MenuItem>
                      <MenuItem value="pastoral">Pastoral</MenuItem>
                      <MenuItem value="membership">Membership</MenuItem>
                      <MenuItem value="lifecycle">Lifecycle</MenuItem>
                      <MenuItem value="donation">Donation</MenuItem>
                      <MenuItem value="other">Other</MenuItem>
                    </Select>
                  )}
                />
              </FormControl>
              <FormControl sx={{ flexGrow: 1 }}>
                <FormLabel>Priority</FormLabel>
                <Controller
                  name="priority"
                  control={control}
                  render={({ field }) => (
                    <Select {...field} value={field.value ?? ''}>
                      <MenuItem value="">—</MenuItem>
                      <MenuItem value="low">Low</MenuItem>
                      <MenuItem value="medium">Medium</MenuItem>
                      <MenuItem value="high">High</MenuItem>
                    </Select>
                  )}
                />
              </FormControl>
            </Stack>
            <TextField
              label="Note"
              required
              multiline
              minRows={3}
              error={Boolean(errors.body)}
              helperText={errors.body?.message}
              {...register('body')}
            />
            {mutation.isError && <Alert severity="error">{(mutation.error as Error).message}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={mutation.isPending}>
            {initial ? 'Save changes' : 'Create note'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
