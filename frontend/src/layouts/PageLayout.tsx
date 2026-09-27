import { Box } from '@mui/material';
import type { ReactNode, RefObject } from 'react';
import { pageGutter, pageMetrics } from '../styles/tokens';

export function PageLayout({ children, scrollRef, coverTop = 16, stocks = false, trade = false }: { children: ReactNode; scrollRef: RefObject<HTMLElement | null>; coverTop?: number; stocks?: boolean; trade?: boolean }) {
  return <Box component="main" ref={scrollRef} sx={{ flex: 1, minHeight: 0, width: '100%', maxWidth: trade ? 880 : { xs: 'none', sm: 816 }, mx: 'auto', px: trade ? 0 : { xs: `${pageGutter.xs}px`, sm: `${pageGutter.sm}px` }, pt: trade ? 0 : stocks ? '14px' : { xs: `${coverTop}px`, sm: '16px' }, pb: trade ? 0 : `${pageMetrics.bottomClearance}px`, overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
    {children}
  </Box>;
}
