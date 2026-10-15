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
import type { Family, FamilyInput } from '@pilzno/shared';
import {
  createFamily,
  deleteFamily,
  listFamilies,
  updateFamily,
} from '@/features/core/service';
import { FamilyDetailModal } from './FamilyDetailModal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
const formSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  hebrewName: z.string().optional().or(z.literal('')),
  address: z.string().optional(),
  city: z.string().optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  status: z.enum(['active', 'inactive']),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

const emptyForm: FormValues = {
  name: '',
  hebrewName: '',
  address: '',
  city: '',
  phone: '',
  whatsapp: '',
  email: '',
  status: 'active',
  notes: '',
};

export function FamiliesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Family | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Family | null>(null);

  const { data: families, isLoading, isError, error } = useQuery({
    queryKey: ['families'],
    queryFn: listFamilies,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['families'] });

  const saveMutation = useMutation({
    mutationFn: ({ id, input }: { id?: string; input: FamilyInput }) =>
      id ? updateFamily(id, input) : createFamily(input),
    onSuccess: () => {
      invalidate();
      closeDrawer();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteFamily,
    onSuccess: invalidate,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: emptyForm,
  });

  const openCreate = () => {
    setEditing(null);
    reset(emptyForm);
    setDrawerOpen(true);
  };

  const openEdit = (family: Family) => {
    setEditing(family);
    reset({
      name: family.name,
      hebrewName: family.hebrewName ?? '',
      address: family.address ?? '',
      city: family.city ?? '',
      phone: family.phone ?? '',
      whatsapp: family.whatsapp ?? '',
      email: family.email ?? '',
      status: family.status,
      notes: family.notes ?? '',
    });
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditing(null);
  };

  const onSubmit = handleSubmit((values) => {
    const input: FamilyInput = {
      name: values.name.trim(),
      hebrewName: values.hebrewName?.trim() || undefined,
      address: values.address?.trim() || undefined,
      city: values.city?.trim() || undefined,
      phone: values.phone?.trim() || undefined,
      whatsapp: values.whatsapp?.trim() || undefined,
      email: values.email?.trim() || undefined,
      status: values.status,
      notes: values.notes?.trim() || undefined,
    };
    saveMutation.mutate({ id: editing?.id, input });
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return families ?? [];
    return (families ?? []).filter((f) =>
      [f.name, f.city, f.email, f.phone].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [families, search]);

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
          <Typography variant="h5">Families</Typography>
          <Typography variant="body2" color="text.secondary">
            Family records, contact details, and status.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          New Family
        </Button>
      </Stack>

      <TextField
        size="small"
        placeholder="Search families…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        InputProps={{ startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} /> }}
        sx={{ mb: 2, maxWidth: 360 }}
      />

      {isLoading && (
        <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
          Loading families…
        </Typography>
      )}

      {isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load families: {(error as Error).message}
        </Alert>
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="body2" color="text.secondary">
              {search ? 'No families match your search.' : 'No families yet — create the first one.'}
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
                  <TableCell>City</TableCell>
                  <TableCell>Phone</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((f) => (
                  <TableRow key={f.id} hover>
                    <TableCell>
                      <Typography
                        variant="body2"
                        fontWeight={600}
                        sx={{
                          cursor: 'pointer',
                          color: 'primary.main',
                          '&:hover': { textDecoration: 'underline' },
                        }}
                        onClick={() => setDetailId(f.id)}
                      >
                        {f.name}
                      </Typography>
                    </TableCell>
                    <TableCell>{f.hebrewName ?? '—'}</TableCell>
                    <TableCell>{f.city ?? '—'}</TableCell>
                    <TableCell>{f.phone ?? '—'}</TableCell>
                    <TableCell>{f.email ?? '—'}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={f.status === 'active' ? 'Active' : 'Inactive'}
                        color={f.status === 'active' ? 'success' : 'default'}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        <Button size="small" onClick={() => setDetailId(f.id)}>
                          Details
                        </Button>
                        <Button size="small" startIcon={<EditIcon />} onClick={() => openEdit(f)}>
                          Edit
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          startIcon={<DeleteIcon />}
                          onClick={() => setToDelete(f)}
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
            {editing ? `Edit ${editing.name}` : 'New Family'}
          </Typography>
          <form onSubmit={onSubmit} noValidate>
            <Stack spacing={2.5}>
              <TextField
                label="Family name"
                required
                error={Boolean(errors.name)}
                helperText={errors.name?.message}
                {...register('name')}
              />
              <TextField
                label="Family name in Hebrew (שם בעברית)"
                inputProps={{ dir: 'rtl' }}
                {...register('hebrewName')}
              />
              <TextField label="Address" {...register('address')} />
              <TextField label="City" {...register('city')} />
              <TextField
                label="Phone"
                error={Boolean(errors.phone)}
                helperText={errors.phone?.message}
                {...register('phone')}
              />
              <TextField label="WhatsApp" {...register('whatsapp')} />
              <TextField
                label="Email"
                type="email"
                error={Boolean(errors.email)}
                helperText={errors.email?.message}
                {...register('email')}
              />
              <FormControl>
                <FormLabel>Status</FormLabel>
                <Select {...register('status')}>
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="inactive">Inactive</MenuItem>
                </Select>
              </FormControl>
              <TextField label="Notes" multiline minRows={3} {...register('notes')} />
              {saveMutation.isError && (
                <Alert severity="error">{(saveMutation.error as Error).message}</Alert>
              )}
              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button onClick={closeDrawer}>Cancel</Button>
                <Button type="submit" variant="contained" disabled={saveMutation.isPending}>
                  {editing ? 'Save changes' : 'Create family'}
                </Button>
              </Stack>
            </Stack>
          </form>
        </Box>
      </Drawer>

      <FamilyDetailModal
        familyId={detailId ?? ''}
        open={detailId !== null}
        onClose={() => setDetailId(null)}
      />

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete family"
        message={toDelete ? `Delete family "${toDelete.name}" and all linked records?` : ''}
        onConfirm={() => {
          if (toDelete) deleteMutation.mutate(toDelete.id);
          setToDelete(null);
        }}
        onClose={() => setToDelete(null)}
      />
    </Box>
  );
}
