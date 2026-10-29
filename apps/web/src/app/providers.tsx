import { useEffect, useMemo, type ReactNode } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { APP_BASENAME } from '@/config/api';
import { createAppTheme } from './theme';
import { useSettings } from '@/features/settings/useSettings';
import { logoUrl } from '@/features/core/service';
import { initials } from './initials';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

/** A favicon of the shul's initials on its color, for installs without a logo. */
function initialsIcon(text: string, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${color}"/><text x="32" y="42" font-family="Arial,sans-serif" font-size="${text.length > 1 ? 26 : 34}" font-weight="700" fill="#fff" text-anchor="middle">${text}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Theme, tab title and favicon follow the shul's settings. */
function ShulTheme({ children }: { children: ReactNode }) {
  const { org, hasLogo, logoVersion, loaded } = useSettings();
  const theme = useMemo(
    () => createAppTheme(org.primaryColor, org.secondaryColor),
    [org.primaryColor, org.secondaryColor],
  );

  useEffect(() => {
    if (!loaded) return;
    document.title = `${org.shortName} CRM`;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = hasLogo
      ? logoUrl(logoVersion)
      : initialsIcon(initials(org.shortName), org.primaryColor);
  }, [loaded, org.shortName, org.primaryColor, hasLogo, logoVersion]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ShulTheme>
        <BrowserRouter basename={APP_BASENAME}>{children}</BrowserRouter>
      </ShulTheme>
    </QueryClientProvider>
  );
}
