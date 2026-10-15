import {
  Box,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

import DashboardIcon from '@mui/icons-material/Dashboard';
import PeopleIcon from '@mui/icons-material/People';
import GroupsIcon from '@mui/icons-material/Groups';
import EventNoteIcon from '@mui/icons-material/EventNote';
import StarIcon from '@mui/icons-material/Star';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import SettingsIcon from '@mui/icons-material/Settings';
import { palette } from '@/app/theme';

const DRAWER_WIDTH = 256;

interface NavItem {
  label: string;
  path: string;
  icon: ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: <DashboardIcon /> },
  { label: 'Families', path: '/families', icon: <GroupsIcon /> },
  { label: 'Members', path: '/members', icon: <PeopleIcon /> },
  { label: 'Pledges & Donations', path: '/pledges', icon: <StarIcon /> },
  { label: 'Important Dates', path: '/dates', icon: <EventNoteIcon /> },
  { label: 'Calendar', path: '/calendar', icon: <CalendarMonthIcon /> },
  { label: 'Settings', path: '/settings', icon: <SettingsIcon /> },
];

export function AppShell({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const location = useLocation();

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Drawer
        variant={isDesktop ? 'permanent' : 'temporary'}
        open={isDesktop}
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            borderRight: `1px solid ${palette.purple.light}`,
          },
        }}
      >
        <Toolbar sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 2,
              background: `linear-gradient(135deg, ${palette.purple.primary}, ${palette.purple.medium})`,
              display: 'grid',
              placeItems: 'center',
              color: palette.gold.primary,
              fontWeight: 800,
            }}
          >
            P
          </Box>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: palette.purple.dark, lineHeight: 1.1 }}>
              Pilzno
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Synagogue CRM
            </Typography>
          </Box>
        </Toolbar>
        <List sx={{ px: 1.5, py: 1 }}>
          {NAV_ITEMS.map((item) => {
            const active = location.pathname === item.path;
            return (
              <ListItemButton
                key={item.path}
                component="a"
                href={item.path}
                sx={{
                  mb: 0.5,
                  borderRadius: 2,
                  color: active ? palette.purple.primary : 'text.primary',
                  bgcolor: active ? palette.purple.light : 'transparent',
                  fontWeight: active ? 700 : 500,
                  '& .MuiListItemIcon-root': { color: active ? palette.purple.primary : 'text.secondary' },
                }}
              >
                <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            );
          })}
        </List>
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, minWidth: 0, bgcolor: 'background.default' }}>
        <Toolbar sx={{ position: 'sticky', top: 0, zIndex: 10, bgcolor: 'background.paper', borderBottom: `1px solid ${palette.purple.light}` }} />
        <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1200, mx: 'auto' }}>{children}</Box>
      </Box>
    </Box>
  );
}
