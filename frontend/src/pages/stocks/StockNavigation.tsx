import { Box, Button, Typography } from '@mui/material';
import { colors } from '../../styles/tokens';

export function StockNavigation({ symbol, previousName, nextName, onPrevious, onNext }: {
  symbol: string; previousName?: string; nextName?: string; onPrevious: () => void; onNext: () => void;
}) {
  const button = { minWidth: 0, width: '100%', p: 0, minHeight: 14, height: 14, fontSize: 10,
    lineHeight: '14px', color: colors.textMuted, display: 'block', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' };
  return <Box data-testid="stock-navigation" sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', alignItems: 'center', width: '100%' }}>
    <Button aria-label={previousName ? `이전 종목 ${previousName}` : '이전 종목'} title={previousName} disabled={!previousName} onClick={onPrevious} sx={button}>{previousName}</Button>
    <Typography data-testid="stock-navigation-code" sx={{ fontSize: 10, lineHeight: '14px', textAlign: 'center', color: colors.textMuted }}>{symbol}</Typography>
    <Button aria-label={nextName ? `다음 종목 ${nextName}` : '다음 종목'} title={nextName} disabled={!nextName} onClick={onNext} sx={button}>{nextName}</Button>
  </Box>;
}
