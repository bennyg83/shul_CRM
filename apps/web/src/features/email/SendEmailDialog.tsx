import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
  Stack,
  Typography,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import type { SendEmailRequest, SendEmailResult } from '@shulcrm/shared';
import { sendEmails } from '@/features/core/service';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  template: string;
  recipients: SendEmailRequest['recipients'];
}

/** Preview, then send, one template to one or many families. */
export function SendEmailDialog({ open, onClose, title, template, recipients }: Props) {
  const queryClient = useQueryClient();
  const [index, setIndex] = useState(0);
  const preview = useMutation({
    mutationFn: () => sendEmails({ template, recipients, dryRun: true }),
  });
  const send = useMutation({
    mutationFn: () => sendEmails({ template, recipients }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['email-log'] }),
  });

  useEffect(() => {
    if (!open) return;
    setIndex(0);
    send.reset();
    preview.mutate();
    // Re-render the preview each time the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const data: SendEmailResult | undefined = send.data ?? preview.data;
  const messages = data?.messages ?? [];
  const sendable = messages.filter((m) => !m.problem).length;
  const current = messages[index];
  const error = (preview.error ?? send.error) as Error | null;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers>
        {preview.isPending && (
          <Stack alignItems="center" sx={{ py: 4 }}>
            <CircularProgress size={28} />
          </Stack>
        )}
        {error && <Alert severity="error">{error.message}</Alert>}
        {data && (
          <Stack spacing={2}>
            {data.testMode && !send.data && (
              <Alert severity="info">
                Test mode is on, so nothing is actually sent: messages are only recorded in the
                email log. Turn it off in{' '}
                <Link component={RouterLink} to="/settings?tab=email" onClick={onClose}>
                  Settings → Email
                </Link>{' '}
                once the mail server is set up.
              </Alert>
            )}
            {send.data && (
              <Alert severity={send.data.failed > 0 ? 'warning' : 'success'}>
                {send.data.testMode ? 'Recorded (test mode)' : 'Sent'}: {send.data.sent}
                {send.data.failed > 0 && `, failed: ${send.data.failed}`}
                {send.data.skipped > 0 && `, no address: ${send.data.skipped}`}.
              </Alert>
            )}
            {!send.data && (
              <Typography variant="body2" color="text.secondary">
                {messages.length} message{messages.length === 1 ? '' : 's'}; {sendable} can be sent
                {messages.length > sendable &&
                  `, ${messages.length - sendable} ${messages.length - sendable === 1 ? 'has' : 'have'} no email address`}
                .
              </Typography>
            )}
            {messages.some((m) => m.problem) && (
              <Alert severity="warning">
                {messages
                  .filter((m) => m.problem)
                  .slice(0, 8)
                  .map((m) => `${m.familyName}: ${m.problem}`)
                  .join('; ')}
              </Alert>
            )}
            {current && (
              <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2 }}>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  sx={{ mb: 1 }}
                >
                  <Typography variant="body2" color="text.secondary">
                    To: {current.to ?? '— no address —'}
                  </Typography>
                  {messages.length > 1 && (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Button
                        size="small"
                        variant="text"
                        disabled={index === 0}
                        onClick={() => setIndex((i) => i - 1)}
                      >
                        Previous
                      </Button>
                      <Typography variant="caption">
                        {index + 1} / {messages.length}
                      </Typography>
                      <Button
                        size="small"
                        variant="text"
                        disabled={index >= messages.length - 1}
                        onClick={() => setIndex((i) => i + 1)}
                      >
                        Next
                      </Button>
                    </Stack>
                  )}
                </Stack>
                <Typography sx={{ fontWeight: 700, mb: 1 }}>{current.subject}</Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
                  {current.text}
                </Typography>
              </Box>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button variant="text" onClick={onClose}>
          {send.data ? 'Close' : 'Cancel'}
        </Button>
        {!send.data && (
          <Button
            disabled={!data || sendable === 0 || send.isPending}
            onClick={() => send.mutate()}
          >
            {data?.testMode ? `Record ${sendable} (test mode)` : `Send ${sendable}`}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
