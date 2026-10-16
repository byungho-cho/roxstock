import {Stack,Typography} from '@mui/material';
import {AppCard} from './Common';
import {colors} from '../../styles/tokens';
import type {DashboardSummary} from '../../types/models';
import {formatPercent,formatSignedWon,formatWon,getMarketColor} from '../../utils/format';
export function PerformanceCard({ summary, profit, rate,loading=false,onClick }: { loading?:boolean; onClick?:()=>void; summary: DashboardSummary; profit: number; rate: number }) {
  const rows = [
    { label: '매입금액', value: formatWon(summary.stockPurchaseAmount), color: colors.textPrimary },
    { label: '평가손익', value: formatWon(profit), color: getMarketColor(profit) },
    { label: '주식평가액', value: formatWon(summary.stockValue), color: getMarketColor(profit) },
  ];
  return <AppCard onClick={onClick} role={onClick?"button":undefined} tabIndex={onClick?0:undefined} aria-label={onClick?"평가손익 · 투자금 보기":undefined} onKeyDown={event=>{if(onClick&&(event.key==="Enter"||event.key===" ")){event.preventDefault();onClick();}}} data-testid="asset-performance-card" sx={{ cursor:onClick?'pointer':undefined,'&:focus-visible':{outline:'2px solid '+colors.focus,outlineOffset:2}, display: 'flex', flexDirection: 'column', gap: '4px', borderRadius: '8px', borderColor: '#25344D', px: '14px', py: '8px', minWidth: 0, '& .MuiTypography-root:not(h2)': { lineHeight: '20px' } }}>
    <Stack data-testid="performance-heading" direction="row" sx={{alignItems:'center',justifyContent:'space-between',height:24,mb:'4px'}}><Typography component="h2" sx={{fontSize:16,fontWeight:600,lineHeight:'24px'}}>평가손익</Typography>{onClick && <Typography component="span" sx={{fontSize:11,color:colors.textMuted}}>상세보기 ›</Typography>}</Stack>
    {rows.map(row => <Stack data-testid="performance-row" key={row.label} sx={{height:20,display:'grid',gridTemplateColumns:'minmax(0,1fr) auto minmax(0,1fr)',columnGap:'4px',alignItems:'center'}}>
      <Typography sx={{fontSize:12,color:colors.textSecondary}}>{row.label}</Typography>
      {row.label==='평가손익'?<Typography data-testid="performance-profit-rate" sx={{fontSize:12,fontWeight:600,textAlign:'center',whiteSpace:'nowrap',color:getMarketColor(rate)}}>{loading?'':formatPercent(rate)}</Typography>:<span/>}
      <Typography data-testid={row.label==='평가손익'?'performance-profit-value':undefined} sx={{fontSize:12,fontWeight:600,color:row.color,whiteSpace:'nowrap',textAlign:'right'}}>{loading?'':row.value}</Typography>
    </Stack>)}
    <Stack data-testid="asset-previous-day" sx={{height:20,display:'grid',gridTemplateColumns:'minmax(0,1fr) auto minmax(0,1fr)',alignItems:'center',columnGap:'4px'}}>
      <Typography sx={{fontSize:12,color:colors.textSecondary}}>전일 대비</Typography>
      <Typography data-testid="previous-day-rate" sx={{fontSize:12,fontWeight:600,height:20,textAlign:'center',whiteSpace:'nowrap',color:getMarketColor(summary.previousDayChangeRate??NaN)}}>{loading?'':formatPercent(summary.previousDayChangeRate??NaN)}</Typography>
      <Typography data-testid="previous-day-amount" sx={{fontSize:12,height:20,textAlign:'right',fontWeight:600,whiteSpace:'nowrap',color:getMarketColor(summary.previousDayChange??NaN)}}>{loading?'':formatSignedWon(summary.previousDayChange??NaN)}</Typography>
    </Stack>
  </AppCard>;
}
