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
  Typography,
} from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Member, MemberInput } from '@pilzno/shared';
import { createMember, listFamilies, listMembers, updateMember } from '@/features/core/service';

const formSchema = z.object({
  familyId: z.string().min(1, 'Family is required'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  hebrewName: z.string().optional().or(z.literal('')),
  fatherHebrewName: z.string().optional().or(z.literal('')),
  motherHebrewName: z.string().optional().or(z.literal('')),
  gender: z.enum(['male', 'female', 'other']),
  role: z.enum(['husband', 'wife', 'son', 'daughter', 'other']).optional().or(z.literal('')),
  birthDate: z.string().optional().or(z.literal('')),
  deathDate: z.string().optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  whatsapp: z.string().optional().or(z.literal('')),
  occupation: z.string().optional().or(z.literal('')),
  status: z.enum(['active', 'inactive']),
});

type FormValues = z.infer<typeof formSchema>;

const emptyForm = (familyId: string): FormValues => ({
  familyId,
  firstName: '',
  lastName: '',
  hebrewName: '',
  fatherHebrewName: '',
  motherHebrewName: '',
  gender: 'other',
  role: '',
  birthDate: '',
  deathDate: '',
  email: '',
  phone: '',
  whatsapp: '',
  occupation: '',
  status: 'active',
});

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial?: Member;
  /** When set, the family is fixed (e.g. adding a member to a specific family). */
  fixedFamilyId?: string;
}

