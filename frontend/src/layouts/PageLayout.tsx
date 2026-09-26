import { Box } from '@mui/material';
import type { ReactNode } from 'react';
import { pageGutter, pageMetrics } from '../styles/tokens';

export function PageLayout({ children, embeddedHeader = false, trade = false }: { children: ReactNode; embeddedHeader?: boolean; trade?: boolean }) {
  return <Box component="main" sx={{ width: '100%', maxWidth: trade ? 880 : { xs: 'none', sm: 816 }, mx: 'auto', px: trade ? 0 : { xs: `${pageGutter.xs}px`, sm: `${pageGutter.sm}px` }, pt: trade ? 0 : `${embeddedHeader ? pageMetrics.top : pageMetrics.gap}px`, pb: trade ? 0 : `${pageMetrics.bottomClearance}px` }}>
    {children}
  </Box>;
}
