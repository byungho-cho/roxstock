import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: { mode: 'dark', primary: { main: '#60a5fa' }, secondary: { main: '#34d399' }, background: { default: '#080d18', paper: '#111827' } },
  shape: { borderRadius: 16 },
  typography: { fontFamily: 'Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', h5: { fontWeight: 800 }, h6: { fontWeight: 750 }, button: { fontWeight: 700, textTransform: 'none' } },
  components: { MuiCard: { styleOverrides: { root: { backgroundImage: 'none', border: '1px solid rgba(148, 163, 184, 0.12)' } } } },
});
