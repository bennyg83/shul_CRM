import { useEffect } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { changePasswordSchema } from '@shulcrm/shared';
import { changePassword } from '@/features/core/service';
import { authErrorMessage } from '@/features/auth/branding';

const formSchema = changePasswordSchema
  .extend({ confirm: z.string() })
  .refine((v) => v.newPassword === v.confirm, {
    path: ['confirm'],
    message: 'The passwords do not match',
  });

type FormValues = z.infer<typeof formSchema>;

const emptyForm: FormValues = { currentPassword: '', newPassword: '', confirm: '' };

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ChangePasswordDialog({ open, onClose }: Props) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: emptyForm });

  const change = useMutation({
    mutationFn: (values: FormValues) => changePassword(values.currentPassword, values.newPassword),
  });

  // Never leave a typed password (or a stale result) behind for the next time it opens.
  useEffect(() => {
    if (open) {
      reset(emptyForm);
      change.reset();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (change.isSuccess) {
    return (
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
        <DialogTitle>Password changed</DialogTitle>
        <DialogContent dividers>
          <Alert severity="success">
            Your new password is in place. Your other devices have been signed out and will need it
            next time.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button variant="contained" onClick={onClose}>
            Done
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Change password</DialogTitle>
      <form onSubmit={handleSubmit((values) => change.mutate(values))} noValidate>
        <DialogContent dividers>
          <Stack spacing={2.5} sx={{ mt: 0.5 }}>
            <TextField
              label="Current password"
              type="password"
              autoComplete="current-password"
              required
              fullWidth
              error={Boolean(errors.currentPassword)}
              helperText={errors.currentPassword?.message}
              {...register('currentPassword')}
            />
            <TextField
              label="New password"
              type="password"
              autoComplete="new-password"
              required
              fullWidth
              error={Boolean(errors.newPassword)}
              helperText={
                errors.newPassword?.message ??
                'At least 10 characters. Changing it signs out your other devices.'
              }
              {...register('newPassword')}
            />
            <TextField
              label="Confirm new password"
              type="password"
              autoComplete="new-password"
              required
              fullWidth
              error={Boolean(errors.confirm)}
              helperText={errors.confirm?.message}
              {...register('confirm')}
            />
            {change.isError && <Alert severity="error">{authErrorMessage(change.error)}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={change.isPending}>
            Change password
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
