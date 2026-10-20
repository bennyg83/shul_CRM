import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  FormControlLabel,
  Grid,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DEFAULT_TERMS,
  TERM_KEYS,
  termsSchema,
  type Features,
  type TermKey,
  type Terms,
} from '@shulcrm/shared';
import { saveFeatures, saveTerms } from '@/features/core/service';
import { qk } from '@/features/core/queryKeys';
import { useSettings } from './useSettings';

const TERM_HELP: Record<TermKey, string> = {
  family: 'One household, e.g. "Family" or "Household"',
  families: 'Plural',
  member: 'One person, e.g. "Member" or "Congregant"',
  members: 'Plural',
  pledge: 'A promise to give, e.g. "Pledge" or "Commitment"',
  pledges: 'Plural',
  donation: 'Money received, e.g. "Donation" or "Payment"',
  donations: 'Plural',
};

export function TermsSettings() {
  const { terms } = useSettings();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Terms>(terms);
  useEffect(() => setDraft(terms), [terms]);
  const save = useMutation({
    mutationFn: () => saveTerms(draft),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.settings }),
  });
  const dirty = JSON.stringify(draft) !== JSON.stringify(terms);
  const valid = termsSchema.safeParse(draft).success;

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Terms
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          The words used across the app, so it can speak the shul&apos;s language (for example
          &quot;Household&quot; instead of &quot;Family&quot;).
        </Typography>
        <Grid container spacing={2}>
          {TERM_KEYS.map((key) => (
            <Grid item xs={12} sm={6} key={key}>
              <TextField
                fullWidth
                label={DEFAULT_TERMS[key]}
                value={draft[key]}
                error={!draft[key].trim()}
                helperText={TERM_HELP[key]}
                onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
              />
            </Grid>
          ))}
        </Grid>
        {save.isError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {(save.error as Error).message}
          </Alert>
        )}
        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
          <Button disabled={!dirty || !valid || save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
          <Button variant="text" onClick={() => setDraft(DEFAULT_TERMS)}>
            Use the defaults
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}

const FEATURES: Array<{ key: keyof Features; label: string; help: string; later?: boolean }> = [
  {
    key: 'hebrewCalendar',
    label: 'Hebrew calendar',
    help: 'Hebrew dates, the nightfall question, and dates that repeat on their Hebrew anniversary. Off: everything repeats on the English date.',
  },
  {
    key: 'yahrzeits',
    label: 'Yahrzeits',
    help: 'Offer date types that follow the yahrzeit rules.',
  },
  {
    key: 'pledges',
    label: 'Pledges',
    help: 'Record pledges and their open balances. Donations are always on.',
  },
  {
    key: 'events',
    label: 'Events',
    help: 'Events, RSVPs and sponsorships on the calendar.',
    later: true,
  },
  {
    key: 'portal',
    label: 'Member portal',
    help: 'Let members sign in to see and update their own family.',
    later: true,
  },
];

export function FeaturesSettings() {
  const { features } = useSettings();
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: saveFeatures,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.settings }),
  });

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Features
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Switch modules off to hide them. Nothing is deleted; switching back on brings everything
          back.
        </Typography>
        <Stack spacing={1.5}>
          {FEATURES.map((f) => (
            <FormControlLabel
              key={f.key}
              control={
                <Switch
                  checked={features[f.key]}
                  disabled={save.isPending}
                  onChange={(e) => save.mutate({ ...features, [f.key]: e.target.checked })}
                />
              }
              label={
                <span>
                  <Typography component="span" fontWeight={600}>
                    {f.label}
                  </Typography>
                  {f.later && (
                    <Typography component="span" variant="caption" color="text.secondary">
                      {' '}
                      (arrives in a later phase)
                    </Typography>
                  )}
                  <Typography variant="body2" color="text.secondary">
                    {f.help}
                  </Typography>
                </span>
              }
            />
          ))}
        </Stack>
        {save.isError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {(save.error as Error).message}
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
