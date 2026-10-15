import {QueryErrorNotice} from '../../components/common/QueryErrorNotice';
import {Box,Button,ButtonBase,Stack,Typography} from '@mui/material';
import type {ReactNode} from 'react';
import {AppCard} from '../../components/common/Common';
import {cashAllocation} from '../../utils/cashAllocation';
import {colors} from '../../styles/tokens';
import type {DashboardSummary} from '../../types/models';
import {formatPercent,formatWon,getMarketColor} from '../../utils/format';
import {homeTimestamp} from '../dashboard/HomeListCard';
export type ChartItem={id:string;name:string;percent:number;color:string};
const weightColor=(percent:number,fallback:string)=>percent>50?colors.marketRise:percent>=30?colors.warning:percent<=10?colors.marketFall:fallback;
export function CompositionCard({ onHome,onStocks,onStock,trend, summary, items, mode, onToggle, updating,allocationAvailable,loading=false,failed=false,retry }: {onHome:()=>void;onStocks:()=>void;onStock:(id:string)=>void;trend:ReactNode;loading?:boolean;failed?:boolean;retry:()=>void; summary: DashboardSummary; items: ChartItem[]; mode: 'cumulative' | 'ranked'; onToggle: () => void; updating: boolean;allocationAvailable:boolean }) {
  const {available,stockPercent,cashPercent,stockColor,cashColor,stockBarColor,cashBarColor}=cashAllocation(summary.stockValue,summary.cashBalance,summary.pricingComplete!==false&&allocationAvailable);
  const named = items.filter(item => item.id !== 'other');
  return <AppCard data-testid="asset-composition-card" aria-busy={loading} sx={{ minWidth: 0, position: 'relative', borderRadius: '8px', borderColor: '#25344D', px: '13px', pt: '15px', pb: '10px', overflow: 'visible' }}>
    <Stack direction="row" sx={{alignItems:'center',justifyContent:'space-between',gap:'8px',flexWrap:'wrap',minHeight:24}}><ButtonBase onClick={onHome} aria-label="자산구성 · 홈 보기"><Typography sx={{fontSize:15,fontWeight:600}}>자산구성</Typography></ButtonBase><Typography data-testid="composition-total" sx={{fontSize:16,fontWeight:700,color:getMarketColor(summary.dailyProfit),overflowWrap:'anywhere',minWidth:0}}>{loading?'':formatWon(summary.totalAssets)}</Typography></Stack>
    <>
      <Stack data-testid="composition-amounts" direction="row" sx={{ justifyContent: 'space-between', mt: '16px', height: 16, fontSize: 11, fontWeight: 600, color: stockColor }}><span>{(loading?'':formatWon(summary.stockValue))}</span><Box component="span" sx={{ color: cashColor }}>{(loading?'':formatWon(summary.cashBalance))}</Box></Stack>
      <Stack component={ButtonBase} onClick={onHome} aria-label={`홈 보기 · 주식 ${(loading?'':formatPercent(stockPercent))}, 예수금 ${(loading?'':formatPercent(cashPercent))}`} direction="row" sx={{ alignItems:'stretch', width: '100%', height: 12, borderRadius: '6px', overflow: 'hidden', mt: '4px', bgcolor: colors.raised }}><Box sx={{ width: available?`${stockPercent}%`:0, bgcolor: stockBarColor }} /><Box sx={{ width: available?`${cashPercent}%`:0, bgcolor: cashBarColor }} /></Stack>
      <Stack direction="row" sx={{ justifyContent: 'space-between', mt: '5px', height: 25, borderBottom: '1px solid #25344D', fontSize: 11, fontWeight: 600, color: stockColor }}><Box component="span" sx={{color:stockColor}}>{(loading?'':formatPercent(stockPercent))}</Box><Box component="span" sx={{ color: cashColor }}>{(loading?'':formatPercent(cashPercent))}</Box></Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: '124.8px minmax(0, 1fr)', gap: '8.8px', mt: '16px', height: 178,position:'relative' }}>
        <Box component={ButtonBase} onClick={onStocks} data-testid="asset-donut" aria-label="종목별 자산 구성 도넛 · 종목목록 보기" sx={{ position: 'relative', width: '100%', maxWidth: 124.8, height: 124.8, mt: '15.6px' }}>
          <svg viewBox="0 0 156 156" width="100%" height="124.8" aria-hidden="true"><circle cx="78" cy="78" r="51" fill="none" stroke={colors.raised} strokeWidth="26" />{items.map((item, index) => <circle key={item.id} cx="78" cy="78" r="51" fill="none" stroke={item.color} strokeWidth="26" pathLength="100" strokeDasharray={`${item.percent} ${100 - item.percent}`} strokeDashoffset={-items.slice(0, index).reduce((sum, previous) => sum + previous.percent, 0)} transform="rotate(-90 78 78)" />)}</svg>
          <Stack sx={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', gap: '2.4px' }}><Typography sx={{ fontSize: 10, lineHeight: '12px', color: colors.textMuted }}>주식평가액</Typography><Typography data-testid={loading||!available?undefined:"asset-donut-value"} sx={{ fontSize: 10, lineHeight: '12px', fontWeight: 700, whiteSpace: 'nowrap' }}>{!loading&&Number.isFinite(summary.stockValue) ? `${(summary.stockValue / 10_000).toLocaleString('ko-KR', { maximumFractionDigits: 0 })}만원` : loading?'':'—'}</Typography></Stack>
        </Box>
        {!loading&&!available&&<Box role={failed?'alert':'status'} sx={{position:'absolute',inset:0,display:'grid',placeContent:'center',bgcolor:colors.surface,fontSize:11,color:colors.textMuted,textAlign:'center'}}>{failed?<QueryErrorNotice message="자산구성 조회에 실패했습니다." onRetry={retry}/>:summary.pricingComplete===false?'가격 미수집 종목이 있어 자산구성을 계산할 수 없습니다.':'내용이 없습니다.'}</Box>}
        <Stack data-testid="asset-legend" spacing="11px" sx={{ minWidth: 0 }}>{items.map(item => <Box component={ButtonBase} onClick={()=>item.id==='other'?onStocks():onStock(item.id)} data-testid="asset-legend-row" key={item.id} sx={{ textAlign:'left', display: 'grid', gridTemplateColumns: '8px minmax(0, 1fr) minmax(36px, max-content)', alignItems: 'center', gap: '8px', height: 18 }}><Box sx={{ width: 8, height: 8, bgcolor: item.color, borderRadius: '50%' }} /><Typography noWrap sx={{ fontSize: 11 }}>{item.name}</Typography><Typography sx={{ fontSize: 11, textAlign: 'right', color: weightColor(item.percent,colors.textMuted), whiteSpace: 'nowrap' }}>{formatPercent(item.percent)}</Typography></Box>)}</Stack>
      </Box>
    </>
    {trend}
    <Box data-testid="asset-weights" sx={{ pt: '12px', borderTop: '1px solid #25344D' }}>
        <Stack direction="row" sx={{ height: 24, alignItems: 'center', justifyContent: 'space-between' }}><Typography sx={{ fontSize: 16, fontWeight: 600 }}>종목별 비중</Typography><Button onClick={onToggle} aria-label="종목별 비중 차트 방식 변경" sx={{ minWidth: 62, minHeight: 22, height: 22, borderRadius: '11px', bgcolor: colors.raised, color: colors.focus, fontSize: 10, p: 0 }}>{mode === 'cumulative' ? '누적형' : '순위형'}</Button></Stack>
        <Stack direction="row" role="img" aria-label="종목별 비중 누적 막대" sx={{ mt: '14px', height: 12, borderRadius: '6px', bgcolor: colors.raised, overflow: 'hidden' }}>{items.map(item => <Box key={item.id} sx={{ width: `${item.percent}%`, bgcolor: item.color }} />)}</Stack>
        <Stack data-testid="asset-weight-rows" aria-busy={loading} spacing="9px" sx={{ mt: '16px',minHeight:115,position:'relative' }}>{named.map((item, index) => {
          const offset = mode === 'cumulative' ? named.slice(0, index).reduce((sum, previous) => sum + previous.percent, 0) : 0;
          return <Box component={ButtonBase} onClick={()=>onStock(item.id)} data-testid="asset-weight-row" key={item.id} sx={{ textAlign:'left', display: 'grid', gridTemplateColumns: 'minmax(0, 100px) minmax(0, 1fr) 62px', alignItems: 'center', gap: '8px', height: 16 }}><Typography noWrap sx={{ fontSize: 10.5 }}>{item.name}</Typography><Box sx={{ height: 7, bgcolor: '#202B3E', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}><Box sx={{ width: `${offset}%`, height: '100%', bgcolor: '#2B374B' }} /><Box data-testid="asset-weight-fill" sx={{ position: 'absolute', top: 0, left: `${offset}%`, width: `${item.percent}%`, height: '100%', bgcolor: item.color, borderRadius: '4px' }} /></Box><Typography sx={{ textAlign: 'right', color: weightColor(item.percent,item.color), fontSize: 10.5, fontWeight: 600 }}>{formatPercent(item.percent)}</Typography></Box>;
        })}{!loading&&items.length===0&&<Typography role="status" sx={{position:'absolute',inset:0,display:'grid',placeItems:'center',fontSize:11,color:colors.textMuted}}>내용이 없습니다.</Typography>}</Stack>
      </Box>
    <Typography data-testid="composition-updated-at" sx={{ mt: '24px', fontSize: 10, lineHeight: '20px', color: colors.textSecondary, opacity: .65 }}>갱신 {loading?'':homeTimestamp(summary.collectedAt)}</Typography>
  </AppCard>;
}

