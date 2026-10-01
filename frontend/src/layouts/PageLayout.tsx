import { Box } from '@mui/material';
import type { ReactNode, RefObject } from 'react';
import { pageGutter, pageMetrics } from '../styles/tokens';

export function PageLayout({ children, scrollRef, coverTop = 16, stocks = false, trade = false, journal = false, more = false, home = false, targetFlow = false, assetOverview = false, collectionMonitoring = false }: { children: ReactNode; scrollRef: RefObject<HTMLElement | null>; coverTop?: number; stocks?: boolean; trade?: boolean; journal?: boolean; more?: boolean; home?: boolean; targetFlow?: boolean; assetOverview?: boolean; collectionMonitoring?: boolean }) {
  return <Box component="main" ref={scrollRef} sx={{ flex: 1, minHeight: 0, width: '100%', maxWidth: trade ? 880 : journal ? { xs: 'none', sm: 1100 } : collectionMonitoring ? { xs: 'none', sm: 725 } : { xs: 'none', sm: 816 }, mx: 'auto', px: home ? '16px' : trade || collectionMonitoring ? 0 : { xs: `${pageGutter.xs}px`, sm: `${pageGutter.sm}px` }, pt: trade || collectionMonitoring ? 0 : journal ? '4px' : home ? '8px' : assetOverview ? { xs: '8px', sm: '2px' } : stocks ? '14px' : more ? { xs: '8px', sm: '8px' } : { xs: `${coverTop}px`, sm: '16px' }, pb: home || targetFlow ? '80px' : trade || collectionMonitoring ? 0 : journal ? { xs: '12px', sm: '8px' } : assetOverview ? { xs: '104px', sm: '8px' } : home ? { xs: '16px', sm: '8px' } : more ? { xs: `${pageMetrics.bottomClearance}px`, sm: '8px' } : `${pageMetrics.bottomClearance}px`, overflowY: targetFlow ? 'auto' : collectionMonitoring ? 'auto' : assetOverview || journal ? { xs: 'auto', sm: 'hidden' } : more ? { xs: 'auto', sm: 'hidden' } : 'auto', '@media (min-width: 600px) and (max-height: 424px)': assetOverview || collectionMonitoring ? { overflowY: 'auto' } : {}, overflowX: 'hidden', overscrollBehavior: 'contain', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
    {children}
  </Box>;
}

