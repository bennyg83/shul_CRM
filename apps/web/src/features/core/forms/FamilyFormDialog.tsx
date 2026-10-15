import { useEffect } from 'react';
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
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Family, FamilyInput } from '@pilzno/shared';
import { createFamily, updateFamily } from '@/features/core/service';

const formSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  hebrewName: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  city: z.string().optional().or(z.literal('')),
  zip: z.string().optional().or(z.literal('')),
  country: z.string().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  whatsapp: z.string().optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  status: z.enum(['active', 'inactive']),
  notes: z.string().optional().or(z.literal('')),
});

type FormValues = z.infer<typeof formSchema>;

const emptyForm: FormValues = {
  name: '',
  hebrewName: '',
  address: '',
  city: '',
  zip: '',
  country: '',
  phone: '',
  whatsapp: '',
  email: '',
  status: 'active',
  notes: '',
};

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial?: Family;
}

export function FamilyFormDialog({ open, onClose, onSaved, initial }: Props) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: emptyForm });

  useEffect(() => {
    if (!open) return;
    reset(
      initial
        ? {
            name: initial.name,
            hebrewName: initial.hebrewName ?? '',
            address: initial.address ?? '',
            city: initial.city ?? '',
            zip: initial.zip ?? '',
            country: initial.country ?? '',
            phone: initial.phone ?? '',
            whatsapp: initial.whatsapp ?? '',
            email: initial.email ?? '',
            status: initial.status,
            notes: initial.notes ?? '',
          }
        : emptyForm
    );
  }, [open, initial, reset]);

  const mutation = useMutation({
    mutationFn: (input: FamilyInput) => (initial ? updateFamily(initial.id, input) : createFamily(input)),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });

  const onSubmit = handleSubmit((values) => {
    const input: FamilyInput = {
      name: values.name.trim(),
      hebrewName: values.hebrewName?.trim() || undefined,
      address: values.address?.trim() || undefined,
      city: values.city?.trim() || undefined,
      zip: values.zip?.trim() || undefined,
      country: values.country?.trim() || undefined,
      phone: values.phone?.trim() || undefined,
      whatsapp: values.whatsapp?.trim() || undefined,
      email: values.email?.trim() || undefined,
      status: values.status,
      notes: values.notes?.trim() || undefined,
    };
    mutation.mutate(input);
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{initial ? `Edit ${initial.name}` : 'New Family'}</DialogTitle>
      <form onSubmit={onSubmit} noValidate>
        <DialogContent dividers>
          <Stack spacing={2.5} sx={{ mt: 0.5 }}>
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
              placeholder="לוי"
              {...register('hebrewName')}
            />
            <TextField label="Address" {...register('address')} />
            <Stack direction="row" spacing={2}>
              <TextField label="City" sx={{ flexGrow: 1 }} {...register('city')} />
              <TextField label="ZIP" sx={{ width: 120 }} {...register('zip')} />
            </Stack>
            <TextField label="Country" {...register('country')} />
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
            {mutation.isError && <Alert severity="error">{(mutation.error as Error).message}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={mutation.isPending}>
            {initial ? 'Save changes' : 'Create family'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
