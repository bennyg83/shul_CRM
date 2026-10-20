import { useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Stack, Tab, Tabs, Typography } from '@mui/material';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { resetData } from '@/features/core/service';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { OrgSettings } from './OrgSettings';
import { ListsSettings } from './ListsSettings';
import { FeaturesSettings, TermsSettings } from './TermsFeaturesSettings';
import { ImportExport } from './ImportExport';
import { EmailSettings } from './EmailSettings';
import { Backups } from './Backups';

const TABS = [
  { key: 'org', label: 'Organization' },
  { key: 'lists', label: 'Lists' },
  { key: 'terms', label: 'Terms' },
  { key: 'features', label: 'Features' },
  { key: 'email', label: 'Email' },
  { key: 'data', label: 'Data' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

function DemoData() {
  const queryClient = useQueryClient();
  const [confirmReset, setConfirmReset] = useState(false);
  const resetMutation = useMutation({
    mutationFn: resetData,
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Demo data
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Replace every family, member, pledge, donation, date and note with the demo set (a backup
          is made first). Settings (name, logo, lists) are kept. Use this only on a demo install.
        </Typography>
        {resetMutation.isError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {(resetMutation.error as Error).message}
          </Alert>
        )}
        {resetMutation.isSuccess && (
          <Alert severity="success" sx={{ mb: 2 }}>
            The demo data has been restored.
          </Alert>
        )}
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            color="error"
            startIcon={<RestartAltIcon />}
            disabled={resetMutation.isPending}
            onClick={() => setConfirmReset(true)}
          >
            Reset to demo data
          </Button>
        </Stack>
      </CardContent>
      <ConfirmDialog
        open={confirmReset}
        title="Reset to demo data"
        message="Delete all records and load the demo set? This cannot be undone."
        confirmLabel="Reset"
        onConfirm={() => {
          setConfirmReset(false);
          resetMutation.mutate();
        }}
        onClose={() => setConfirmReset(false)}
      />
    </Card>
  );
}

export function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const tab: TabKey = TABS.some((t) => t.key === params.get('tab'))
    ? (params.get('tab') as TabKey)
    : 'org';

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>
        Settings
      </Typography>
      <Tabs
        value={tab}
        onChange={(_, v: TabKey) => setParams({ tab: v }, { replace: true })}
        variant="scrollable"
        allowScrollButtonsMobile
        sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
      >
        {TABS.map((t) => (
          <Tab key={t.key} value={t.key} label={t.label} />
        ))}
      </Tabs>
      {tab === 'org' && <OrgSettings />}
      {tab === 'lists' && <ListsSettings />}
      {tab === 'terms' && <TermsSettings />}
      {tab === 'features' && <FeaturesSettings />}
      {tab === 'email' && <EmailSettings />}
      {tab === 'data' && (
        <Stack spacing={2}>
          <Backups />
          <ImportExport />
          <DemoData />
        </Stack>
      )}
    </Box>
  );
}
