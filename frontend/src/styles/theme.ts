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
    text: { primary: '#F8FAFC', secondary: '#CBD5E1' },
    divider: '#1E293B',
    market: { up: '#F87171', down: '#60A5FA', flat: '#F8FAFC' },
    collection: { success: '#34D399', partial: '#FBBF24', failed: '#F87171' },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: 'Pretendard, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h4: { fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.15 },
    h5: { fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.2 },
    h6: { fontWeight: 750, letterSpacing: '-0.02em' },
    subtitle1: { fontWeight: 750, letterSpacing: '-0.015em' },
    body1: { letterSpacing: '-0.01em' },
    body2: { letterSpacing: '-0.01em' },
    button: { fontWeight: 700, textTransform: 'none' },
  },
  components: {
    MuiCssBaseline: { styleOverrides: { html: { backgroundColor: '#080D18' }, body: { minWidth: 320, overscrollBehavior: 'none', backgroundImage: 'radial-gradient(circle at 50% -10%, rgba(96, 165, 250, 0.09), transparent 34%)' }, '*': { boxSizing: 'border-box' }, '::selection': { background: 'rgba(96, 165, 250, 0.28)' } } },
    MuiCard: { styleOverrides: { root: { backgroundColor: '#111827', backgroundImage: 'linear-gradient(145deg, rgba(255,255,255,0.018), transparent 42%)', border: '1px solid #1E293B', boxShadow: '0 12px 32px rgba(0, 0, 0, 0.16)' } } },
    MuiCardActionArea: { styleOverrides: { root: { transition: 'background-color 160ms ease, transform 160ms ease', '@media (hover: hover)': { '&:hover': { backgroundColor: 'rgba(148, 163, 184, 0.045)' } } } } },
    MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { borderRadius: 8, minHeight: 42 }, contained: { color: '#080D18' } } },
    MuiChip: { styleOverrides: { root: { borderRadius: 6, backgroundColor: 'rgba(148, 163, 184, 0.10)', border: '1px solid rgba(148, 163, 184, 0.12)', '& .MuiChip-labelSmall': { fontSize: 11 } } } },
    MuiTabs: { styleOverrides: { indicator: { height: 3, borderRadius: '3px 3px 0 0' } } },
    MuiTab: { styleOverrides: { root: { fontWeight: 700, minHeight: 48 } } },
    MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 8, backgroundColor: 'rgba(8, 13, 24, 0.42)', '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#475569' }, '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderWidth: 1 } } } },
    MuiTextField: { defaultProps: { size: 'small' } },
  },
});
