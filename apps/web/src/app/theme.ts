import { createTheme, type ThemeOptions } from '@mui/material/styles';

// Pilzno Synagogue palette (from the authentic emblem)
const palette = {
  purple: {
    primary: '#4A148C',
    dark: '#2E0058',
    medium: '#6A1B9A',
    light: '#F3E5F5',
  },
  gold: {
    primary: '#FFD700',
    soft: '#FFF8D6',
    dark: '#B8860B',
  },
  green: '#2E7D32',
  background: '#FAFAFA',
};

const themeOptions: ThemeOptions = {
  palette: {
    mode: 'light',
    primary: { main: palette.purple.primary, dark: palette.purple.dark, light: palette.purple.light },
    secondary: { main: palette.gold.dark },
    success: { main: palette.green },
    background: { default: palette.background, paper: '#FFFFFF' },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: `"Roboto", "Heebo", "Arial Hebrew", sans-serif`,
    h4: { fontWeight: 700, color: palette.purple.dark },
    h5: { fontWeight: 700, color: palette.purple.dark },
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
          boxShadow: '0 1px 3px rgba(46, 0, 88, 0.08)',
          border: '1px solid rgba(74, 20, 140, 0.08)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },
  },
};

export const theme = createTheme(themeOptions);
export { palette };
