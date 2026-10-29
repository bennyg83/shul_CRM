import { useState } from 'react';
import {
  Alert,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { loginSchema, type LoginOrganization } from '@shulcrm/shared';
import { ApiError, getLoginTargets, login } from '@/features/core/service';
import { SESSION_KEY } from '@/features/auth/useAuth';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { authErrorMessage } from '@/features/auth/branding';

type LoginValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  const queryClient = useQueryClient();
  const [orgChoices, setOrgChoices] = useState<LoginOrganization[] | null>(null);

  const {
    register,
    handleSubmit,
    control,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', orgSlug: undefined },
  });

  const signIn = useMutation({
    mutationFn: (values: LoginValues) => login(values.email, values.password, values.orgSlug),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSION_KEY }),
    onError: async (error: unknown) => {
      if (error instanceof ApiError && error.code === 'choose_org' && error.organizations?.length) {
        setOrgChoices(error.organizations);
        return;
      }
      const email = getValues('email');
      if (email && !getValues('orgSlug')) {
        try {
          const { organizations } = await getLoginTargets(email);
          if (organizations.length > 1) setOrgChoices(organizations);
        } catch {
          // ignore
        }
      }
    },
  });

  return (
    <AuthLayout orgSlug={getValues('orgSlug') ?? orgChoices?.[0]?.slug}>
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
            onBlur={async (e) => {
              const address = e.target.value.trim();
              if (!address) return;
              try {
                const { organizations } = await getLoginTargets(address);
                if (organizations.length > 1) {
                  setOrgChoices(organizations);
                  if (!getValues('orgSlug')) setValue('orgSlug', organizations[0].slug);
                } else {
                  setOrgChoices(null);
                  setValue('orgSlug', undefined);
                }
              } catch {
                // ignore
              }
            }}
          />
          {orgChoices && orgChoices.length > 1 && (
            <Controller
              name="orgSlug"
              control={control}
              render={({ field }) => (
                <FormControl fullWidth>
                  <InputLabel id="org-slug-label">Community</InputLabel>
                  <Select labelId="org-slug-label" label="Community" {...field} value={field.value ?? ''}>
                    {orgChoices.map((o) => (
                      <MenuItem key={o.slug} value={o.slug}>
                        {o.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />
          )}
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            fullWidth
            error={Boolean(errors.password)}
            helperText={errors.password?.message}
            {...register('password')}
          />
          {signIn.isError && signIn.error instanceof ApiError && signIn.error.code !== 'choose_org' && (
            <Alert severity="error">{authErrorMessage(signIn.error)}</Alert>
          )}
          {signIn.isError && signIn.error instanceof ApiError && signIn.error.code === 'choose_org' && (
            <Alert severity="info">Choose which community you belong to, then sign in again.</Alert>
          )}
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
