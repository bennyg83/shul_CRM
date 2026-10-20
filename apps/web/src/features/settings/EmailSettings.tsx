import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControlLabel,
  Grid,
  MenuItem,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DEFAULT_EMAIL_TEMPLATES,
  TEMPLATE_VARIABLES,
  emailTemplateSchema,
  type EmailSettings as EmailSettingsShape,
  type EmailTemplate,
} from '@shulcrm/shared';
import {
  getEmailLog,
  getEmailSettings,
  getEmailTemplates,
  saveEmailSettings,
  saveEmailTemplates,
  sendTestEmail,
} from '@/features/core/service';

function ServerCard() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ['email-settings'], queryFn: getEmailSettings });
  const [draft, setDraft] = useState<EmailSettingsShape & { clearPassword?: boolean }>({
    port: 587,
    secure: false,
    testMode: true,
  });
  const [testTo, setTestTo] = useState('');
  useEffect(() => {
    if (!data) return;
    const { hasPassword: _hasPassword, ...rest } = data;
    setDraft({ ...rest, password: '' });
  }, [data]);
  const save = useMutation({
    mutationFn: () => saveEmailSettings(draft),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['email-settings'] }),
  });
  const test = useMutation({
    mutationFn: () => sendTestEmail(testTo),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['email-log'] }),
  });
  const set = (patch: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...patch }));
  const text = (
    key: 'host' | 'user' | 'fromName' | 'fromAddress' | 'replyTo',
    label: string,
    help?: string,
  ) => (
    <TextField
      label={label}
      fullWidth
      value={draft[key] ?? ''}
      helperText={help}
      onChange={(e) => set({ [key]: e.target.value })}
    />
  );

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Mail server
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          The SMTP details from your email provider. While test mode is on, messages are only
          recorded in the log below.
        </Typography>
        <FormControlLabel
          sx={{ mb: 2 }}
          control={
            <Switch
              checked={draft.testMode}
              onChange={(e) => set({ testMode: e.target.checked })}
            />
          }
          label={draft.testMode ? 'Test mode: nothing is sent' : 'Live: messages are sent'}
        />
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            {text('host', 'SMTP server', 'e.g. smtp.gmail.com')}
          </Grid>
          <Grid item xs={6} sm={3}>
            <TextField
              label="Port"
              type="number"
              fullWidth
              value={draft.port}
              onChange={(e) => set({ port: Number(e.target.value) || 0 })}
              helperText="587, or 465 with TLS"
            />
          </Grid>
          <Grid item xs={6} sm={3}>
            <FormControlLabel
              control={
                <Switch
                  checked={draft.secure}
                  onChange={(e) => set({ secure: e.target.checked })}
                />
              }
              label="TLS (465)"
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            {text('user', 'User name')}
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Password"
              type="password"
              fullWidth
              autoComplete="new-password"
              value={draft.password ?? ''}
              onChange={(e) => set({ password: e.target.value, clearPassword: false })}
              helperText={data?.hasPassword ? 'Saved. Leave empty to keep it.' : 'Not set'}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            {text('fromName', 'From name', 'Defaults to the shul’s name')}
          </Grid>
          <Grid item xs={12} sm={4}>
            {text('fromAddress', 'From address')}
          </Grid>
          <Grid item xs={12} sm={4}>
            {text('replyTo', 'Reply-to address')}
          </Grid>
        </Grid>
        {save.isError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {(save.error as Error).message}
          </Alert>
        )}
        {save.isSuccess && (
          <Alert severity="success" sx={{ mt: 2 }}>
            Saved.
          </Alert>
        )}
        <Stack direction="row" spacing={1} sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
          {data?.hasPassword && (
            <Button
              variant="text"
              color="error"
              onClick={() => set({ password: '', clearPassword: true })}
            >
              Forget the password
            </Button>
          )}
        </Stack>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          sx={{ mt: 3 }}
          alignItems={{ sm: 'center' }}
        >
          <TextField
            size="small"
            label="Send a test to"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
          />
          <Button
            variant="outlined"
            disabled={!testTo || test.isPending}
            onClick={() => test.mutate()}
          >
            Send test
          </Button>
        </Stack>
        {test.isError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {(test.error as Error).message}
          </Alert>
        )}
        {test.data && (
          <Alert severity="success" sx={{ mt: 2 }}>
            {test.data.testMode ? 'Recorded in the log (test mode).' : 'Sent. Check the inbox.'}
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function TemplatesCard() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ['email-templates'], queryFn: getEmailTemplates });
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [key, setKey] = useState('receipt');
  useEffect(() => {
    if (data) setTemplates(data);
  }, [data]);
  const save = useMutation({
    mutationFn: () => saveEmailTemplates(templates),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['email-templates'] }),
  });
  const current = templates.find((t) => t.key === key);
  const dirty = JSON.stringify(templates) !== JSON.stringify(data);
  const valid = templates.every((t) => emailTemplateSchema.safeParse(t).success);
  const update = (patch: Partial<EmailTemplate>) =>
    setTemplates((list) => list.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  const vars = [
    ...TEMPLATE_VARIABLES.always,
    ...((TEMPLATE_VARIABLES as Record<string, readonly string[]>)[
      key === 'receipt' ? 'donation' : key
    ] ?? []),
  ];

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Templates
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          The wording of each message. Blank lines start a new paragraph. The yahrzeit template is
          also used for printed yahrzeit letters.
        </Typography>
        <Select
          size="small"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          sx={{ mb: 2, minWidth: 240 }}
          inputProps={{ 'aria-label': 'Template' }}
        >
          {templates.map((t) => (
            <MenuItem key={t.key} value={t.key}>
              {t.name}
            </MenuItem>
          ))}
        </Select>
        {current && (
          <Stack spacing={2}>
            <TextField
              label="Subject"
              fullWidth
              value={current.subject}
              onChange={(e) => update({ subject: e.target.value })}
            />
            <TextField
              label="Message"
              fullWidth
              multiline
              minRows={10}
              value={current.body}
              onChange={(e) => update({ body: e.target.value })}
            />
            <Box>
              <Typography variant="caption" color="text.secondary">
                Variables (click to copy):
              </Typography>
              <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mt: 0.5 }}>
                {vars.map((v) => (
                  <Chip
                    key={v}
                    size="small"
                    variant="outlined"
                    label={`{{${v}}}`}
                    onClick={() => void navigator.clipboard?.writeText(`{{${v}}}`)}
                  />
                ))}
              </Stack>
            </Box>
          </Stack>
        )}
        {save.isError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {(save.error as Error).message}
          </Alert>
        )}
        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
          <Button disabled={!dirty || !valid || save.isPending} onClick={() => save.mutate()}>
            Save templates
          </Button>
          <Button
            variant="text"
            onClick={() => {
              const original = DEFAULT_EMAIL_TEMPLATES.find((t) => t.key === key);
              if (original) update({ subject: original.subject, body: original.body });
            }}
          >
            Restore the original wording
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}

function LogCard() {
  const { data } = useQuery({ queryKey: ['email-log'], queryFn: getEmailLog });
  return (
    <Card>
      <CardContent>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Email log
        </Typography>
        {!data || data.length === 0 ? (
          <Typography color="text.secondary">Nothing sent yet.</Typography>
        ) : (
          <Box sx={{ overflowX: 'auto', maxHeight: 360 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>When</TableCell>
                  <TableCell>To</TableCell>
                  <TableCell>Subject</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {new Date(e.sentAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {e.toAddress}
                      {e.familyName && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          {e.familyName}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>{e.subject}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        color={
                          e.status === 'failed'
                            ? 'error'
                            : e.status === 'test'
                              ? 'default'
                              : 'success'
                        }
                        label={e.status === 'test' ? 'test mode' : e.status}
                        title={e.error}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

export function EmailSettings() {
  return (
    <Stack spacing={2}>
      <ServerCard />
      <TemplatesCard />
      <LogCard />
    </Stack>
  );
}
