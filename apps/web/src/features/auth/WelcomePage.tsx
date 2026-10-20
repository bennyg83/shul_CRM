import { Alert, Box, Button, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { acceptInviteSchema } from '@shulcrm/shared';
import { acceptLink, describeLink } from '@/features/core/service';
import { SESSION_KEY } from '@/features/auth/useAuth';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { authErrorMessage } from '@/features/auth/branding';

const welcomeFormSchema = acceptInviteSchema
  .extend({ confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'The passwords do not match',
  });

type WelcomeValues = z.infer<typeof welcomeFormSchema>;

/** Where an invited user (or someone resetting a password) lands from their emailed link. */
export function WelcomePage() {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const link = useQuery({
    queryKey: ['auth-link', token],
    queryFn: () => describeLink(token),
    enabled: token !== '',
    retry: false,
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<WelcomeValues>({
    resolver: zodResolver(welcomeFormSchema),
    defaultValues: { password: '', confirm: '' },
  });

  const accept = useMutation({
    mutationFn: (values: WelcomeValues) => acceptLink(token, values.password),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SESSION_KEY });
      void navigate('/');
    },
  });

  if (link.isLoading) {
    return (
      <AuthLayout>
        <Box sx={{ display: 'grid', placeItems: 'center', py: 3 }}>
          <CircularProgress aria-label="Checking your link" />
        </Box>
      </AuthLayout>
    );
  }

  if (link.isError || !link.data) {
    return (
      <AuthLayout>
        <Stack spacing={2}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            This link no longer works
          </Typography>
          <Typography variant="body2" color="text.secondary">
            It has expired, or it has already been used. Ask whoever invited you to send you a new
            one.
          </Typography>
        </Stack>
      </AuthLayout>
    );
  }

  const { name, email, purpose } = link.data;
  const isReset = purpose === 'reset';

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit((values) => accept.mutate(values))} noValidate>
        <Stack spacing={2.5}>
          <Stack spacing={1}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {isReset ? 'Choose a new password' : `Welcome, ${name}`}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {isReset
                ? 'Pick a new password and you will be signed in straight away.'
                : 'Choose a password and you will be signed in straight away.'}
            </Typography>
          </Stack>
          <TextField
            label="Email"
            value={email}
            fullWidth
            // Read-only: the link decides the account, so letting it be edited would mislead.
            InputProps={{ readOnly: true }}
            inputProps={{ 'aria-label': 'Your email address' }}
          />
          <TextField
            label="Password"
            type="password"
            autoComplete="new-password"
            autoFocus
            required
            fullWidth
            error={Boolean(errors.password)}
            helperText={
              errors.password?.message ?? 'At least 10 characters. A short phrase works well.'
            }
            {...register('password')}
          />
          <TextField
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            required
            fullWidth
            error={Boolean(errors.confirm)}
            helperText={errors.confirm?.message}
            {...register('confirm')}
          />
          {accept.isError && <Alert severity="error">{authErrorMessage(accept.error)}</Alert>}
          <Button type="submit" variant="contained" size="large" disabled={accept.isPending}>
            {accept.isPending ? 'Saving…' : isReset ? 'Save password' : 'Set password and sign in'}
          </Button>
        </Stack>
      </form>
    </AuthLayout>
  );
}
