import { Box } from '@mui/material';
import { colors } from '../../styles/tokens';
export function PriceTimestamp({ value, gap = true }: { value?: string; gap?: boolean }) {
  const date = value ? new Date(value) : undefined;
  return <Box component="span" data-testid="price-timestamp" sx={{ml:gap?'4px':0,color:colors.textMuted,fontSize:10,fontWeight:400,whiteSpace:'nowrap'}}>
    {date && Number.isFinite(date.getTime()) ? date.toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}) : '—'}
  </Box>;
}
