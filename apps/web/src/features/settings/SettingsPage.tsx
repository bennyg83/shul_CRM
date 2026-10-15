import { useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Stack, Typography } from '@mui/material';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { resetData } from '@/features/core/service';
import { ConfirmDialog } from '@/components/ConfirmDialog';

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [confirmReset, setConfirmReset] = useState(false);
  const resetMutation = useMutation({
    mutationFn: resetData,
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 3 }}>
        Settings
      </Typography>
      <Card sx={{ maxWidth: 560 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 1 }}>
            Demo data
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            This sandbox build persists all data in your browser (localStorage). Resetting restores
            the original seeded families, members, pledges, donations, and dates.
          </Typography>
          {resetMutation.isError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {(resetMutation.error as Error).message}
            </Alert>
          )}
          {resetMutation.isSuccess && (
            <Alert severity="success" sx={{ mb: 2 }}>
              Demo data has been reset to the original seed.
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
              Reset demo data
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmReset}
        title="Reset demo data"
        message="Reset all data back to the original seed? This cannot be undone."
        confirmLabel="Reset"
        onConfirm={() => {
          setConfirmReset(false);
          resetMutation.mutate();
        }}
        onClose={() => setConfirmReset(false)}
      />
    </Box>
  );
}
