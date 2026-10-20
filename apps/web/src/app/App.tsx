import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { AppShell } from './layout/AppShell';
import { AuthGate } from '@/features/auth/AuthGate';
import { useAuth } from '@/features/auth/useAuth';

// Route-level code splitting: each page is its own chunk, loaded on navigation.
// Pages use named exports, so we adapt them to the default export React.lazy expects.
const DashboardPage = lazy(() =>
  import('@/features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const FamiliesPage = lazy(() =>
  import('@/features/families/FamiliesPage').then((m) => ({ default: m.FamiliesPage })),
);
const MembersPage = lazy(() =>
  import('@/features/members/MembersPage').then((m) => ({ default: m.MembersPage })),
);
const PledgesDonationsPage = lazy(() =>
  import('@/features/pledges/PledgesDonationsPage').then((m) => ({
    default: m.PledgesDonationsPage,
  })),
);
const SettingsPage = lazy(() =>
  import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const CalendarPage = lazy(() =>
  import('@/features/calendar/CalendarPage').then((m) => ({ default: m.CalendarPage })),
);
const UpcomingDatesPage = lazy(() =>
  import('@/features/dates/UpcomingDatesPage').then((m) => ({ default: m.UpcomingDatesPage })),
);
const EventsPage = lazy(() =>
  import('@/features/events/EventsPage').then((m) => ({ default: m.EventsPage })),
);
const ReportsPage = lazy(() =>
  import('@/features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })),
);
const UsersPage = lazy(() =>
  import('@/features/users/UsersPage').then((m) => ({ default: m.UsersPage })),
);
const PortalApp = lazy(() =>
  import('@/features/portal/PortalApp').then((m) => ({ default: m.PortalApp })),
);
const SponsorshipsPage = lazy(() =>
  import('@/features/sponsorships/SponsorshipsPage').then((m) => ({ default: m.SponsorshipsPage })),
);
const WelcomePage = lazy(() =>
  import('@/features/auth/WelcomePage').then((m) => ({ default: m.WelcomePage })),
);

// Printable documents, without the app's sidebar (Print → Save as PDF).
const print = (
  name:
    | 'ReceiptPrint'
    | 'StatementPrint'
    | 'StatementsPrint'
    | 'YahrzeitLettersPrint'
    | 'YahrzeitListPrint',
) => lazy(() => import('@/features/print/PrintPages').then((m) => ({ default: m[name] })));
const ReceiptPrint = print('ReceiptPrint');
const StatementPrint = print('StatementPrint');
const StatementsPrint = print('StatementsPrint');
const YahrzeitLettersPrint = print('YahrzeitLettersPrint');
const YahrzeitListPrint = print('YahrzeitListPrint');

function RouteFallback() {
  return (
    <Box
      sx={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <CircularProgress />
    </Box>
  );
}

function MainRoutes() {
  return (
    <AppShell>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/families" element={<FamiliesPage />} />
          <Route path="/members" element={<MembersPage />} />
          <Route path="/pledges" element={<PledgesDonationsPage />} />
          <Route path="/dates" element={<UpcomingDatesPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/sponsorships" element={<SponsorshipsPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}

/** Everything behind the sign-in screen: the printable pages and the app itself. */
function SignedInRoutes() {
  const { user } = useAuth();
  // A member login only ever sees the portal: the office's app is not theirs, whatever
  // address they type. Staff reach the portal's data through the ordinary pages instead.
  if (user?.role === 'member') return <PortalApp />;

  return (
    <Routes>
      <Route path="/print/receipt/:donationId" element={<ReceiptPrint />} />
      <Route path="/print/statement/:familyId" element={<StatementPrint />} />
      <Route path="/print/statements" element={<StatementsPrint />} />
      <Route path="/print/yahrzeit-letters" element={<YahrzeitLettersPrint />} />
      <Route path="/print/yahrzeit-list" element={<YahrzeitListPrint />} />
      <Route path="*" element={<MainRoutes />} />
    </Routes>
  );
}

export function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        {/* The one page someone who is not signed in can reach: their invitation or reset link. */}
        <Route path="/welcome/:token" element={<WelcomePage />} />
        <Route
          path="*"
          element={
            <AuthGate>
              <SignedInRoutes />
            </AuthGate>
          }
        />
      </Routes>
    </Suspense>
  );
}
