import { Alert, Button, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { loginSchema } from '@shulcrm/shared';
import { login } from '@/features/core/service';
import { SESSION_KEY } from '@/features/auth/useAuth';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { authErrorMessage } from '@/features/auth/branding';

type LoginValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const signIn = useMutation({
    mutationFn: (values: LoginValues) => login(values.email, values.password),
    // The session query is what AuthGate reads, so refreshing it shows the app signed in.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSION_KEY }),
  });

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit((values) => signIn.mutate(values))} noValidate>
        <Stack spacing={2.5}>
          <Typography variant="body2" color="text.secondary">
            Sign in to continue.
          </Typography>
          <TextField
            label="Email"
            type="email"
            autoComplete="username"
            autoFocus
            fullWidth
            error={Boolean(errors.email)}
            helperText={errors.email?.message}
            {...register('email')}
          />
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            fullWidth
            error={Boolean(errors.password)}
            helperText={errors.password?.message}
            {...register('password')}
          />
          {signIn.isError && <Alert severity="error">{authErrorMessage(signIn.error)}</Alert>}
          <Button type="submit" variant="contained" size="large" disabled={signIn.isPending}>
            {signIn.isPending ? 'Signing in…' : 'Sign in'}
          </Button>
          <Typography variant="caption" color="text.secondary">
            Forgotten your password? Ask an administrator at your shul to send you a new sign-in
            link.
          </Typography>
        </Stack>
      </form>
    </AuthLayout>
  );
}
