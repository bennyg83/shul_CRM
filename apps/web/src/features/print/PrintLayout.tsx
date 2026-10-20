import type { ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  GlobalStyles,
  Stack,
  Typography,
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import { ShulMark } from '@/app/layout/AppShell';
import { useSettings } from '@/features/settings/useSettings';

/** Screen: a toolbar with Print; paper: just the pages. */
export function PrintLayout({
  title,
  loading,
  error,
  empty,
  children,
}: {
  title: string;
  loading?: boolean;
  error?: unknown;
  empty?: string | false;
  children?: ReactNode;
}) {
  return (
    <Box
      sx={{
        bgcolor: '#eee',
        minHeight: '100vh',
        py: { xs: 0, sm: 3 },
        '@media print': { bgcolor: '#fff', py: 0 },
      }}
    >
      <GlobalStyles styles={{ '@page': { size: 'auto', margin: '18mm 16mm' } }} />
      <Stack
        direction="row"
        alignItems="center"
        spacing={2}
        sx={{
          maxWidth: '210mm',
          mx: 'auto',
          mb: 2,
          px: { xs: 2, sm: 0 },
          pt: { xs: 2, sm: 0 },
          '@media print': { display: 'none' },
        }}
      >
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          {title}
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ display: { xs: 'none', md: 'block' } }}
        >
          To save a PDF, choose “Save as PDF” in the print dialog.
        </Typography>
        <Button
          startIcon={<PrintIcon />}
          onClick={() => window.print()}
          disabled={loading || Boolean(error) || Boolean(empty)}
        >
          Print
        </Button>
      </Stack>
      {loading && (
        <Stack alignItems="center" sx={{ py: 8 }}>
          <CircularProgress />
        </Stack>
      )}
      {Boolean(error) && (
        <Alert severity="error" sx={{ maxWidth: '210mm', mx: 'auto' }}>
          {(error as Error).message}
        </Alert>
      )}
      {empty && !loading && !error && (
        <Alert severity="info" sx={{ maxWidth: '210mm', mx: 'auto' }}>
          {empty}
        </Alert>
      )}
      {!loading && !error && !empty && children}
    </Box>
  );
}

/** One sheet of paper; each starts on a new page when printed. */
export function Page({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        bgcolor: '#fff',
        maxWidth: '210mm',
        mx: 'auto',
        mb: 3,
        p: { xs: 3, sm: '16mm' },
        boxShadow: 1,
        fontSize: 14,
        lineHeight: 1.55,
        color: '#222',
        '@media print': { boxShadow: 'none', p: 0, m: 0, maxWidth: 'none', breakAfter: 'page' },
        '&:last-of-type': { '@media print': { breakAfter: 'auto' } },
      }}
    >
      {children}
    </Box>
  );
}

/** The shul's letterhead: logo or initials, name, and contact lines. */
export function Letterhead() {
  const { org } = useSettings();
  const contact = [
    org.address,
    [org.city, org.country].filter(Boolean).join(', '),
    org.phone,
    org.email,
    org.website,
  ].filter(Boolean);
  return (
    <Stack
      direction="row"
      spacing={2}
      alignItems="center"
      sx={{ pb: 2, mb: 3, borderBottom: 2, borderColor: 'primary.main' }}
    >
      <ShulMark size={56} />
      <Box>
        <Typography sx={{ fontSize: 20, fontWeight: 700, color: 'primary.dark' }}>
          {org.name}
        </Typography>
        <Typography sx={{ fontSize: 12, color: '#555' }}>{contact.join(' · ')}</Typography>
      </Box>
    </Stack>
  );
}

/** Recipient block: name and postal address. */
export function AddressBlock({ name, lines }: { name: string; lines: string[] }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Typography sx={{ fontWeight: 600 }}>{name}</Typography>
      {lines.map((l) => (
        <Typography key={l}>{l}</Typography>
      ))}
    </Box>
  );
}

/** Plain text with blank-line paragraphs, as letters and templates are written. */
export function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n\s*\n/).map((p, i) => (
        <Typography key={i} sx={{ mb: 1.5, whiteSpace: 'pre-line' }}>
          {p}
        </Typography>
      ))}
    </>
  );
}
