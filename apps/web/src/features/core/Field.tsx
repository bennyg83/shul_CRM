import { Stack, Typography } from '@mui/material';

/** A label/value pair for read-only detail views. */
export function Field({ label, value }: { label: string; value?: string | number }) {
  return (
    <Stack sx={{ minWidth: 140 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body1">{value ? String(value) : '—'}</Typography>
    </Stack>
  );
}