export function MemberFormDialog({ open, onClose, onSaved, initial, fixedFamilyId }: Props) {
  const fixed = Boolean(fixedFamilyId) && !initial;
  const { data: families } = useQuery({
    queryKey: ['families'],
    queryFn: listFamilies,
    enabled: open && !fixed,
  });

  const { data: allMembers } = useQuery({
    queryKey: ['members'],
    queryFn: listMembers,
    enabled: open,
  });

  const defaultFamilyId = fixedFamilyId ?? families?.[0]?.id ?? '';

  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: emptyForm(defaultFamilyId) });

  useEffect(() => {
    if (!open) return;
    if (initial) {
      reset({
        familyId: initial.familyId,
        firstName: initial.firstName,
        lastName: initial.lastName,
        hebrewName: initial.hebrewName ?? '',
        fatherHebrewName: initial.fatherHebrewName ?? '',
        motherHebrewName: initial.motherHebrewName ?? '',
        gender: initial.gender,
        role: initial.role ?? '',
        birthDate: initial.birthDate ?? '',
        deathDate: initial.deathDate ?? '',
        email: initial.email ?? '',
        phone: initial.phone ?? '',
        whatsapp: initial.whatsapp ?? '',
        occupation: initial.occupation ?? '',
        status: initial.status,
      });
    } else {
      reset(emptyForm(fixedFamilyId ?? families?.[0]?.id ?? ''));
    }
  }, [open, initial, fixedFamilyId, families, reset]);

  // Auto-inherit for NEW members: pre-fill the last name from the family, and the
  // ben/bat (father/mother Hebrew names) for a son/daughter from the family's
  // husband/wife. Every field stays editable so the user can overwrite (adoption,
  // step-parents, a different surname).
  const familyIdValue = watch('familyId');
  const roleValue = watch('role');
  useEffect(() => {
    if (initial) return;
    const family = families?.find((f) => f.id === familyIdValue);
    if (!family) return;
    if (!getValues('lastName')) setValue('lastName', family.name);
    if (roleValue === 'son' || roleValue === 'daughter') {
      const fam = allMembers?.filter((m) => m.familyId === familyIdValue) ?? [];
      const father = fam.find((m) => m.role === 'husband');
      const mother = fam.find((m) => m.role === 'wife');
      if (father?.hebrewName && !getValues('fatherHebrewName')) setValue('fatherHebrewName', father.hebrewName);
      if (mother?.hebrewName && !getValues('motherHebrewName')) setValue('motherHebrewName', mother.hebrewName);
    }
  }, [initial, families, allMembers, familyIdValue, roleValue, setValue, getValues]);

  const mutation = useMutation({
    mutationFn: (input: MemberInput) => (initial ? updateMember(initial.id, input) : createMember(input)),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });

  const onSubmit = handleSubmit((values) => {
    const input: MemberInput = {
      familyId: values.familyId,
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      hebrewName: values.hebrewName?.trim() || undefined,
      fatherHebrewName: values.fatherHebrewName?.trim() || undefined,
      motherHebrewName: values.motherHebrewName?.trim() || undefined,
      gender: values.gender,
      role: values.role || undefined,
      birthDate: values.birthDate || undefined,
      deathDate: values.deathDate || undefined,
      email: values.email?.trim() || undefined,
      phone: values.phone?.trim() || undefined,
      whatsapp: values.whatsapp?.trim() || undefined,
      occupation: values.occupation?.trim() || undefined,
      status: values.status,
    };
    mutation.mutate(input);
  });

  const familyOptions = useMemo(() => families ?? [], [families]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{initial ? `Edit ${initial.firstName} ${initial.lastName}` : 'New Member'}</DialogTitle>
      <form onSubmit={onSubmit} noValidate>
        <DialogContent dividers>
          <Stack spacing={2.5} sx={{ mt: 0.5 }}>
            {!fixed && (
              <FormControl error={Boolean(errors.familyId)}>
                <FormLabel>Family</FormLabel>
                <Controller
                  name="familyId"
                  control={control}
                  render={({ field }) => (
                    <Select {...field} value={field.value ?? ''}>
                      {familyOptions.map((f) => (
                        <MenuItem key={f.id} value={f.id}>
                          {f.name}
                        </MenuItem>
                      ))}
                    </Select>
                  )}
                />
                {errors.familyId && (
                  <Typography variant="caption" color="error">
                    {errors.familyId.message}
                  </Typography>
                )}
              </FormControl>
            )}
            <Stack direction="row" spacing={2}>
              <TextField
                label="First name"
                required
                sx={{ flexGrow: 1 }}
                error={Boolean(errors.firstName)}
                helperText={errors.firstName?.message}
                {...register('firstName')}
              />
              <TextField
                label="Last name"
                required
                sx={{ flexGrow: 1 }}
                error={Boolean(errors.lastName)}
                helperText={errors.lastName?.message}
                {...register('lastName')}
              />
            </Stack>
            <TextField
              label="Hebrew name (שם בעברית)"
              inputProps={{ dir: 'rtl' }}
              placeholder="אברהם"
              {...register('hebrewName')}
            />
            <Stack direction="row" spacing={2}>
              <TextField
                label="Father's Hebrew name (בן)"
                inputProps={{ dir: 'rtl' }}
                placeholder="משה"
                sx={{ flexGrow: 1 }}
                {...register('fatherHebrewName')}
              />
              <TextField
                label="Mother's Hebrew name (בת)"
                inputProps={{ dir: 'rtl' }}
                placeholder="שרה"
                sx={{ flexGrow: 1 }}
                {...register('motherHebrewName')}
              />
            </Stack>
            <Stack direction="row" spacing={2}>
              <FormControl sx={{ flexGrow: 1 }}>
                <FormLabel>Gender</FormLabel>
                <Controller
                  name="gender"
                  control={control}
                  render={({ field }) => (
                    <Select {...field} value={field.value ?? ''}>
                      <MenuItem value="male">Male</MenuItem>
                      <MenuItem value="female">Female</MenuItem>
                      <MenuItem value="other">Other</MenuItem>
                    </Select>
                  )}
                />
              </FormControl>
              <FormControl sx={{ flexGrow: 1 }}>
                <FormLabel>Role</FormLabel>
                <Controller
                  name="role"
                  control={control}
                  render={({ field }) => (
                    <Select {...field} value={field.value ?? ''}>
                      <MenuItem value="">—</MenuItem>
                      <MenuItem value="husband">Husband</MenuItem>
                      <MenuItem value="wife">Wife</MenuItem>
                      <MenuItem value="son">Son</MenuItem>
                      <MenuItem value="daughter">Daughter</MenuItem>
                      <MenuItem value="other">Other</MenuItem>
                    </Select>
                  )}
                />
              </FormControl>
            </Stack>
            <Stack direction="row" spacing={2}>
              <TextField
                label="Birth date"
                type="date"
                sx={{ flexGrow: 1 }}
                InputLabelProps={{ shrink: true }}
                {...register('birthDate')}
              />
              <TextField
                label="Death date"
                type="date"
                sx={{ flexGrow: 1 }}
                InputLabelProps={{ shrink: true }}
                {...register('deathDate')}
              />
            </Stack>
            <TextField
              label="Email"
              type="email"
              error={Boolean(errors.email)}
              helperText={errors.email?.message}
              {...register('email')}
            />
            <TextField label="Phone" {...register('phone')} />
            <TextField label="WhatsApp" {...register('whatsapp')} />
            <TextField label="Occupation" {...register('occupation')} />
            <FormControl>
              <FormLabel>Status</FormLabel>
              <Controller
                name="status"
                control={control}
                render={({ field }) => (
                  <Select {...field} value={field.value ?? ''}>
                    <MenuItem value="active">Active</MenuItem>
                    <MenuItem value="inactive">Inactive</MenuItem>
                  </Select>
                )}
              />
            </FormControl>
            {mutation.isError && <Alert severity="error">{(mutation.error as Error).message}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={mutation.isPending}>
            {initial ? 'Save changes' : 'Create member'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
