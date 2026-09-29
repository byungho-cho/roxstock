import { Box } from '@mui/material';
import type { ReactNode, RefObject } from 'react';
import { pageGutter, pageMetrics } from '../styles/tokens';

export function PageLayout({ children, scrollRef, coverTop = 16, stocks = false, trade = false, journal = false, more = false, home = false, assetOverview = false }: { children: ReactNode; scrollRef: RefObject<HTMLElement | null>; coverTop?: number; stocks?: boolean; trade?: boolean; journal?: boolean; more?: boolean; home?: boolean; assetOverview?: boolean }) {
  return <Box component="main" ref={scrollRef} sx={{ flex: 1, minHeight: 0, width: '100%', maxWidth: trade ? 880 : journal ? { xs: 'none', sm: 1100 } : { xs: 'none', sm: 816 }, mx: 'auto', px: trade ? 0 : { xs: `${pageGutter.xs}px`, sm: `${pageGutter.sm}px` }, pt: trade ? 0 : assetOverview ? '2px' : journal ? '4px' : home ? { xs: '8px', sm: '2px' } : stocks ? '14px' : more ? { xs: '8px', sm: '8px' } : { xs: `${coverTop}px`, sm: '16px' }, pb: trade ? 0 : journal ? { xs: '12px', sm: '8px' } : assetOverview ? { xs: '104px', sm: '8px' } : home ? { xs: '16px', sm: '8px' } : more ? { xs: `${pageMetrics.bottomClearance}px`, sm: '8px' } : `${pageMetrics.bottomClearance}px`, overflowY: assetOverview || journal ? { xs: 'auto', sm: 'hidden' } : more ? { xs: 'auto', sm: 'hidden' } : 'auto', overflowX: 'hidden', overscrollBehavior: 'contain', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
    {children}
  </Box>;
}
