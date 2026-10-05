import { Box } from '@mui/material';
import { colors } from '../../styles/tokens';
export function PriceTimestamp({ value }: { value?: string }) {
  const date = value ? new Date(value) : undefined;
  return <Box component="span" data-testid="price-timestamp" sx={{ml:'4px',color:colors.textMuted,fontSize:10,fontWeight:400,whiteSpace:'nowrap'}}>
    {date && Number.isFinite(date.getTime()) ? date.toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}) : '—'}
  </Box>;
}
