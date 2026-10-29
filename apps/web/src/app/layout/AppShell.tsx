import { useEffect, useState, type ReactNode } from 'react';
import {
  AppBar,
  Box,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { NavLink, useLocation } from 'react-router-dom';

import DashboardIcon from '@mui/icons-material/Dashboard';
import PeopleIcon from '@mui/icons-material/People';
import GroupsIcon from '@mui/icons-material/Groups';
import EventNoteIcon from '@mui/icons-material/EventNote';
import StarIcon from '@mui/icons-material/Star';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import SettingsIcon from '@mui/icons-material/Settings';
import CelebrationIcon from '@mui/icons-material/Celebration';
import AssessmentIcon from '@mui/icons-material/Assessment';
import BadgeIcon from '@mui/icons-material/Badge';
import VolunteerActivismIcon from '@mui/icons-material/VolunteerActivism';
import MenuIcon from '@mui/icons-material/Menu';
import { useSettings } from '@/features/settings/useSettings';
import { logoUrl } from '@/features/core/service';
import { initials } from '@/app/initials';
import { useAuth } from '@/features/auth/useAuth';
import { UserMenu } from '@/features/auth/UserMenu';

const DRAWER_WIDTH = 256;

interface NavItem {
  label: string;
  path: string;
  icon: ReactNode;
}

/** The shul's logo, or its initials on its color when none is uploaded. */
export function ShulMark({ size = 36 }: { size?: number }) {
  const { org, hasLogo, logoVersion } = useSettings();
  const theme = useTheme();
  if (hasLogo) {
    return (
      <Box
        component="img"
        src={logoUrl(logoVersion)}
        alt={`${org.shortName} logo`}
        sx={{ width: size, height: size, objectFit: 'contain', borderRadius: 1, flexShrink: 0 }}
      />
    );
  }
  return (
    <Box
      aria-hidden
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: 2,
        background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
        display: 'grid',
        placeItems: 'center',
        color: theme.palette.secondary.light,
        fontWeight: 800,
        fontSize: size * 0.4,
      }}
    >
      {initials(org.shortName)}
    </Box>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { org, features, t } = useSettings();
  const { can } = useAuth();

  // Close the phone menu after navigating.
  useEffect(() => setMobileOpen(false), [location.pathname]);

  const navItems: NavItem[] = [
    { label: 'Dashboard', path: '/', icon: <DashboardIcon /> },
    { label: t('families'), path: '/families', icon: <GroupsIcon /> },
    { label: t('members'), path: '/members', icon: <PeopleIcon /> },
    {
      label: features.pledges ? `${t('pledges')} & ${t('donations')}` : t('donations'),
      path: '/pledges',
      icon: <StarIcon />,
    },
    { label: 'Important Dates', path: '/dates', icon: <EventNoteIcon /> },
    { label: 'Calendar', path: '/calendar', icon: <CalendarMonthIcon /> },
    ...(features.events ? [{ label: 'Events', path: '/events', icon: <CelebrationIcon /> }] : []),
    ...(features.events || features.portal
      ? [{ label: 'Kiddush registrations', path: '/sponsorships', icon: <VolunteerActivismIcon /> }]
      : []),
    { label: 'Reports', path: '/reports', icon: <AssessmentIcon /> },
    ...(can('users.manage') ? [{ label: 'Users', path: '/users', icon: <BadgeIcon /> }] : []),
    // Settings holds nothing a staff member or viewer is allowed to change.
    ...(can('settings.write') ? [{ label: 'Settings', path: '/settings', icon: <SettingsIcon /> }] : []),
  ];
  const divider = alpha(theme.palette.primary.main, 0.12);

  const drawer = (
    <>
      <Toolbar sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <ShulMark />
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="subtitle1"
            noWrap
            sx={{ fontWeight: 700, color: 'primary.dark', lineHeight: 1.1 }}
            title={org.name}
          >
            {org.shortName}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Synagogue CRM
          </Typography>
        </Box>
      </Toolbar>
      <List sx={{ px: 1.5, py: 1 }}>
        {navItems.map((item) => {
          const active = location.pathname === item.path;
          return (
            <ListItemButton
              key={item.path}
              component={NavLink}
              to={item.path}
              sx={{
                mb: 0.5,
                borderRadius: 2,
                color: active ? 'primary.main' : 'text.primary',
                bgcolor: active ? 'primary.light' : 'transparent',
                fontWeight: active ? 700 : 500,
                '& .MuiListItemIcon-root': { color: active ? 'primary.main' : 'text.secondary' },
              }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          );
        })}
      </List>
    </>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Drawer
        variant={isDesktop ? 'permanent' : 'temporary'}
        open={isDesktop || mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          width: isDesktop ? DRAWER_WIDTH : 0,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            borderRight: `1px solid ${divider}`,
          },
        }}
      >
        {drawer}
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, minWidth: 0, bgcolor: 'background.default' }}>
        <AppBar
          position="sticky"
          elevation={0}
          color="inherit"
          sx={{ bgcolor: 'background.paper', borderBottom: `1px solid ${divider}` }}
        >
          <Toolbar sx={{ gap: 1 }}>
            {!isDesktop && (
              <>
                <IconButton edge="start" aria-label="Open menu" onClick={() => setMobileOpen(true)}>
                  <MenuIcon />
                </IconButton>
                <ShulMark size={28} />
                <Typography
                  variant="subtitle1"
                  noWrap
                  sx={{ fontWeight: 700, color: 'primary.dark' }}
                >
                  {org.shortName}
                </Typography>
              </>
            )}
            <Box sx={{ flexGrow: 1 }} />
            <UserMenu />
          </Toolbar>
        </AppBar>
        <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1200, mx: 'auto' }}>{children}</Box>
      </Box>
    </Box>
  );
}
