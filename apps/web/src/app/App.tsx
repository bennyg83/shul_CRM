import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { AppShell } from './layout/AppShell';

// Route-level code splitting: each page is its own chunk, loaded on navigation.
// Pages use named exports, so we adapt them to the default export React.lazy expects.
const DashboardPage = lazy(
  () => import('@/features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const FamiliesPage = lazy(
  () => import('@/features/families/FamiliesPage').then((m) => ({ default: m.FamiliesPage })),
);
const MembersPage = lazy(
  () => import('@/features/members/MembersPage').then((m) => ({ default: m.MembersPage })),
);
const PledgesDonationsPage = lazy(
  () => import('@/features/pledges/PledgesDonationsPage').then((m) => ({ default: m.PledgesDonationsPage })),
);
const SettingsPage = lazy(
  () => import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const PlaceholderPage = lazy(
  () => import('@/features/placeholder/PlaceholderPage').then((m) => ({ default: m.PlaceholderPage })),
);
const UpcomingDatesPage = lazy(
  () => import('@/features/dates/UpcomingDatesPage').then((m) => ({ default: m.UpcomingDatesPage })),
);

function RouteFallback() {
  return (
    <Box sx={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <CircularProgress />
    </Box>
  );
}

export function App() {
  return (
    <AppShell>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/families" element={<FamiliesPage />} />
          <Route path="/members" element={<MembersPage />} />
          <Route path="/pledges" element={<PledgesDonationsPage />} />
          <Route path="/dates" element={<UpcomingDatesPage />} />
          <Route
            path="/calendar"
            element={<PlaceholderPage title="Calendar" description="Upcoming dates and events." />}
          />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
