import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Drawer,
  FormControl,
  FormLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import SearchIcon from '@mui/icons-material/Search';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { Member, MemberInput } from '@pilzno/shared';
import {
  createMember,
  deleteMember,
  listFamilies,
  listMembers,
  updateMember,
} from '@/features/core/service';
import { ConfirmDialog } from '@/components/ConfirmDialog';

const formSchema = z
  .object({
    familyId: z.string().min(1, 'Family is required'),
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    hebrewName: z.string().optional().or(z.literal('')),
    gender: z.enum(['male', 'female', 'other']),
    birthDate: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().optional(),
    whatsapp: z.string().optional().or(z.literal('')),
    status: z.enum(['active', 'inactive']),
  })
  .refine((v) => !v.birthDate || !Number.isNaN(Date.parse(v.birthDate)), {
    message: 'Birth date is not a valid date',
    path: ['birthDate'],
  });

type FormValues = z.infer<typeof formSchema>;

const emptyForm = (familyId: string): FormValues => ({
  familyId,
  firstName: '',
  lastName: '',
  hebrewName: '',
  gender: 'other',
  birthDate: '',
  email: '',
  phone: '',
  whatsapp: '',
  status: 'active',
});

export function MembersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [familyFilter, setFamilyFilter] = useState('all');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [toDelete, setToDelete] = useState<Member | null>(null);

  const { data: members, isLoading, isError, error } = useQuery({
    queryKey: ['members'],
    queryFn: listMembers,
  });
  const { data: families } = useQuery({
    queryKey: ['families'],
    queryFn: listFamilies,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['members'] });
  };

  const saveMutation = useMutation({
    mutationFn: ({ id, input }: { id?: string; input: MemberInput }) =>
      id ? updateMember(id, input) : createMember(input),
    onSuccess: () => {
      invalidate();
      closeDrawer();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteMember,
    onSuccess: invalidate,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  });

  const familyName = (id: string) => families?.find((f) => f.id === id)?.name ?? '—';

  const openCreate = () => {
    setEditing(null);
    reset(emptyForm(families?.[0]?.id ?? ''));
    setDrawerOpen(true);
  };

  const openEdit = (member: Member) => {
    setEditing(member);
    reset({
      familyId: member.familyId,
      firstName: member.firstName,
      lastName: member.lastName,
      hebrewName: member.hebrewName ?? '',
      gender: member.gender,
      birthDate: member.birthDate ?? '',
      email: member.email ?? '',
      phone: member.phone ?? '',
      whatsapp: member.whatsapp ?? '',
      status: member.status,
    });
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditing(null);
  };

  const onSubmit = handleSubmit((values) => {
    const input: MemberInput = {
      familyId: values.familyId,
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      hebrewName: values.hebrewName?.trim() || undefined,
      gender: values.gender,
      birthDate: values.birthDate || undefined,
      email: values.email?.trim() || undefined,
      phone: values.phone?.trim() || undefined,
      whatsapp: values.whatsapp?.trim() || undefined,
      status: values.status,
    };
    saveMutation.mutate({ id: editing?.id, input });
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const nameOf = (id: string) => families?.find((f) => f.id === id)?.name ?? '';
    return (members ?? []).filter((m) => {
      if (familyFilter !== 'all' && m.familyId !== familyFilter) return false;
      if (!q) return true;
      return [m.firstName, m.lastName, m.email, nameOf(m.familyId)].some((v) =>
        v?.toLowerCase().includes(q),
      );
    });
  }, [members, search, familyFilter, families]);

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
          <Typography variant="h5">Members</Typography>
          <Typography variant="body2" color="text.secondary">
            Member profiles and their family links.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate} disabled={!families?.length}>
          New Member
        </Button>
      </Stack>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <TextField
          size="small"
          placeholder="Search members…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{ startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} /> }}
          sx={{ maxWidth: 320 }}
        />
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <FormLabel sx={{ mb: 0.5, fontSize: '0.75rem' }}>Family</FormLabel>
          <Select value={familyFilter} onChange={(e) => setFamilyFilter(e.target.value)}>
            <MenuItem value="all">All families</MenuItem>
            {families?.map((f) => (
              <MenuItem key={f.id} value={f.id}>
                {f.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      {isLoading && (
        <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
          Loading members…
        </Typography>
      )}

      {isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load members: {(error as Error).message}
        </Alert>
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="body2" color="text.secondary">
              {search || familyFilter !== 'all'
                ? 'No members match your filters.'
                : !families?.length
                  ? 'Create a family first, then add its members.'
                  : 'No members yet — add the first one.'}
            </Typography>
          </CardContent>
        </Card>
      )}

      {filtered.length > 0 && (
        <Card>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Hebrew</TableCell>
                  <TableCell>Family</TableCell>
                  <TableCell>Gender</TableCell>
                  <TableCell>Born</TableCell>
                  <TableCell>Contact</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((m) => (
                  <TableRow key={m.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>
                        {m.firstName} {m.lastName}
                      </Typography>
                    </TableCell>
                    <TableCell>{m.hebrewName ?? '—'}</TableCell>
                    <TableCell>{familyName(m.familyId)}</TableCell>
                    <TableCell>
                      <Chip size="small" label={m.gender} variant="outlined" />
                    </TableCell>
                    <TableCell>{m.birthDate ?? '—'}</TableCell>
                    <TableCell>
                      <Box>
                        {m.email && <Typography variant="body2">{m.email}</Typography>}
                        {m.phone && (
                          <Typography variant="caption" color="text.secondary">
                            {m.phone}
                          </Typography>
                        )}
                        {!m.email && !m.phone && '—'}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={m.status === 'active' ? 'Active' : 'Inactive'}
                        color={m.status === 'active' ? 'success' : 'default'}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        <Button size="small" startIcon={<EditIcon />} onClick={() => openEdit(m)}>
                          Edit
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          startIcon={<DeleteIcon />}
                          onClick={() => setToDelete(m)}
                        >
                          Delete
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      <Drawer anchor="right" open={drawerOpen} onClose={closeDrawer}>
        <Box sx={{ width: { xs: '100%', sm: 440 }, p: 3 }}>
          <Typography variant="h6" sx={{ mb: 3 }}>
            {editing ? `Edit ${editing.firstName} ${editing.lastName}` : 'New Member'}
          </Typography>
          {families && families.length === 0 ? (
            <Alert severity="info">Create a family first — members are linked to a family.</Alert>
          ) : (
            <form onSubmit={onSubmit} noValidate>
              <Stack spacing={2.5}>
                <FormControl fullWidth required>
                  <FormLabel>Family</FormLabel>
                  <Select {...register('familyId')}>
                    {families?.map((f) => (
                      <MenuItem key={f.id} value={f.id}>
                        {f.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  label="First name"
                  required
                  error={Boolean(errors.firstName)}
                  helperText={errors.firstName?.message}
                  {...register('firstName')}
                />
                <TextField
                  label="Last name"
                  required
                  error={Boolean(errors.lastName)}
                  helperText={errors.lastName?.message}
                  {...register('lastName')}
                />
                <TextField
                  label="Hebrew name (שם בעברית)"
                  inputProps={{ dir: 'rtl' }}
                  {...register('hebrewName')}
                />
                <FormControl>
                  <FormLabel>Gender</FormLabel>
                  <Select {...register('gender')}>
                    <MenuItem value="female">Female</MenuItem>
                    <MenuItem value="male">Male</MenuItem>
                    <MenuItem value="other">Other</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  label="Birth date"
                  type="date"
                  InputLabelProps={{ shrink: true }}
                  error={Boolean(errors.birthDate)}
                  helperText={errors.birthDate?.message}
                  {...register('birthDate')}
                />
                <TextField
                  label="Email"
                  type="email"
                  error={Boolean(errors.email)}
                  helperText={errors.email?.message}
                  {...register('email')}
                />
                <TextField label="Phone" {...register('phone')} />
                <TextField label="WhatsApp" {...register('whatsapp')} />
                <FormControl>
                  <FormLabel>Status</FormLabel>
                  <Select {...register('status')}>
                    <MenuItem value="active">Active</MenuItem>
                    <MenuItem value="inactive">Inactive</MenuItem>
                  </Select>
                </FormControl>
                {saveMutation.isError && (
                  <Alert severity="error">{(saveMutation.error as Error).message}</Alert>
                )}
                <Stack direction="row" spacing={1} justifyContent="flex-end">
                  <Button onClick={closeDrawer}>Cancel</Button>
                  <Button type="submit" variant="contained" disabled={saveMutation.isPending}>
                    {editing ? 'Save changes' : 'Create member'}
                  </Button>
                </Stack>
              </Stack>
            </form>
          )}
        </Box>
      </Drawer>

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete member"
        message={toDelete ? `Delete member "${toDelete.firstName} ${toDelete.lastName}"?` : ''}
        onConfirm={() => {
          if (toDelete) deleteMutation.mutate(toDelete.id);
          setToDelete(null);
        }}
        onClose={() => setToDelete(null)}
      />
    </Box>
  );
}
