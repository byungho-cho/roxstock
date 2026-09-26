import { createTheme } from '@mui/material/styles';
import { colors, radius } from './tokens';

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: colors.focus }, secondary: { main: colors.warning }, success: { main: colors.positive }, error: { main: colors.error }, warning: { main: colors.warning },
    background: { default: colors.canvas, paper: colors.surface }, text: { primary: colors.textPrimary, secondary: colors.textSecondary }, divider: colors.border,
    market: { up: colors.marketRise, down: colors.marketFall, flat: colors.marketFlat }, collection: { success: colors.positive, partial: colors.warning, failed: colors.error },
  },
  shape: { borderRadius: radius.sm },
  typography: {
    fontFamily: 'Inter, Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h4: { fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.15 },
    h5: { fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.2 },
    h6: { fontWeight: 750, letterSpacing: '-0.02em' },
    subtitle1: { fontWeight: 750, letterSpacing: '-0.015em' },
    body1: { letterSpacing: '-0.01em' },
    body2: { letterSpacing: '-0.01em' },
    button: { fontWeight: 700, textTransform: 'none' },
  },
  components: {
    MuiCssBaseline: { styleOverrides: {
      html: { backgroundColor: '#080D18', colorScheme: 'dark', scrollbarWidth: 'none' },
      body: { minWidth: 320, overscrollBehavior: 'none', backgroundImage: 'none' },
      'html::-webkit-scrollbar': { display: 'none', width: 0 },
      '*': {
        boxSizing: 'border-box',
        scrollbarWidth: 'thin',
        scrollbarColor: `${colors.borderStrong} transparent`,
      },
      '*::-webkit-scrollbar': { width: 6, height: 6 },
      '*::-webkit-scrollbar-track': { backgroundColor: 'transparent' },
      '*::-webkit-scrollbar-thumb': {
        backgroundColor: colors.borderStrong,
        borderRadius: radius.full,
        border: '1px solid transparent',
        backgroundClip: 'content-box',
      },
      '*::-webkit-scrollbar-thumb:hover': { backgroundColor: colors.textMuted },
      '::selection': { background: 'rgba(96, 165, 250, 0.28)' },
    } },
    MuiCard: { styleOverrides: { root: { backgroundColor: colors.surface, backgroundImage: 'none', border: `1px solid ${colors.border}`, boxShadow: 'none' } } },
    MuiCardActionArea: { styleOverrides: { root: { transition: 'background-color 160ms ease, transform 160ms ease', '@media (hover: hover)': { '&:hover': { backgroundColor: 'rgba(148, 163, 184, 0.045)' } } } } },
    MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { borderRadius: radius.md, minHeight: 42 }, contained: { color: colors.canvas } } },
    MuiChip: { styleOverrides: { root: { borderRadius: 6, backgroundColor: 'rgba(148, 163, 184, 0.10)', border: '1px solid rgba(148, 163, 184, 0.12)', '& .MuiChip-labelSmall': { fontSize: 11 } } } },
    MuiTabs: { styleOverrides: { indicator: { height: 3, borderRadius: '3px 3px 0 0' } } },
    MuiTab: { styleOverrides: { root: { fontWeight: 700, minHeight: 48 } } },
    MuiOutlinedInput: { styleOverrides: { root: { borderRadius: radius.md, backgroundColor: colors.raised, '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: colors.borderStrong }, '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderWidth: 1, borderColor: colors.focus }, '&.Mui-error .MuiOutlinedInput-notchedOutline': { borderColor: colors.error }, '&.Mui-disabled': { opacity: 0.55 } } } },
    MuiInputBase: { styleOverrides: { input: { '&::-webkit-outer-spin-button, &::-webkit-inner-spin-button': { WebkitAppearance: 'none', margin: 0 }, '&[type=number]': { MozAppearance: 'textfield' } } } },
    MuiTextField: { defaultProps: { size: 'small' } },
  },
});
