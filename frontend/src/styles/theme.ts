import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#60A5FA' },
    secondary: { main: '#FBBF24' },
    success: { main: '#34D399' },
    error: { main: '#F87171' },
    warning: { main: '#FBBF24' },
    background: { default: '#080D18', paper: '#111827' },
    text: { primary: '#F8FAFC', secondary: '#94A3B8' },
    divider: 'rgba(148, 163, 184, 0.14)',
    market: { up: '#F87171', down: '#60A5FA', flat: '#F8FAFC' },
    collection: { success: '#34D399', partial: '#FBBF24', failed: '#F87171' },
  },
  shape: { borderRadius: 16 },
  typography: {
    fontFamily: 'Pretendard, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h5: { fontWeight: 800, letterSpacing: '-0.02em' },
    h6: { fontWeight: 750, letterSpacing: '-0.015em' },
    subtitle1: { fontWeight: 750 },
    button: { fontWeight: 700, textTransform: 'none' },
  },
  components: {
    MuiCssBaseline: { styleOverrides: { html: { backgroundColor: '#080D18' }, body: { minWidth: 320, overscrollBehavior: 'none' }, '*': { boxSizing: 'border-box' } } },
    MuiCard: { styleOverrides: { root: { backgroundImage: 'none', border: '1px solid rgba(148, 163, 184, 0.12)', boxShadow: 'none' } } },
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiTextField: { defaultProps: { size: 'small' } },
  },
});
