import type { ReactNode } from 'react';
import { Box, Card, CardContent, Stack, Typography } from '@mui/material';
import { logoUrl } from '@/features/core/service';
import { initials } from '@/app/initials';
import { useBranding } from '@/features/auth/branding';

/**
 * The centered card every sign-in screen sits in, with the shul's branding on top.
 * Shared by LoginPage, SetupPage and WelcomePage so all three look like one place.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  const { data: branding } = useBranding();
  const name = branding?.name ?? 'Synagogue CRM';
  const color = branding?.primaryColor ?? '#1f4e5f';

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        bgcolor: 'background.default',
        p: 2,
      }}
    >
      <Card sx={{ width: '100%', maxWidth: 440 }}>
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
          <Stack spacing={1.5} alignItems="center" sx={{ mb: 3 }}>
            {branding?.hasLogo ? (
              <Box
                component="img"
                src={logoUrl(branding.logoVersion)}
                alt={`${name} logo`}
                sx={{ width: 64, height: 64, objectFit: 'contain', borderRadius: 1 }}
              />
            ) : (
              <Box
                aria-hidden
                sx={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  bgcolor: color,
                  color: 'common.white',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 800,
                  fontSize: 24,
                }}
              >
                {initials(branding?.shortName ?? name)}
              </Box>
            )}
            <Typography variant="h6" align="center" sx={{ fontWeight: 700 }}>
              {name}
            </Typography>
          </Stack>
          {children}
        </CardContent>
      </Card>
    </Box>
  );
}
