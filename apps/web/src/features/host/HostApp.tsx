import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Container,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createOrganizationSchema, type OrganizationSummary } from '@shulcrm/shared';
import type { z } from 'zod';
import {
  createOrganization,
  listHostOrganizations,
  suggestOrganizationSlug,
} from '@/features/core/service';
import { UserMenu } from '@/features/auth/UserMenu';
import { authErrorMessage } from '@/features/auth/branding';

type CreateValues = z.infer<typeof createOrganizationSchema>;

const ORGS_KEY = ['host', 'organizations'] as const;

export function HostApp() {
  const queryClient = useQueryClient();
  const { data: organizations, isPending, isError, error } = useQuery({
    queryKey: ORGS_KEY,
    queryFn: listHostOrganizations,
  });
  const [includeOwner, setIncludeOwner] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<CreateValues>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: { name: '', slug: '', owner: undefined },
  });

  const name = watch('name');

  const suggest = useMutation({
    mutationFn: (n: string) => suggestOrganizationSlug(n),
    onSuccess: (data) => setValue('slug', data.slug, { shouldValidate: true }),
  });

  const create = useMutation({
    mutationFn: (values: CreateValues) => createOrganization(values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ORGS_KEY });
      reset({ name: '', slug: '', owner: undefined });
      setIncludeOwner(false);
    },
  });

  const onSubmit = (values: CreateValues) => {
    const payload = { ...values };
    if (!includeOwner) delete payload.owner;
    create.mutate(payload);
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider', py: 1.5, px: 2 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="h6">Shul CRM — host</Typography>
          <UserMenu />
        </Stack>
      </Box>
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Stack spacing={4}>
          <Paper variant="outlined" sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Create a shul
            </Typography>
            <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
              <Stack spacing={2}>
                <TextField
                  label="Shul name"
                  fullWidth
                  error={Boolean(errors.name)}
                  helperText={errors.name?.message}
                  {...register('name')}
                  onBlur={() => {
                    if (name.trim()) suggest.mutate(name.trim());
                  }}
                />
                <Stack direction="row" spacing={1} alignItems="flex-start">
                  <TextField
                    label="Web address (slug)"
                    fullWidth
                    error={Boolean(errors.slug)}
                    helperText={errors.slug?.message ?? 'Used at sign-in when the same email exists in more than one shul.'}
                    {...register('slug')}
                  />
                  <Button
                    type="button"
                    variant="outlined"
                    sx={{ mt: 1, flexShrink: 0 }}
                    disabled={!name.trim() || suggest.isPending}
                    onClick={() => suggest.mutate(name.trim())}
                  >
                    Suggest
                  </Button>
                </Stack>
                <Button type="button" size="small" onClick={() => setIncludeOwner((v) => !v)} sx={{ alignSelf: 'flex-start' }}>
                  {includeOwner ? 'Skip owner for now' : 'Create the first owner too'}
                </Button>
                {includeOwner && (
                  <>
                    <TextField label="Owner name" fullWidth {...register('owner.name')} />
                    <TextField label="Owner email" type="email" fullWidth {...register('owner.email')} />
                    <TextField label="Owner password" type="password" fullWidth {...register('owner.password')} />
                  </>
                )}
                {create.isError && <Alert severity="error">{authErrorMessage(create.error)}</Alert>}
                <Button type="submit" variant="contained" disabled={create.isPending}>
                  {create.isPending ? 'Creating…' : 'Create shul'}
                </Button>
              </Stack>
            </Box>
          </Paper>

          <Paper variant="outlined" sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Shuls on this server
            </Typography>
            {isPending && <Typography color="text.secondary">Loading…</Typography>}
            {isError && <Alert severity="error">{authErrorMessage(error)}</Alert>}
            {organizations && organizations.length === 0 && (
              <Typography color="text.secondary">No shuls yet besides the demo install.</Typography>
            )}
            {organizations && organizations.length > 0 && (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Slug</TableCell>
                    <TableCell>Created</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {organizations.map((o: OrganizationSummary) => (
                    <TableRow key={o.id}>
                      <TableCell>{o.name}</TableCell>
                      <TableCell>
                        <Typography component="code" variant="body2">
                          {o.slug}
                        </Typography>
                      </TableCell>
                      <TableCell>{new Date(o.createdAt).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Paper>
        </Stack>
      </Container>
    </Box>
  );
}
