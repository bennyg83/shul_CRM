import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  portalFamilySchema,
  portalMemberSchema,
  type Member,
  type PortalFamilyInput,
  type PortalMemberInput,
} from '@shulcrm/shared';
import { addPortalMember, savePortalFamily, savePortalMember } from '@/features/core/service';
import { useSettings } from '@/features/settings/useSettings';
import { Field } from '@/features/core/Field';
import { fullName, portalKeys, useDateFormat, usePortalHome } from './usePortalData';

const GENDERS: Array<{ value: PortalMemberInput['gender']; label: string }> = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Prefer not to say' },
];

/**
 * Empty fields are sent as blank strings rather than left out: the API reads a blank string as
 * "clear this", and its schemas do not accept nulls.
 */
const text = (value: string | undefined) => value ?? '';

export function PortalFamily() {
  const settings = useSettings();
  const queryClient = useQueryClient();
  const formatDate = useDateFormat();
  const { data: home } = usePortalHome();
  const [editing, setEditing] = useState<Member | null>(null);
  const [adding, setAdding] = useState(false);

  const canEdit = home?.canEdit ?? false;
  const family = home?.family;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<PortalFamilyInput>({ resolver: zodResolver(portalFamilySchema) });

  // Fill the form once the family arrives, and again after a save returns the stored values.
  useEffect(() => {
    if (!family) return;
    reset({
      address: text(family.address),
      city: text(family.city),
      zip: text(family.zip),
      country: text(family.country),
      phone: text(family.phone),
      whatsapp: text(family.whatsapp),
      email: text(family.email),
    });
  }, [family, reset]);

  const save = useMutation({
    mutationFn: (values: PortalFamilyInput) =>
      savePortalFamily({
        address: text(values.address),
        city: text(values.city),
        zip: text(values.zip),
        country: text(values.country),
        phone: text(values.phone),
        whatsapp: text(values.whatsapp),
        email: text(values.email),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: portalKeys.home }),
  });

  const onSubmit = handleSubmit((values) => save.mutate(values));

  if (!home || !family) return null;

  return (
    <Stack spacing={3}>
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography variant="h6" sx={{ mb: 0.5 }}>
          {family.name}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
          The office looks after your {settings.t('family').toLowerCase()} name and your membership
          status, so those are not changed here. Everything below is yours to keep up to date.
        </Typography>

        <form onSubmit={onSubmit} noValidate>
          <Stack spacing={2.5}>
            <TextField
              label="Address"
              multiline
              minRows={2}
              disabled={!canEdit}
              error={Boolean(errors.address)}
              helperText={errors.address?.message}
              {...register('address')}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Town or city"
                fullWidth
                disabled={!canEdit}
                error={Boolean(errors.city)}
                helperText={errors.city?.message}
                {...register('city')}
              />
              <TextField
                label="Postcode"
                fullWidth
                disabled={!canEdit}
                error={Boolean(errors.zip)}
                helperText={errors.zip?.message}
                {...register('zip')}
              />
            </Stack>
            <TextField
              label="Country"
              disabled={!canEdit}
              error={Boolean(errors.country)}
              helperText={errors.country?.message}
              {...register('country')}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Phone"
                type="tel"
                fullWidth
                disabled={!canEdit}
                error={Boolean(errors.phone)}
                helperText={errors.phone?.message}
                {...register('phone')}
              />
              <TextField
                label="WhatsApp"
                type="tel"
                fullWidth
                disabled={!canEdit}
                error={Boolean(errors.whatsapp)}
                helperText={errors.whatsapp?.message}
                {...register('whatsapp')}
              />
            </Stack>
            <TextField
              label="Email"
              type="email"
              disabled={!canEdit}
              error={Boolean(errors.email)}
              helperText={errors.email?.message}
              {...register('email')}
            />

            {save.isError && (
              <Alert severity="warning">
                {save.error instanceof Error
                  ? save.error.message
                  : 'Your changes were not saved. Please try again.'}
              </Alert>
            )}
            {save.isSuccess && !isDirty && <Alert severity="success">Saved. Thank you.</Alert>}

            {canEdit && (
              <Box>
                <Button type="submit" variant="contained" size="large" disabled={save.isPending}>
                  {save.isPending ? 'Saving…' : 'Save our details'}
                </Button>
              </Box>
            )}
          </Stack>
        </form>
      </Paper>

      <Stack spacing={2}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
        >
          <Typography variant="h6">Our {settings.t('family').toLowerCase()}</Typography>
          {canEdit && (
            <Button variant="outlined" onClick={() => setAdding(true)}>
              Add someone
            </Button>
          )}
        </Stack>

        {home.members.map((member) => (
          <Paper key={member.id} variant="outlined" sx={{ p: { xs: 2, sm: 2.5 } }}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1.5}
              sx={{ justifyContent: 'space-between', alignItems: { sm: 'flex-start' } }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  {fullName(member)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {settings.label('memberRoles', member.role) || '—'}
                </Typography>
              </Box>
              {canEdit && (
                <Button
                  size="small"
                  variant="text"
                  aria-label={`Edit ${fullName(member)}`}
                  onClick={() => setEditing(member)}
                >
                  Edit
                </Button>
              )}
            </Stack>
            <Stack
              direction="row"
              useFlexGap
              flexWrap="wrap"
              spacing={2}
              sx={{ mt: 1.5, rowGap: 1.5 }}
            >
              <Field label="Hebrew name" value={member.hebrewName} />
              <Field label="Birth date" value={formatDate(member.birthDate)} />
              <Field label="Email" value={member.email} />
              <Field label="Phone" value={member.phone} />
            </Stack>
          </Paper>
        ))}
      </Stack>

      <MemberDialog
        open={adding || editing !== null}
        member={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
      />
    </Stack>
  );
}

function MemberDialog({
  open,
  member,
  onClose,
}: {
  open: boolean;
  member: Member | null;
  onClose: () => void;
}) {
  const settings = useSettings();
  const queryClient = useQueryClient();
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PortalMemberInput>({ resolver: zodResolver(portalMemberSchema) });

  useEffect(() => {
    if (!open) return;
    reset({
      firstName: text(member?.firstName),
      lastName: text(member?.lastName),
      hebrewName: text(member?.hebrewName),
      fatherHebrewName: text(member?.fatherHebrewName),
      motherHebrewName: text(member?.motherHebrewName),
      // Left unanswered for someone new, so nothing is assumed on their behalf.
      gender: member?.gender,
      role: text(member?.role),
      birthDate: text(member?.birthDate),
      email: text(member?.email),
      phone: text(member?.phone),
      whatsapp: text(member?.whatsapp),
      occupation: text(member?.occupation),
    });
  }, [open, member, reset]);

  const save = useMutation({
    mutationFn: (values: PortalMemberInput) =>
      member ? savePortalMember(member.id, values) : addPortalMember(values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: portalKeys.home });
      onClose();
    },
  });

  const onSubmit = handleSubmit((values) => save.mutate(values));
  const roles = settings.options('memberRoles', member?.role);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{member ? `Edit ${fullName(member)}` : 'Add someone to our family'}</DialogTitle>
      <form onSubmit={onSubmit} noValidate>
        <DialogContent dividers>
          <Stack spacing={2.5} sx={{ mt: 0.5 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="First name"
                required
                fullWidth
                error={Boolean(errors.firstName)}
                helperText={errors.firstName?.message}
                {...register('firstName')}
              />
              <TextField
                label="Last name"
                required
                fullWidth
                error={Boolean(errors.lastName)}
                helperText={errors.lastName?.message}
                {...register('lastName')}
              />
            </Stack>
            <TextField
              label="Hebrew name"
              inputProps={{ dir: 'auto' }}
              error={Boolean(errors.hebrewName)}
              helperText={errors.hebrewName?.message}
              {...register('hebrewName')}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Father's Hebrew name"
                fullWidth
                inputProps={{ dir: 'auto' }}
                {...register('fatherHebrewName')}
              />
              <TextField
                label="Mother's Hebrew name"
                fullWidth
                inputProps={{ dir: 'auto' }}
                {...register('motherHebrewName')}
              />
            </Stack>
            <FormControl error={Boolean(errors.gender)}>
              <FormLabel id="portal-member-gender">Male or female</FormLabel>
              <Controller
                name="gender"
                control={control}
                render={({ field }) => (
                  <Select
                    {...field}
                    value={field.value ?? ''}
                    inputProps={{ 'aria-labelledby': 'portal-member-gender' }}
                  >
                    {GENDERS.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </Select>
                )}
              />
              {errors.gender && (
                <Typography variant="caption" color="error">
                  Please choose one, so we know how to call them up in shul.
                </Typography>
              )}
            </FormControl>
            <FormControl error={Boolean(errors.role)}>
              <FormLabel id="portal-member-role">
                Who they are in the {settings.t('family').toLowerCase()}
              </FormLabel>
              <Controller
                name="role"
                control={control}
                render={({ field }) => (
                  <Select
                    {...field}
                    value={field.value ?? ''}
                    inputProps={{ 'aria-labelledby': 'portal-member-role' }}
                  >
                    <MenuItem value="">Not sure</MenuItem>
                    {roles.map((role) => (
                      <MenuItem key={role.key} value={role.key}>
                        {role.label}
                      </MenuItem>
                    ))}
                  </Select>
                )}
              />
            </FormControl>
            <TextField
              label="Birth date"
              type="date"
              InputLabelProps={{ shrink: true }}
              error={Boolean(errors.birthDate)}
              helperText={errors.birthDate?.message}
              {...register('birthDate')}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Email"
                type="email"
                fullWidth
                error={Boolean(errors.email)}
                helperText={errors.email?.message}
                {...register('email')}
              />
              <TextField label="Phone" type="tel" fullWidth {...register('phone')} />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="WhatsApp" type="tel" fullWidth {...register('whatsapp')} />
              <TextField label="Occupation" fullWidth {...register('occupation')} />
            </Stack>
            {save.isError && (
              <Alert severity="warning">
                {save.error instanceof Error
                  ? save.error.message
                  : 'That could not be saved. Please try again.'}
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={save.isPending}>
            {member ? 'Save changes' : 'Add them'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
