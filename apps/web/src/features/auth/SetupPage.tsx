import { Alert, Button, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { setupSchema } from '@shulcrm/shared';
import { setupOwner } from '@/features/core/service';
import { SESSION_KEY, useAuth } from '@/features/auth/useAuth';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { authErrorMessage } from '@/features/auth/branding';

const setupFormSchema = setupSchema
  .extend({ confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'The passwords do not match',
  });

type SetupValues = z.infer<typeof setupFormSchema>;

/** Shown on a brand-new install, where nobody can sign in yet, to create the first owner. */
export function SetupPage() {
  const queryClient = useQueryClient();
  const { setupNeedsCode } = useAuth();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SetupValues>({
    resolver: zodResolver(setupFormSchema),
    defaultValues: { name: '', email: '', password: '', confirm: '', code: '' },
  });

  const create = useMutation({
    mutationFn: (values: SetupValues) =>
      setupOwner({
        name: values.name,
        email: values.email,
        password: values.password,
        code: values.code?.trim() || undefined,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSION_KEY }),
  });

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit((values) => create.mutate(values))} noValidate>
        <Stack spacing={2.5}>
          <Stack spacing={1}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Set up your shul
            </Typography>
            <Typography variant="body2" color="text.secondary">
              This creates the owner account — the first person to sign in. From there you can
              invite everyone else and give each of them the access they need.
            </Typography>
          </Stack>
          <TextField
            label="Your name"
            autoComplete="name"
            autoFocus
            required
            fullWidth
            error={Boolean(errors.name)}
            helperText={errors.name?.message}
            {...register('name')}
          />
          <TextField
            label="Email"
            type="email"
            autoComplete="username"
            required
            fullWidth
            error={Boolean(errors.email)}
            helperText={errors.email?.message}
            {...register('email')}
          />
          <TextField
            label="Password"
            type="password"
            autoComplete="new-password"
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
          {setupNeedsCode && (
            <TextField
              label="Setup code"
              fullWidth
              error={Boolean(errors.code)}
              helperText={
                errors.code?.message ??
                'The code is printed in the server’s log. It is needed because you are setting up from another computer.'
              }
              {...register('code')}
            />
          )}
          {create.isError && <Alert severity="error">{authErrorMessage(create.error)}</Alert>}
          <Button type="submit" variant="contained" size="large" disabled={create.isPending}>
            {create.isPending ? 'Creating the account…' : 'Create owner account'}
          </Button>
        </Stack>
      </form>
    </AuthLayout>
  );
}
