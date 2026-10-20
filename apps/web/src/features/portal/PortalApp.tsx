import { useState } from 'react';
import {
  Alert,
  AlertTitle,
  AppBar,
  Box,
  Button,
  CircularProgress,
  Container,
  Paper,
  Stack,
  Tab,
  Tabs,
  Toolbar,
  Typography,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { logoUrl } from '@/features/core/service';
import { initials } from '@/app/initials';
import { useBranding } from '@/features/auth/branding';
import { UserMenu } from '@/features/auth/UserMenu';
import { useSettings } from '@/features/settings/useSettings';
import { usePortalHome } from './usePortalData';
import { PortalFamily } from './PortalFamily';
import { PortalDates } from './PortalDates';
import { PortalAccount } from './PortalAccount';
import { PortalSponsorships } from './PortalSponsorships';

/** The shul's logo, or its initials on the shul's own colour when no logo is uploaded. */
function ShulLogo({
  name,
  color,
  hasLogo,
  version,
}: {
  name: string;
  color: string;
  hasLogo: boolean;
  version?: string;
}) {
  if (hasLogo) {
    return (
      <Box
        component="img"
        src={logoUrl(version)}
        alt={`${name} logo`}
        sx={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 1, flexShrink: 0 }}
      />
    );
  }
  return (
    <Box
      aria-hidden
      sx={{
        width: 40,
        height: 40,
        flexShrink: 0,
        borderRadius: 2,
        bgcolor: color,
        color: 'common.white',
        display: 'grid',
        placeItems: 'center',
        fontWeight: 700,
      }}
    >
      {initials(name)}
    </Box>
  );
}

export function PortalApp() {
  const theme = useTheme();
  const { data: branding } = useBranding();
  const { features } = useSettings();
  const { data: home, isPending, isError, error, refetch, isFetching } = usePortalHome();
  const [tab, setTab] = useState(0);

  const name = branding?.name ?? 'Our synagogue';
  const color = branding?.primaryColor ?? theme.palette.primary.main;

  // Sponsorships live with events, so the tab only makes sense when the shul uses them.
  const tabs = [
    { label: 'My family', panel: <PortalFamily /> },
    { label: 'Our dates', panel: <PortalDates /> },
    { label: 'What we owe', panel: <PortalAccount /> },
    ...(features.events ? [{ label: 'Sponsor something', panel: <PortalSponsorships /> }] : []),
  ];
  const current = tabs[tab] ?? tabs[0];

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar
        position="sticky"
        elevation={0}
        color="inherit"
        sx={{
          bgcolor: 'background.paper',
          borderBottom: `1px solid ${alpha(theme.palette.primary.main, 0.12)}`,
        }}
      >
        <Toolbar sx={{ gap: 1.5 }}>
          <ShulLogo
            name={branding?.shortName ?? name}
            color={color}
            hasLogo={branding?.hasLogo ?? false}
            version={branding?.logoVersion}
          />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" noWrap sx={{ fontWeight: 700 }} title={name}>
              {name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Member portal
            </Typography>
          </Box>
          <Box sx={{ flexGrow: 1 }} />
          <UserMenu />
        </Toolbar>
        {!isError && (
          <Tabs
            value={tab}
            onChange={(_event, value: number) => setTab(value)}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            aria-label="Portal sections"
            sx={{ px: { xs: 1, sm: 2 }, minHeight: 56 }}
          >
            {tabs.map((item, index) => (
              <Tab
                key={item.label}
                label={item.label}
                id={`portal-tab-${index}`}
                aria-controls="portal-panel"
                sx={{ minHeight: 56, textTransform: 'none', fontSize: '1rem' }}
              />
            ))}
          </Tabs>
        )}
      </AppBar>

      <Container maxWidth="md" sx={{ py: { xs: 2, sm: 4 } }}>
        {isPending && (
          <Stack alignItems="center" sx={{ py: 8 }}>
            <CircularProgress aria-label="Loading your details" />
          </Stack>
        )}

        {isError && (
          <Paper variant="outlined" sx={{ p: { xs: 2.5, sm: 4 } }}>
            <Alert severity="warning" sx={{ mb: 2 }}>
              <AlertTitle>We could not load your details just now</AlertTitle>
              {error instanceof Error ? error.message : 'Please try again in a moment.'}
            </Alert>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              If this keeps happening, please let the office know and they will help.
            </Typography>
            <Button variant="contained" onClick={() => void refetch()} disabled={isFetching}>
              Try again
            </Button>
          </Paper>
        )}

        {home && (
          <Stack spacing={3}>
            {!home.canEdit && (
              <Alert severity="info">
                <AlertTitle>Your details are read-only at the moment</AlertTitle>
                Your membership is marked as inactive, so changes need to go through the office. You
                can still see everything here, and the office will be glad to help.
              </Alert>
            )}
            <Box role="tabpanel" id="portal-panel" aria-labelledby={`portal-tab-${tab}`}>
              {current.panel}
            </Box>
          </Stack>
        )}
      </Container>
    </Box>
  );
}
