import type { ReactNode } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { useAuth } from '@/features/auth/useAuth';
import { LoginPage } from '@/features/auth/LoginPage';
import { SetupPage } from '@/features/auth/SetupPage';

/**
 * Decides which of the three states the app is in: still asking the server, nobody signed in
 * (or nobody exists yet), or signed in. The sign-in screens stand alone — no sidebar around them.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { user, needsSetup, isLoading } = useAuth();

  if (isLoading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress aria-label="Loading" />
      </Box>
    );
  }

  if (needsSetup) return <SetupPage />;
  if (!user) return <LoginPage />;
  return <>{children}</>;
}
