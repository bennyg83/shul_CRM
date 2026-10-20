import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  FormControl,
  FormControlLabel,
  FormLabel,
  Grid,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import UploadIcon from '@mui/icons-material/Upload';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { orgProfileSchema, type OrgProfile } from '@shulcrm/shared';
import { removeLogo, saveOrgProfile, uploadLogo } from '@/features/core/service';
import { qk } from '@/features/core/queryKeys';
import { ShulMark } from '@/app/layout/AppShell';
import { useSettings } from './useSettings';

const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const LOGO_MAX = 2 * 1024 * 1024;

const TIMEZONES: string[] = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf(
      'timeZone',
    );
  } catch {
    return [
      'America/New_York',
      'Europe/London',
      'Europe/Prague',
      'Asia/Jerusalem',
      'Australia/Sydney',
    ];
  }
})();

function LogoCard() {
  const { org, hasLogo } = useSettings();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const done = () => {
    setFile(null);
    void queryClient.invalidateQueries({ queryKey: qk.settings });
  };
  const upload = useMutation({ mutationFn: uploadLogo, onSuccess: done });
  const remove = useMutation({ mutationFn: removeLogo, onSuccess: done });

  const choose = (f: File | undefined) => {
    setProblem(null);
    if (!f) return;
    if (!LOGO_TYPES.includes(f.type))
      return setProblem('Use a PNG, JPEG or WebP image (SVG is not accepted).');
    if (f.size > LOGO_MAX) return setProblem('The logo must be 2 MB or smaller.');
    setFile(f);
  };

  const error = problem ?? ((upload.error ?? remove.error) as Error | null)?.message;
  return (
    <Card>
      <CardContent>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Logo
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Shown in the sidebar and the browser tab. PNG, JPEG or WebP, up to 2 MB. Without one, the
          shul&apos;s initials are shown in its color.
        </Typography>
        <Stack direction="row" spacing={3} alignItems="center" sx={{ mb: 2 }}>
          <Box sx={{ textAlign: 'center' }}>
            <ShulMark size={72} />
            <Typography variant="caption" color="text.secondary" display="block">
              Current
            </Typography>
          </Box>
          {preview && (
            <Box sx={{ textAlign: 'center' }}>
              <Box
                component="img"
                src={preview}
                alt="New logo preview"
                sx={{
                  width: 72,
                  height: 72,
                  objectFit: 'contain',
                  borderRadius: 1,
                  border: 1,
                  borderColor: 'divider',
                }}
              />
              <Typography variant="caption" color="text.secondary" display="block">
                New
              </Typography>
            </Box>
          )}
        </Stack>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <input
          ref={input}
          type="file"
          accept={LOGO_TYPES.join(',')}
          hidden
          aria-label={`${org.shortName} logo file`}
          onChange={(e) => {
            choose(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {file ? (
            <>
              <Button disabled={upload.isPending} onClick={() => upload.mutate(file)}>
                Save logo
              </Button>
              <Button variant="text" onClick={() => setFile(null)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button
              variant="outlined"
              startIcon={<UploadIcon />}
              onClick={() => input.current?.click()}
            >
              {hasLogo ? 'Replace…' : 'Upload…'}
            </Button>
          )}
          {hasLogo && !file && (
            <Button
              variant="text"
              color="error"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              Remove
            </Button>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

export function OrgSettings() {
  const settings = useSettings();
  const queryClient = useQueryClient();
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<OrgProfile>({ resolver: zodResolver(orgProfileSchema), values: settings.org });

  const save = useMutation({
    mutationFn: saveOrgProfile,
    onSuccess: (org) => {
      reset(org);
      void queryClient.invalidateQueries({ queryKey: qk.settings });
    },
  });

  const text = (name: keyof OrgProfile, label: string, required = false) => (
    <TextField
      label={label}
      required={required}
      fullWidth
      error={Boolean(errors[name])}
      helperText={errors[name]?.message}
      {...register(name)}
    />
  );

  return (
    <Grid container spacing={2}>
      <Grid item xs={12} md={8}>
        <Card>
          <CardContent>
            <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Organization
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={8}>
                  {text('name', 'Name', true)}
                </Grid>
                <Grid item xs={12} sm={4}>
                  {text('shortName', 'Short name', true)}
                </Grid>
                <Grid item xs={12}>
                  {text('address', 'Address')}
                </Grid>
                <Grid item xs={12} sm={6}>
                  {text('city', 'City')}
                </Grid>
                <Grid item xs={12} sm={6}>
                  {text('country', 'Country')}
                </Grid>
                <Grid item xs={12} sm={4}>
                  {text('phone', 'Phone')}
                </Grid>
                <Grid item xs={12} sm={4}>
                  {text('email', 'Email')}
                </Grid>
                <Grid item xs={12} sm={4}>
                  {text('website', 'Website')}
                </Grid>
                <Grid item xs={12} sm={4}>
                  <FormControl fullWidth>
                    <FormLabel>Default currency</FormLabel>
                    <Controller
                      name="defaultCurrency"
                      control={control}
                      render={({ field }) => (
                        <Select {...field} value={field.value ?? ''}>
                          {settings.options('currencies', field.value).map((c) => (
                            <MenuItem key={c.key} value={c.key}>
                              {c.label}
                            </MenuItem>
                          ))}
                        </Select>
                      )}
                    />
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    label="Locale"
                    fullWidth
                    error={Boolean(errors.locale)}
                    helperText={errors.locale?.message ?? 'e.g. en-US, en-GB, he-IL'}
                    {...register('locale')}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <FormControl fullWidth>
                    <FormLabel>Time zone</FormLabel>
                    <Controller
                      name="timezone"
                      control={control}
                      render={({ field }) => (
                        <Select
                          {...field}
                          value={field.value ?? ''}
                          MenuProps={{ sx: { maxHeight: 360 } }}
                        >
                          {[...new Set([field.value, ...TIMEZONES])].filter(Boolean).map((tz) => (
                            <MenuItem key={tz} value={tz}>
                              {tz}
                            </MenuItem>
                          ))}
                        </Select>
                      )}
                    />
                  </FormControl>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <TextField
                    label="Main color"
                    type="color"
                    fullWidth
                    error={Boolean(errors.primaryColor)}
                    helperText={errors.primaryColor?.message}
                    {...register('primaryColor')}
                  />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <TextField
                    label="Accent color"
                    type="color"
                    fullWidth
                    error={Boolean(errors.secondaryColor)}
                    helperText={errors.secondaryColor?.message}
                    {...register('secondaryColor')}
                  />
                </Grid>
                <Grid item xs={12}>
                  <FormControl>
                    <FormLabel>
                      Yahrzeit for someone who died in Adar of a regular year, in a leap year (which
                      has two Adars)
                    </FormLabel>
                    <Controller
                      name="adarYahrzeit"
                      control={control}
                      render={({ field }) => (
                        <RadioGroup {...field} row>
                          <FormControlLabel
                            value="adar1"
                            control={<Radio size="small" />}
                            label="Adar I (common Ashkenazi custom)"
                          />
                          <FormControlLabel
                            value="adar2"
                            control={<Radio size="small" />}
                            label="Adar II"
                          />
                        </RadioGroup>
                      )}
                    />
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={4}>
                  {text('taxId', 'Tax / charity number')}
                </Grid>
                <Grid item xs={12} sm={8}>
                  <TextField
                    label="Receipt footer"
                    fullWidth
                    multiline
                    minRows={2}
                    helperText='Printed on every receipt, e.g. "No goods or services were provided in return for this gift."'
                    {...register('receiptFooter')}
                  />
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary">
                    Install id: {settings.org.orgId}
                  </Typography>
                </Grid>
              </Grid>
              {save.isError && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {(save.error as Error).message}
                </Alert>
              )}
              {save.isSuccess && !isDirty && (
                <Alert severity="success" sx={{ mt: 2 }}>
                  Saved.
                </Alert>
              )}
              <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                <Button type="submit" disabled={!isDirty || save.isPending}>
                  Save
                </Button>
                <Button variant="text" disabled={!isDirty} onClick={() => reset(settings.org)}>
                  Discard changes
                </Button>
              </Stack>
            </form>
          </CardContent>
        </Card>
      </Grid>
      <Grid item xs={12} md={4}>
        <LogoCard />
      </Grid>
    </Grid>
  );
}
