import { alpha, createTheme, darken, lighten } from '@mui/material/styles';

// The theme is built from the shul's two colors (Settings → Organization), so each
// install looks like its own shul. Shades are derived, not configured.

export function createAppTheme(primary: string, secondary: string) {
  const dark = darken(primary, 0.35);
  return createTheme({
    palette: {
      mode: 'light',
      primary: { main: primary, dark, light: lighten(primary, 0.9) },
      secondary: { main: secondary },
      success: { main: '#2E7D32' },
      background: { default: '#FAFAFA', paper: '#FFFFFF' },
    },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: `"Roboto", "Heebo", "Arial Hebrew", sans-serif`,
      h4: { fontWeight: 700, color: dark },
      h5: { fontWeight: 700, color: dark },
      h6: { fontWeight: 600 },
      button: { textTransform: 'none', fontWeight: 600 },
    },
    components: {
      MuiButton: {
        defaultProps: { variant: 'contained' },
        styleOverrides: {
          root: { borderRadius: 10 },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            boxShadow: `0 1px 3px ${alpha(dark, 0.08)}`,
            border: `1px solid ${alpha(primary, 0.08)}`,
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: 'none' },
        },
      },
    },
  });
}
