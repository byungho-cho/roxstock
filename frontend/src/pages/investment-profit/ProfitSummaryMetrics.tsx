import { Box, Typography } from '@mui/material';
import { colors } from '../../styles/tokens';
import { rate, won, type Totals } from './profitData';
const color = (v: bigint | null) => v === null || v === 0n ? colors.textPrimary : v > 0n ? '#FB7185' : '#60A5FA';
export function ProfitMetric({label,value,denominator}: {label:string;value:bigint|null;denominator?:bigint|null}) {
 return <Box data-testid="profit-metric" sx={{display:'grid',gridTemplateColumns:'minmax(0, 1fr) 64px minmax(0, 40%)',alignItems:'center',gap:'4px',minHeight:24}}><Typography sx={{fontSize:12,lineHeight:'20px'}}>{label}</Typography><Typography data-testid="profit-percent" sx={{fontSize:12,lineHeight:'14px',textAlign:'right',overflowWrap:'anywhere',color:color(value)}}>{denominator !== undefined ? rate(value,denominator) : ''}</Typography><Typography sx={{fontSize:13,fontWeight:600,lineHeight:'20px',textAlign:'right',overflowWrap:'anywhere',fontVariantNumeric:'tabular-nums',color:['매수총액','매도총액'].includes(label)?colors.textPrimary:color(value)}}>{won(value,!['매수총액','매도총액'].includes(label))}</Typography></Box>;
}
export function StockProfitMetrics({totals:t}: {totals:Totals}) {
 return <><ProfitMetric label="매수총액" value={t.buy}/><ProfitMetric label="매도총액" value={t.sell}/><ProfitMetric label="매매손익" value={t.trading} denominator={t.buy}/><ProfitMetric label="배당포함 총손익" value={t.total} denominator={t.buy}/></>;
}
